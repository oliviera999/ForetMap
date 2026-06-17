'use strict';

const express = require('express');
const { queryAll, queryOne, execute } = require('../database');
const { requireAuth, requirePermission, parseBearerToken,
  hydrateAuthFromTokenClaims,
  JWT_SECRET,
} = require('../middleware/requireTeacher');
const { verifyJwtToken } = require('../lib/auth/jwtPipeline');
const {
  presentQuestion,
  verifyPresentationAnswer,
  resolveQcmAnswerFeedback,
} = require('../lib/glQcmChoices');
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
      const countBySlug = new Map(counts.map((row) => [row.categorie_slug, Number(row.total || 0)]));
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

module.exports = router;
