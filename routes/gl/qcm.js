const express = require('express');
const { queryAll, queryOne, execute, withTransaction } = require('../../database');
const { recordGlQcmAttemptIfGatingEnabled } = require('../../lib/learningGatingRuntime');
const { requireGlPermission } = require('../../middleware/requireGlAuth');
const { getGameplaySettings } = require('../../lib/glSettings');
const {
  resolveImportRows,
  applyQcmImport,
  MAX_IMPORT_ROWS,
  buildQcmTemplateWorkbook,
  buildQcmExportWorkbook,
  loadQcmExportRows,
  combineKeywords,
} = require('../../lib/glQcmImport');
const {
  loadAdminQuestionDetail,
  allocateNextGlQcmQuestionCode,
  listAdminQuestions,
  upsertGlQcmQuestion,
} = require('../../lib/glQcmCrud');
const {
  presentQuestion,
  verifyPresentationAnswer,
  resolveQcmAnswerFeedback,
} = require('../../lib/glQcmChoices');
const {
  buildGlossaryLookupMap,
  matchGlossaryTermsForSpecies,
} = require('../../lib/glGlossaryMatch');
const { normalizeOptionalString } = require('../../lib/shared/httpHelpers');
const { validate } = require('../../lib/validate');
const { glQcmPoolPreviewQuerySchema } = require('../../lib/glQuerySchemas');
const { parseBiomeSlugsFromQuery, loadBiomesForChapterIds } = require('../../lib/glChapterBiomes');
const { previewQuestionPool } = require('../../lib/glMarkerQuestionPool');
const { normalizeQuestionPool } = require('../../lib/glMarkerEventConfig');
const asyncHandler = require('../../lib/asyncHandler');

const router = express.Router();

function normalizeBiomeSlug(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function normalizeQuestionCode(value) {
  const s = String(value || '')
    .trim()
    .toUpperCase();
  return s.length > 0 ? s : null;
}

const QUESTION_SELECT = `
  SELECT question_code, biome_slug, categorie_slug, numero_dans_categorie, question,
         choix_a, choix_b, choix_c, choix_d, choix_e,
         reponse_correcte, reponse_texte, niveau, difficulte, difficulte_label,
         notes_pedagogiques, tags, mots_cles,
         photo_url, photo_url_hd, photo_description_url, photo_filename, photo_credit,
         photo_licence, photo_licence_url, photo_legende, photo_sujet,
         wikipedia_title, wikipedia_url, photo_method, statut,
         feedback_correct, feedback_a, feedback_b, feedback_c, feedback_d, feedback_e
    FROM gl_qcm_questions
`;

async function loadGlossaryLookup() {
  const rows = await queryAll(
    `SELECT glossary_code, terme, variantes, categorie, definition_courte
       FROM gl_glossary_terms WHERE statut = 'actif'`,
  );
  return buildGlossaryLookupMap(rows);
}

async function enrichQuestionWithGlossary(questionRow, glossaryByKey) {
  if (!questionRow) return [];
  return matchGlossaryTermsForSpecies(combineKeywords(questionRow), glossaryByKey);
}

async function loadActiveQuestion(code) {
  return queryOne(`${QUESTION_SELECT} WHERE question_code = ? AND statut = 'actif' LIMIT 1`, [
    code,
  ]);
}

/** GET /api/gl/qcm/categories */
router.get(
  '/qcm/categories',
  requireGlPermission('gl.read'),
  asyncHandler(async (_req, res) => {
    const items = await queryAll(
      `SELECT slug, nom, emoji, description, order_index
       FROM gl_qcm_categories
      ORDER BY order_index ASC, nom ASC`,
    );
    return res.json(items);
  }),
);

/** GET /api/gl/qcm/questions — liste filtrée (ordre canonique). */
router.get(
  '/qcm/questions',
  requireGlPermission('gl.read'),
  asyncHandler(async (req, res) => {
    const biomeSlug = normalizeBiomeSlug(req.query?.biomeSlug);
    const categorieSlug = normalizeOptionalString(req.query?.categorieSlug);
    const q = normalizeOptionalString(req.query?.q);

    const params = [];
    let sql = `${QUESTION_SELECT} WHERE statut = 'actif'`;
    if (biomeSlug) {
      sql += ' AND biome_slug = ?';
      params.push(biomeSlug);
    }
    if (categorieSlug) {
      sql += ' AND categorie_slug = ?';
      params.push(categorieSlug);
    }
    sql += ' ORDER BY biome_slug ASC, categorie_slug ASC, numero_dans_categorie ASC';

    let rows = await queryAll(sql, params);
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter((row) => {
        const hay = `${row.question} ${row.tags || ''} ${row.mots_cles || ''}`.toLowerCase();
        return hay.includes(needle);
      });
    }

    const glossaryByKey = await loadGlossaryLookup();
    const items = await Promise.all(
      rows.map(async (row) => ({
        question_code: row.question_code,
        biome_slug: row.biome_slug,
        categorie_slug: row.categorie_slug,
        numero_dans_categorie: row.numero_dans_categorie,
        question: row.question,
        niveau: row.niveau,
        difficulte: row.difficulte,
        difficulte_label: row.difficulte_label,
        reponse_correcte: row.reponse_correcte,
        glossaryTerms: await enrichQuestionWithGlossary(row, glossaryByKey),
      })),
    );

    return res.json({ items });
  }),
);

function parseCsvQuery(value) {
  const raw = normalizeOptionalString(value);
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** GET /api/gl/qcm/pool-preview — aperçu pool questions pour config repère (admin). */
// O7 — chapterId/difficulteMin/difficulteMax via le schéma partagé glQcmPoolPreviewQuerySchema
// (coercition permissive, jamais de 400 issu du schéma) ; le 400 « biomeSlugs ou chapterId
// requis » historique reste décidé par le handler, condition inchangée. Les filtres texte/CSV
// restent lus manuellement sur req.query.
router.get(
  '/qcm/pool-preview',
  requireGlPermission('gl.content.manage'),
  validate({ query: glQcmPoolPreviewQuerySchema }),
  asyncHandler(async (req, res) => {
    let biomeSlugs = parseBiomeSlugsFromQuery(req.query);
    const chapterId = req.validatedQuery?.chapterId;
    if (chapterId != null && Number.isFinite(chapterId)) {
      const biomesMap = await loadBiomesForChapterIds({ queryAll }, [chapterId]);
      const chapterBiomes = biomesMap.get(chapterId) || [];
      const chapterSlugs = chapterBiomes.map((b) => b.slug);
      biomeSlugs = biomeSlugs.length > 0 ? biomeSlugs : chapterSlugs;
    }
    if (biomeSlugs.length === 0) {
      return res.status(400).json({ error: 'biomeSlugs ou chapterId requis' });
    }

    const pool = normalizeQuestionPool({
      biomeMode: 'custom',
      biomeSlugs,
      categorieSlugs: parseCsvQuery(req.query?.categorieSlugs || req.query?.categorieSlug),
      niveaux: parseCsvQuery(req.query?.niveaux || req.query?.niveau),
      difficulteMin: req.validatedQuery?.difficulteMin,
      difficulteMax: req.validatedQuery?.difficulteMax,
      searchQuery: normalizeOptionalString(req.query?.q) || '',
      selectedQuestionCodes: parseCsvQuery(req.query?.selectedQuestionCodes),
    });

    const items = await previewQuestionPool({ queryAll }, { pool, chapterBiomeSlugs: biomeSlugs });
    return res.json({ items, total: items.length });
  }),
);

/** GET /api/gl/qcm/draw — tirage aléatoire dans un pool biome(s)/catégorie. */
router.get(
  '/qcm/draw',
  requireGlPermission('gl.read'),
  asyncHandler(async (req, res) => {
    const biomeSlugs = parseBiomeSlugsFromQuery(req.query);
    if (biomeSlugs.length === 0) {
      return res.status(400).json({ error: 'biomeSlug ou biomeSlugs requis' });
    }
    const categorieSlug = normalizeOptionalString(req.query?.categorieSlug);
    const excludeRaw = normalizeOptionalString(req.query?.exclude);
    const exclude = excludeRaw
      ? excludeRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const biomePlaceholders = biomeSlugs.map(() => '?').join(', ');
    const params = [...biomeSlugs];
    let sql = `${QUESTION_SELECT} WHERE statut = 'actif' AND biome_slug IN (${biomePlaceholders})`;
    if (categorieSlug) {
      sql += ' AND categorie_slug = ?';
      params.push(categorieSlug);
    }
    if (exclude.length > 0) {
      sql += ` AND question_code NOT IN (${exclude.map(() => '?').join(', ')})`;
      params.push(...exclude);
    }

    const pool = await queryAll(sql, params);
    if (pool.length === 0) return res.status(404).json({ error: 'Aucune question disponible' });
    const picked = pool[Math.floor(Math.random() * pool.length)];
    return res.json({ question_code: picked.question_code });
  }),
);

/** GET /api/gl/qcm/questions/:code/present — mélange les choix à chaque appel. */
router.get(
  '/qcm/questions/:code/present',
  requireGlPermission('gl.read'),
  asyncHandler(async (req, res) => {
    const code = normalizeQuestionCode(req.params.code);
    if (!code) return res.status(400).json({ error: 'Code invalide' });

    const row = await loadActiveQuestion(code);
    if (!row) return res.status(404).json({ error: 'Question introuvable' });

    const glossaryByKey = await loadGlossaryLookup();
    const glossaryTerms = await enrichQuestionWithGlossary(row, glossaryByKey);

    try {
      const presentation = presentQuestion(row, glossaryTerms);
      return res.json(presentation);
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Présentation impossible' });
    }
  }),
);

/** POST /api/gl/qcm/questions/:code/answer — validation sans score partie. */
router.post(
  '/qcm/questions/:code/answer',
  requireGlPermission('gl.read'),
  asyncHandler(async (req, res) => {
    const code = normalizeQuestionCode(req.params.code);
    if (!code) return res.status(400).json({ error: 'Code invalide' });

    const row = await loadActiveQuestion(code);
    if (!row) return res.status(404).json({ error: 'Question introuvable' });

    try {
      const result = verifyPresentationAnswer(
        req.body?.presentationToken,
        code,
        req.body?.choiceId,
      );
      const glossaryByKey = await loadGlossaryLookup();
      const glossaryTerms = await enrichQuestionWithGlossary(row, glossaryByKey);
      // Tentative par lecteur + auto-marquage des ressources liees (inerte si gating OFF).
      await recordGlQcmAttemptIfGatingEnabled(
        { queryAll, queryOne, execute },
        { glAuth: req.glAuth, dataset: 'qcm', questionCode: code, isCorrect: result.correct },
      );
      return res.json({
        correct: result.correct,
        feedback: resolveQcmAnswerFeedback(row, result),
        correctChoiceId: result.correct ? result.correctChoiceId : undefined,
        glossaryTerms: result.correct ? glossaryTerms : undefined,
      });
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Réponse invalide' });
    }
  }),
);

/** GET /api/gl/admin/qcm/stats */
router.get(
  '/admin/qcm/stats',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (_req, res) => {
    const total = await queryOne(
      `SELECT COUNT(*) AS total FROM gl_qcm_questions WHERE statut = 'actif'`,
    );
    const byBiome = await queryAll(
      `SELECT biome_slug, COUNT(*) AS effectif
       FROM gl_qcm_questions WHERE statut = 'actif'
      GROUP BY biome_slug ORDER BY effectif DESC`,
    );
    const byCategory = await queryAll(
      `SELECT categorie_slug, COUNT(*) AS effectif
       FROM gl_qcm_questions WHERE statut = 'actif'
      GROUP BY categorie_slug ORDER BY effectif DESC`,
    );
    const byDifficulte = await queryAll(
      `SELECT difficulte, COUNT(*) AS effectif
       FROM gl_qcm_questions WHERE statut = 'actif'
      GROUP BY difficulte ORDER BY difficulte ASC`,
    );
    const glossaryLinks = await queryOne('SELECT COUNT(*) AS total FROM gl_qcm_question_glossary');
    return res.json({
      total: Number(total?.total || 0),
      glossaryLinks: Number(glossaryLinks?.total || 0),
      byBiome,
      byCategory,
      byDifficulte,
    });
  }),
);

/** GET /api/gl/admin/qcm/import/template — modèle XLSX (feuilles categories + questions). */
router.get(
  '/admin/qcm/import/template',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (_req, res) => {
    const buffer = await buildQcmTemplateWorkbook();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="foretmap-gl-modele-qcm.xlsx"');
    return res.send(buffer);
  }),
);

/** GET /api/gl/admin/qcm/export — export XLSX ré-importable. */
router.get(
  '/admin/qcm/export',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (req, res) => {
    const statutRaw = String(req.query?.statut || 'actif').toLowerCase();
    const statut = statutRaw === 'all' ? 'all' : 'actif';
    const biomeSlug = normalizeBiomeSlug(req.query?.biomeSlug);
    const categorieSlug = normalizeOptionalString(req.query?.categorieSlug);
    const data = await loadQcmExportRows({ queryAll }, { statut, biomeSlug, categorieSlug });
    const buffer = await buildQcmExportWorkbook(data);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="foretmap-gl-export-qcm.xlsx"');
    return res.send(buffer);
  }),
);

/** POST /api/gl/admin/qcm/import */
router.post(
  '/admin/qcm/import',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (req, res) => {
    const dryRun = !!req.body?.dryRun;
    let parsed;
    try {
      parsed = await resolveImportRows(req.body || {});
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Fichier import invalide' });
    }
    const { categoryRows, questionRows } = parsed;
    if (!Array.isArray(questionRows) || questionRows.length === 0) {
      return res.status(400).json({ error: 'Feuille questions vide ou absente' });
    }
    if (questionRows.length > MAX_IMPORT_ROWS) {
      return res.status(400).json({ error: `Trop de lignes (max ${MAX_IMPORT_ROWS})` });
    }
    try {
      const report = await applyQcmImport({ queryAll, execute }, categoryRows || [], questionRows, {
        dryRun,
      });
      return res.json({ report });
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Import impossible' });
    }
  }),
);

/** GET /api/gl/admin/qcm/questions — liste complète (catalogue admin). */
router.get(
  '/admin/qcm/questions',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (req, res) => {
    const items = await listAdminQuestions(
      { queryAll },
      {
        biomeSlug: req.query?.biomeSlug,
        categorieSlug: req.query?.categorieSlug,
        niveau: req.query?.niveau,
        q: req.query?.q,
        statut: req.query?.statut,
        sort: req.query?.sort,
      },
    );
    return res.json({ items, total: items.length });
  }),
);

/** GET /api/gl/admin/qcm/questions/next-code */
router.get(
  '/admin/qcm/questions/next-code',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (_req, res) => {
    const question_code = await allocateNextGlQcmQuestionCode({ queryOne });
    return res.json({ question_code });
  }),
);

/** GET /api/gl/admin/qcm/questions/:code */
router.get(
  '/admin/qcm/questions/:code',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (req, res) => {
    const code = normalizeQuestionCode(req.params.code);
    if (!code) return res.status(400).json({ error: 'Code invalide' });
    const question = await loadAdminQuestionDetail({ queryOne }, code);
    if (!question) return res.status(404).json({ error: 'Question introuvable' });
    return res.json({ question });
  }),
);

/** POST /api/gl/admin/qcm/questions */
router.post(
  '/admin/qcm/questions',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (req, res) => {
    try {
      const result = await upsertGlQcmQuestion({ queryAll, queryOne, execute }, req.body || {}, {
        requireNew: true,
      });
      return res.status(201).json({ ok: true, created: true, question: result.question });
    } catch (err) {
      const status = err.statusCode || 400;
      return res.status(status).json({ error: err.message || 'Création impossible' });
    }
  }),
);

/** PUT /api/gl/admin/qcm/questions/:code */
router.put(
  '/admin/qcm/questions/:code',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (req, res) => {
    const code = normalizeQuestionCode(req.params.code);
    if (!code) return res.status(400).json({ error: 'Code invalide' });
    try {
      const result = await upsertGlQcmQuestion({ queryAll, queryOne, execute }, req.body || {}, {
        question_code: code,
        requireExisting: true,
      });
      return res.json({ ok: true, created: false, question: result.question });
    } catch (err) {
      const status = err.statusCode || 400;
      return res.status(status).json({ error: err.message || 'Mise à jour impossible' });
    }
  }),
);

module.exports = {
  router,
  loadActiveQuestion,
  enrichQuestionWithGlossary,
  loadGlossaryLookup,
  presentQuestion,
  verifyPresentationAnswer,
  glQcmPoolPreviewQuerySchema, // exporté pour test no-DB du contrat O7
};
