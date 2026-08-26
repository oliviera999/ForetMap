'use strict';

const express = require('express');
const { queryAll, queryOne, execute } = require('../database');
const { requireAuth } = require('../middleware/requireTeacher');
const asyncHandler = require('../lib/asyncHandler');
const { z, validate } = require('../lib/validate');
const {
  parseConfirmBody,
  normalizeTargetCode,
  buildFmReaderKey,
  upsertLearningAckIn,
  listLearningAcksIn,
  FM_ACK_STORE,
} = require('../lib/shared/learningAckCore');
const { assertGatingSatisfiedForAcknowledge } = require('../lib/learningGatingAcknowledge');

const { glossaryTermMatchesQuery } = require('../lib/glossarySearch');

const router = express.Router();

function normalizeOptionalFilter(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

const glossaryCodeParamsSchema = z.unknown().superRefine((p, ctx) => {
  const code = String((p == null ? '' : p.code) || '').trim();
  if (!code) ctx.addIssue({ code: 'custom', message: 'Code invalide', path: [] });
});

/** GET /api/glossary/terms?q=&niveau=&categorie= */
router.get(
  '/terms',
  asyncHandler(async (req, res) => {
    const q = normalizeOptionalFilter(req.query?.q);
    const niveau = normalizeOptionalFilter(req.query?.niveau);
    const categorie = normalizeOptionalFilter(req.query?.categorie);

    const params = [];
    let sql = `SELECT glossary_code, terme, variantes, categorie, niveau, definition_courte
                 FROM glossary_terms
                WHERE statut = 'actif'`;

    if (categorie) {
      sql += ' AND categorie = ?';
      params.push(categorie);
    }
    if (niveau) {
      sql += ' AND niveau = ?';
      params.push(niveau);
    }
    if (q) {
      sql += ' AND (terme LIKE ? OR variantes LIKE ?)';
      const needle = `%${q}%`;
      params.push(needle, needle);
    }
    sql += ' ORDER BY categorie ASC, terme ASC';

    let items = await queryAll(sql, params);
    if (q) {
      items = items.filter((term) => glossaryTermMatchesQuery(term, q));
    }
    return res.json({ items });
  }),
);

/** GET /api/glossary/terms/:code */
router.get(
  '/terms/:code',
  validate({ params: glossaryCodeParamsSchema }),
  asyncHandler(async (req, res) => {
    const code = String(req.params.code || '').trim();
    if (!code) return res.status(400).json({ error: 'Code invalide' });

    const term = await queryOne(
      `SELECT glossary_code, terme, variantes, categorie, niveau, definition_courte,
              definition_complete, exemple, etymologie, illustration_idee, statut
         FROM glossary_terms
        WHERE glossary_code = ? AND statut = 'actif'
        LIMIT 1`,
      [code],
    );
    if (!term) return res.status(404).json({ error: 'Terme introuvable' });

    const relatedTerms = await queryAll(
      `SELECT t.glossary_code, t.terme, t.categorie, t.definition_courte
         FROM glossary_term_relations r
         JOIN glossary_terms t ON t.glossary_code = r.to_code
        WHERE r.from_code = ? AND t.statut = 'actif'
        ORDER BY t.terme ASC`,
      [code],
    );

    const linkedPlants = await queryAll(
      `SELECT p.id, p.name, p.emoji, p.scientific_name
         FROM glossary_term_species gts
         JOIN plants p ON p.id = gts.plant_id
        WHERE gts.glossary_code = ?
        ORDER BY p.name ASC`,
      [code],
    );

    const linkedTutorials = await queryAll(
      `SELECT t.id, t.title, t.slug
         FROM glossary_term_tutorials gtt
         JOIN tutorials t ON t.id = gtt.tutorial_id
        WHERE gtt.glossary_code = ? AND t.is_active = 1
        ORDER BY t.title ASC`,
      [code],
    );

    const linkedQuizQuestions = await queryAll(
      `SELECT qq.question_code, qq.question, qq.categorie_slug, qq.niveau, qq.difficulte
         FROM resource_question_links r
         JOIN quiz_questions qq ON qq.question_code = r.question_code
        WHERE r.resource_ref = ? AND r.resource_type = 'glossary'
          AND r.status = 'approved' AND qq.statut = 'actif'
        ORDER BY qq.categorie_slug ASC, qq.numero_dans_categorie ASC`,
      [code],
    );

    const incomingRelations = await queryAll(
      `SELECT t.glossary_code, t.terme, t.categorie, t.definition_courte
         FROM glossary_term_relations r
         JOIN glossary_terms t ON t.glossary_code = r.from_code
        WHERE r.to_code = ? AND t.statut = 'actif'
        ORDER BY t.terme ASC`,
      [code],
    );

    return res.json({
      ...term,
      relatedTerms,
      incomingRelations,
      linkedPlants,
      linkedTutorials,
      linkedQuizQuestions,
      tutorialsCount: linkedTutorials.length,
    });
  }),
);

/** GET /api/glossary/categories */
router.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const rows = await queryAll(
      `SELECT DISTINCT categorie
         FROM glossary_terms
        WHERE statut = 'actif'
        ORDER BY categorie ASC`,
    );
    return res.json({ categories: rows.map((row) => row.categorie).filter(Boolean) });
  }),
);

/**
 * GET /api/glossary/me/learned-codes — termes deja appris par l'utilisateur connecte.
 *
 * Le glossaire ForetMap etait purement consultatif : rien ne distinguait un terme
 * travaille d'un terme jamais ouvert, et le conditionnement n'avait aucun geste de
 * validation auquel se rattacher. Gnomes & Licornes savait le faire depuis longtemps.
 */
router.get(
  '/me/learned-codes',
  requireAuth,
  asyncHandler(async (req, res) => {
    const reader = buildFmReaderKey(req.auth?.userId);
    if (!reader) return res.status(403).json({ error: 'Profil utilisateur invalide' });
    const rows = await listLearningAcksIn({ queryAll }, FM_ACK_STORE, reader, 'glossary');
    return res.json({ glossary_codes: rows.map((r) => r.target_code) });
  }),
);

/**
 * POST /api/glossary/terms/:code/acknowledge — « j'ai appris ce terme ».
 *
 * Meme garde que les tutoriels et les fiches especes : si le conditionnement est actif et
 * que des questions bloquantes sont rattachees au terme, il faut les avoir reussies. C'est
 * ce geste-la qui manquait pour qu'un lien bloquant sur un terme veuille dire quelque chose.
 */
router.post(
  '/terms/:code/acknowledge',
  requireAuth,
  validate({ params: glossaryCodeParamsSchema }),
  asyncHandler(async (req, res) => {
    const confirm = parseConfirmBody(req.body);
    if (!confirm.ok) return res.status(400).json({ error: confirm.error });

    const code = normalizeTargetCode(req.params.code);
    if (!code) return res.status(400).json({ error: 'Code invalide' });

    const userId = req.auth?.userId;
    const reader = buildFmReaderKey(userId);
    if (!reader) return res.status(403).json({ error: 'Profil utilisateur invalide' });

    const term = await queryOne(
      "SELECT glossary_code FROM glossary_terms WHERE glossary_code = ? AND statut = 'actif' LIMIT 1",
      [code],
    );
    if (!term) return res.status(404).json({ error: 'Terme introuvable' });

    const gating = await assertGatingSatisfiedForAcknowledge(
      { queryAll, queryOne, execute },
      { product: 'fm', resourceType: 'glossary', resourceRef: code, userId },
    );
    if (!gating.ok) {
      return res.status(gating.status || 403).json({
        error: gating.error,
        missing_question_codes: gating.missing_question_codes || [],
        ...(gating.cooldown ? { cooldown: gating.cooldown } : {}),
      });
    }

    await upsertLearningAckIn({ execute }, FM_ACK_STORE, reader, 'glossary', code);
    return res.json({ success: true, glossary_code: code, learned: true });
  }),
);

module.exports = router;
