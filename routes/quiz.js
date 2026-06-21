'use strict';

const express = require('express');
const { queryAll, queryOne, execute } = require('../database');
const {
  requireAuth,
  requirePermission,
  parseBearerToken,
  hydrateAuthFromTokenClaims,
  JWT_SECRET,
} = require('../middleware/requireTeacher');
const { verifyJwtToken } = require('../lib/auth/jwtPipeline');
const {
  presentQuestion,
  verifyPresentationAnswer,
  resolveQcmAnswerFeedback,
} = require('../lib/glQcmChoices');
const {
  loadAdminQuestionDetail,
  allocateNextQuizQuestionCode,
  listAdminQuestions,
  upsertQuizQuestion,
} = require('../lib/fmQuizCrud');
const {
  resolveImportRows,
  applyFmQuizImport,
  MAX_IMPORT_ROWS,
  buildFmQuizTemplateWorkbook,
  buildFmQuizExportWorkbook,
  loadFmQuizExportRows,
} = require('../lib/fmQuizImport');
const asyncHandler = require('../lib/asyncHandler');
const { z, validate } = require('../lib/validate');

const router = express.Router();
const FM_QCM_JWT_KIND = 'fm_quiz_present';
const QCM_OPTIONS = { jwtKind: FM_QCM_JWT_KIND };

function normalizeOptionalFilter(value) {
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

const questionCodeParamsSchema = z.unknown().superRefine((p, ctx) => {
  const code = normalizeQuestionCode(p == null ? '' : p.code);
  if (!code) ctx.addIssue({ code: 'custom', message: 'Code invalide', path: [] });
});

const QUESTION_SELECT = `
  SELECT question_code, categorie_slug, numero_dans_categorie, question,
         choix_a, choix_b, choix_c, choix_d, choix_e,
         reponse_correcte, reponse_texte, niveau, difficulte, difficulte_label,
         feedback_correct, feedback_a, feedback_b, feedback_c, feedback_d, feedback_e,
         photo_url, photo_credit, photo_licence, photo_legende, statut
    FROM quiz_questions
`;

async function loadActiveQuestion(code) {
  return queryOne(`${QUESTION_SELECT} WHERE question_code = ? AND statut = 'actif' LIMIT 1`, [
    code,
  ]);
}

async function loadQuestionGlossaryTerms(code) {
  return queryAll(
    `SELECT g.glossary_code, g.terme, g.variantes, g.categorie, g.definition_courte
       FROM quiz_question_glossary qqg
       JOIN glossary_terms g ON g.glossary_code = qqg.glossary_code
      WHERE qqg.question_code = ? AND g.statut = 'actif'
      ORDER BY g.terme ASC`,
    [code],
  );
}

async function tryHydrateAuth(req) {
  if (!JWT_SECRET) return null;
  const token = parseBearerToken(req);
  if (!token) return null;
  try {
    return await hydrateAuthFromTokenClaims(verifyJwtToken(token, JWT_SECRET));
  } catch (_) {
    return null;
  }
}

/** GET /api/quiz/categories?theme=&niveau= */
router.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const theme = normalizeOptionalFilter(req.query?.theme);
    const niveau = normalizeOptionalFilter(req.query?.niveau);

    const params = [];
    let sql = `SELECT slug, nom, emoji, theme, description, order_index
                 FROM quiz_categories
                WHERE 1=1`;
    if (theme) {
      sql += ' AND theme = ?';
      params.push(theme);
    }
    sql += ' ORDER BY order_index ASC, nom ASC';

    const categories = await queryAll(sql, params);
    if (niveau) {
      const counts = await queryAll(
        `SELECT categorie_slug, COUNT(*) AS total
           FROM quiz_questions
          WHERE statut = 'actif' AND niveau = ?
          GROUP BY categorie_slug`,
        [niveau],
      );
      const countBySlug = new Map(
        counts.map((row) => [row.categorie_slug, Number(row.total || 0)]),
      );
      return res.json({
        categories: categories.map((cat) => ({
          ...cat,
          questionCount: countBySlug.get(cat.slug) || 0,
        })),
      });
    }
    return res.json({ categories });
  }),
);

/** GET /api/quiz/draw?categorieSlug=&niveau=&difficulte= */
router.get(
  '/draw',
  asyncHandler(async (req, res) => {
    const categorieSlug = normalizeOptionalFilter(req.query?.categorieSlug);
    const niveau = normalizeOptionalFilter(req.query?.niveau);
    const difficulteRaw = normalizeOptionalFilter(req.query?.difficulte);
    const illustratedOnly =
      String(req.query?.illustrated || '').trim() === '1' ||
      String(req.query?.illustrated || '').toLowerCase() === 'true';

    const params = [];
    let sql = `SELECT question_code FROM quiz_questions WHERE statut = 'actif'`;
    if (categorieSlug) {
      sql += ' AND categorie_slug = ?';
      params.push(categorieSlug);
    }
    if (niveau) {
      sql += ' AND niveau = ?';
      params.push(niveau);
    }
    if (difficulteRaw != null) {
      const difficulte = Number(difficulteRaw);
      if (!Number.isInteger(difficulte) || difficulte < 1) {
        return res.status(400).json({ error: 'difficulte invalide' });
      }
      sql += ' AND difficulte = ?';
      params.push(difficulte);
    }
    if (illustratedOnly) {
      sql += " AND photo_url IS NOT NULL AND TRIM(photo_url) <> ''";
    }
    sql += ' ORDER BY RAND() LIMIT 1';

    const picked = await queryOne(sql, params);
    if (!picked) return res.status(404).json({ error: 'Aucune question disponible' });
    return res.json({ question_code: picked.question_code });
  }),
);

/** GET /api/quiz/questions — liste filtrée (catalogue admin / aperçu). */
router.get(
  '/questions',
  asyncHandler(async (req, res) => {
    const theme = normalizeOptionalFilter(req.query?.theme);
    const categorieSlug = normalizeOptionalFilter(req.query?.categorieSlug);
    const niveau = normalizeOptionalFilter(req.query?.niveau);
    const q = normalizeOptionalFilter(req.query?.q);

    const params = [];
    let sql = `
      SELECT q.question_code, q.categorie_slug, q.numero_dans_categorie, q.question,
             q.niveau, q.difficulte, q.difficulte_label, q.reponse_correcte, q.tags,
             c.theme
        FROM quiz_questions q
        JOIN quiz_categories c ON c.slug = q.categorie_slug
       WHERE q.statut = 'actif'`;
    if (theme) {
      sql += ' AND c.theme = ?';
      params.push(theme);
    }
    if (categorieSlug) {
      sql += ' AND q.categorie_slug = ?';
      params.push(categorieSlug);
    }
    if (niveau) {
      sql += ' AND q.niveau = ?';
      params.push(niveau);
    }
    sql += ' ORDER BY c.theme ASC, q.categorie_slug ASC, q.numero_dans_categorie ASC';

    let rows = await queryAll(sql, params);
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter((row) => {
        const hay = `${row.question} ${row.tags || ''}`.toLowerCase();
        return hay.includes(needle);
      });
    }

    const items = rows.map((row) => ({
      question_code: row.question_code,
      theme: row.theme,
      categorie_slug: row.categorie_slug,
      numero_dans_categorie: row.numero_dans_categorie,
      question: row.question,
      niveau: row.niveau,
      difficulte: row.difficulte,
      difficulte_label: row.difficulte_label,
      reponse_correcte: row.reponse_correcte,
    }));

    return res.json({ items });
  }),
);

/** GET /api/quiz/questions/:code/present */
router.get(
  '/questions/:code/present',
  validate({ params: questionCodeParamsSchema }),
  asyncHandler(async (req, res) => {
    const code = normalizeQuestionCode(req.params.code);
    if (!code) return res.status(400).json({ error: 'Code invalide' });

    const row = await loadActiveQuestion(code);
    if (!row) return res.status(404).json({ error: 'Question introuvable' });

    const glossaryTerms = await loadQuestionGlossaryTerms(code);
    try {
      const presentation = presentQuestion(row, glossaryTerms, QCM_OPTIONS);
      return res.json(presentation);
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Présentation impossible' });
    }
  }),
);

/** POST /api/quiz/questions/:code/answer */
router.post(
  '/questions/:code/answer',
  validate({ params: questionCodeParamsSchema }),
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
        QCM_OPTIONS,
      );
      const glossaryTerms = await loadQuestionGlossaryTerms(code);

      const auth = await tryHydrateAuth(req);
      if (auth?.userId) {
        await execute(
          `INSERT INTO user_quiz_attempts (user_id, question_code, categorie_slug, is_correct)
           VALUES (?, ?, ?, ?)`,
          [auth.userId, code, row.categorie_slug || null, result.correct ? 1 : 0],
        );
      }

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

/** GET /api/quiz/me/progress */
router.get(
  '/me/progress',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentification requise' });

    const summary = await queryOne(
      `SELECT COUNT(*) AS attempts,
              SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct
         FROM user_quiz_attempts
        WHERE user_id = ?`,
      [userId],
    );

    const byCategory = await queryAll(
      `SELECT categorie_slug,
              COUNT(*) AS attempts,
              SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct
         FROM user_quiz_attempts
        WHERE user_id = ?
        GROUP BY categorie_slug
        ORDER BY categorie_slug ASC`,
      [userId],
    );

    const recent = await queryAll(
      `SELECT question_code, categorie_slug, is_correct, answered_at
         FROM user_quiz_attempts
        WHERE user_id = ?
        ORDER BY answered_at DESC
        LIMIT 20`,
      [userId],
    );

    return res.json({
      attempts: Number(summary?.attempts || 0),
      correct: Number(summary?.correct || 0),
      byCategory,
      recent,
    });
  }),
);

/** GET /api/quiz/stats — agrégation prof (stats.read.all) */
router.get(
  '/stats',
  requirePermission('stats.read.all', { needsElevation: true }),
  asyncHandler(async (_req, res) => {
    const byStudent = await queryAll(
      `SELECT u.id AS user_id, u.first_name, u.last_name, u.pseudo,
              COUNT(*) AS attempts,
              SUM(CASE WHEN uqa.is_correct = 1 THEN 1 ELSE 0 END) AS correct
         FROM user_quiz_attempts uqa
         JOIN users u ON u.id = uqa.user_id
        GROUP BY u.id, u.first_name, u.last_name, u.pseudo
        ORDER BY attempts DESC, u.last_name ASC`,
    );
    const byCategory = await queryAll(
      `SELECT categorie_slug,
              COUNT(*) AS attempts,
              SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct
         FROM user_quiz_attempts
        WHERE categorie_slug IS NOT NULL AND categorie_slug <> ''
        GROUP BY categorie_slug
        ORDER BY categorie_slug ASC`,
    );
    return res.json({ byStudent, byCategory });
  }),
);

const quizManagePermission = requirePermission('plants.manage');

/** GET /api/quiz/admin/questions — liste complète (catalogue admin). */
router.get(
  '/admin/questions',
  quizManagePermission,
  asyncHandler(async (req, res) => {
    const items = await listAdminQuestions(
      { queryAll },
      {
        theme: req.query?.theme,
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

/** GET /api/quiz/admin/questions/next-code */
router.get(
  '/admin/questions/next-code',
  quizManagePermission,
  asyncHandler(async (_req, res) => {
    const question_code = await allocateNextQuizQuestionCode({ queryOne });
    return res.json({ question_code });
  }),
);

/** GET /api/quiz/admin/questions/:code */
router.get(
  '/admin/questions/:code',
  quizManagePermission,
  validate({ params: questionCodeParamsSchema }),
  asyncHandler(async (req, res) => {
    const code = normalizeQuestionCode(req.params.code);
    if (!code) return res.status(400).json({ error: 'Code invalide' });
    const question = await loadAdminQuestionDetail({ queryOne }, code);
    if (!question) return res.status(404).json({ error: 'Question introuvable' });
    return res.json({ question });
  }),
);

/** POST /api/quiz/admin/questions */
router.post(
  '/admin/questions',
  quizManagePermission,
  asyncHandler(async (req, res) => {
    try {
      const result = await upsertQuizQuestion({ queryAll, queryOne, execute }, req.body || {}, {
        requireNew: true,
      });
      return res.status(201).json({ ok: true, created: true, question: result.question });
    } catch (err) {
      const status = err.statusCode || 400;
      return res.status(status).json({ error: err.message || 'Création impossible' });
    }
  }),
);

/** PUT /api/quiz/admin/questions/:code */
router.put(
  '/admin/questions/:code',
  quizManagePermission,
  validate({ params: questionCodeParamsSchema }),
  asyncHandler(async (req, res) => {
    const code = normalizeQuestionCode(req.params.code);
    if (!code) return res.status(400).json({ error: 'Code invalide' });
    try {
      const result = await upsertQuizQuestion({ queryAll, queryOne, execute }, req.body || {}, {
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

/** GET /api/quiz/admin/stats */
router.get(
  '/admin/stats',
  quizManagePermission,
  asyncHandler(async (_req, res) => {
    const total = await queryOne(
      `SELECT COUNT(*) AS total FROM quiz_questions WHERE statut = 'actif'`,
    );
    const byTheme = await queryAll(
      `SELECT c.theme, COUNT(*) AS effectif
         FROM quiz_questions q
         JOIN quiz_categories c ON c.slug = q.categorie_slug
        WHERE q.statut = 'actif'
        GROUP BY c.theme
        ORDER BY effectif DESC`,
    );
    const byCategory = await queryAll(
      `SELECT categorie_slug, COUNT(*) AS effectif
         FROM quiz_questions WHERE statut = 'actif'
        GROUP BY categorie_slug ORDER BY effectif DESC`,
    );
    const byDifficulte = await queryAll(
      `SELECT difficulte, COUNT(*) AS effectif
         FROM quiz_questions WHERE statut = 'actif'
        GROUP BY difficulte ORDER BY difficulte ASC`,
    );
    const glossaryLinks = await queryOne('SELECT COUNT(*) AS total FROM quiz_question_glossary');
    return res.json({
      total: Number(total?.total || 0),
      glossaryLinks: Number(glossaryLinks?.total || 0),
      byTheme,
      byCategory,
      byDifficulte,
    });
  }),
);

/** GET /api/quiz/admin/import/template */
router.get(
  '/admin/import/template',
  quizManagePermission,
  asyncHandler(async (_req, res) => {
    const buffer = await buildFmQuizTemplateWorkbook();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="foretmap-modele-qcm.xlsx"');
    return res.send(buffer);
  }),
);

/** GET /api/quiz/admin/export */
router.get(
  '/admin/export',
  quizManagePermission,
  asyncHandler(async (req, res) => {
    const statutRaw = String(req.query?.statut || 'actif').toLowerCase();
    const statut = statutRaw === 'all' ? 'all' : 'actif';
    const theme = normalizeOptionalFilter(req.query?.theme);
    const categorieSlug = normalizeOptionalFilter(req.query?.categorieSlug);
    const data = await loadFmQuizExportRows({ queryAll }, { statut, theme, categorieSlug });
    const buffer = await buildFmQuizExportWorkbook(data);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="foretmap-export-qcm.xlsx"');
    return res.send(buffer);
  }),
);

/** POST /api/quiz/admin/import */
router.post(
  '/admin/import',
  quizManagePermission,
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
      const report = await applyFmQuizImport(
        { queryAll, execute },
        categoryRows || [],
        questionRows,
        {
          dryRun,
        },
      );
      return res.json({ report });
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Import impossible' });
    }
  }),
);

module.exports = router;
