'use strict';

/**
 * API du quiz ForetMap (`/api/quiz`) — HTTP seulement : `validate()` → service → JSON
 * (étape B2 de la piste B, audit du 25/09/2026). Les règles vivent dans
 * `lib/pedago/quizService.js`, le SQL dans `lib/pedago/quizRepository.js`.
 */

const express = require('express');
const {
  requireAuth,
  requirePermission,
  parseBearerToken,
  hydrateAuthFromTokenClaims,
  JWT_SECRET,
} = require('../middleware/requireTeacher');
const { verifyJwtToken } = require('../lib/auth/jwtPipeline');
const { logAudit } = require('../lib/auditLog');
const asyncHandler = require('../lib/asyncHandler');
const { z, validate } = require('../lib/validate');
const { normalizeQuestionCode } = require('../lib/shared/questionRouteHelpers');
const quizService = require('../lib/pedago/quizService');

const router = express.Router();

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Paramètre `:code` → `req.validatedParams.code` (normalisé, jamais vide). */
const questionCodeParamsSchema = z.unknown().transform((p, ctx) => {
  const code = normalizeQuestionCode(p == null ? '' : p.code);
  if (!code) {
    ctx.addIssue({ code: 'custom', message: 'Code invalide', path: [] });
    return z.NEVER;
  }
  return { code };
});

/**
 * Schéma de requête bâti sur une lecture du service (`parse(query) → { error } | { filters }`) :
 * la requête invalide est refusée en 400 avec le message du service, la valide arrive
 * parsée dans `req.validatedQuery`.
 */
function filtersQuerySchema(parse) {
  return z.unknown().transform((query, ctx) => {
    const parsed = parse(query);
    if (parsed.error) {
      ctx.addIssue({ code: 'custom', message: parsed.error, path: [] });
      return z.NEVER;
    }
    return parsed.filters;
  });
}

/** Handler dont les erreurs attendues du service sont renvoyées telles quelles. */
function quizHandler(fn) {
  return asyncHandler(async (req, res) => {
    try {
      return await fn(req, res);
    } catch (err) {
      if (!quizService.isQuizError(err)) throw err;
      return res.status(err.status).json(err.responseBody);
    }
  });
}

/** Authentification facultative (routes publiques) : `null` si absente ou invalide. */
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

function sendXlsx(res, filename, buffer) {
  res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(buffer);
}

/** GET /api/quiz/categories?theme=&niveau=&notionId=&notionNiveau= */
router.get(
  '/categories',
  validate({ query: filtersQuerySchema(quizService.parseCategoriesQuery) }),
  quizHandler(async (req, res) => res.json(await quizService.listCategories(req.validatedQuery))),
);

/** GET /api/quiz/draw?categorieSlug=&niveau=&difficulte=&illustrated=&notionId=&notionNiveau= */
router.get(
  '/draw',
  validate({ query: filtersQuerySchema(quizService.parseDrawQuery) }),
  quizHandler(async (req, res) => res.json(await quizService.drawQuestionCode(req.validatedQuery))),
);

/** GET /api/quiz/questions — liste filtrée (catalogue public ; réponses pour les gestionnaires). */
router.get(
  '/questions',
  validate({ query: filtersQuerySchema(quizService.parseCatalogQuery) }),
  quizHandler(async (req, res) => {
    const canSeeAnswers = quizService.canSeeCatalogAnswers(await tryHydrateAuth(req));
    return res.json(await quizService.listCatalogQuestions(req.validatedQuery, { canSeeAnswers }));
  }),
);

/** GET /api/quiz/questions/:code/present */
router.get(
  '/questions/:code/present',
  validate({ params: questionCodeParamsSchema }),
  quizHandler(async (req, res) =>
    res.json(
      await quizService.presentQuizQuestion({
        code: req.validatedParams.code,
        query: req.query,
        getAuth: () => tryHydrateAuth(req),
      }),
    ),
  ),
);

/** POST /api/quiz/questions/:code/answer */
router.post(
  '/questions/:code/answer',
  validate({ params: questionCodeParamsSchema }),
  quizHandler(async (req, res) =>
    res.json(
      await quizService.answerQuizQuestion({
        code: req.validatedParams.code,
        body: req.body,
        getAuth: () => tryHydrateAuth(req),
      }),
    ),
  ),
);

/** GET /api/quiz/me/progress */
router.get(
  '/me/progress',
  requireAuth,
  quizHandler(async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentification requise' });
    return res.json(await quizService.getLearnerProgress(userId));
  }),
);

/** GET /api/quiz/stats — agrégation prof (stats.read.all) */
router.get(
  '/stats',
  requirePermission('stats.read.all'),
  quizHandler(async (_req, res) => res.json(await quizService.getAttemptStats())),
);

const quizManagePermission = requirePermission(quizService.QUIZ_MANAGE_PERMISSION);

/** GET /api/quiz/admin/questions/stats?onlyGating=1&minAttempts=5 */
router.get(
  '/admin/questions/stats',
  quizManagePermission,
  quizHandler(async (req, res) =>
    res.json(
      await quizService.getQuestionSuccessStats({
        onlyGating: String(req.query.onlyGating || '') === '1',
        minAttempts: req.query.minAttempts,
      }),
    ),
  ),
);

/** GET /api/quiz/admin/questions — liste complète (catalogue admin). */
router.get(
  '/admin/questions',
  quizManagePermission,
  quizHandler(async (req, res) =>
    res.json(
      await quizService.listAdminQuestions({
        theme: req.query?.theme,
        categorieSlug: req.query?.categorieSlug,
        niveau: req.query?.niveau,
        q: req.query?.q,
        statut: req.query?.statut,
        sort: req.query?.sort,
      }),
    ),
  ),
);

/** GET /api/quiz/admin/questions/next-code */
router.get(
  '/admin/questions/next-code',
  quizManagePermission,
  quizHandler(async (_req, res) => res.json(await quizService.allocateQuestionCode())),
);

/** GET /api/quiz/admin/questions/:code */
router.get(
  '/admin/questions/:code',
  quizManagePermission,
  validate({ params: questionCodeParamsSchema }),
  quizHandler(async (req, res) =>
    res.json(await quizService.getAdminQuestion(req.validatedParams.code)),
  ),
);

/** POST /api/quiz/admin/questions */
router.post(
  '/admin/questions',
  quizManagePermission,
  quizHandler(async (req, res) => {
    const question = await quizService.saveQuestion(req.body);
    const code = question?.question_code || null;
    await logAudit('create_quiz', 'quiz_question', code, code || 'Question QCM créée', {
      req,
      payload: { question_code: code },
    });
    return res.status(201).json({ ok: true, created: true, question });
  }),
);

/** PUT /api/quiz/admin/questions/:code */
router.put(
  '/admin/questions/:code',
  quizManagePermission,
  validate({ params: questionCodeParamsSchema }),
  quizHandler(async (req, res) => {
    const { code } = req.validatedParams;
    const question = await quizService.saveQuestion(req.body, { code });
    await logAudit('update_quiz', 'quiz_question', code, code, {
      req,
      payload: { question_code: code },
    });
    return res.json({ ok: true, created: false, question });
  }),
);

/** GET /api/quiz/admin/stats */
router.get(
  '/admin/stats',
  quizManagePermission,
  quizHandler(async (_req, res) => res.json(await quizService.getCatalogStats())),
);

/** GET /api/quiz/admin/import/template */
router.get(
  '/admin/import/template',
  quizManagePermission,
  quizHandler(async (_req, res) =>
    sendXlsx(res, 'foretmap-modele-qcm.xlsx', await quizService.buildTemplateWorkbook()),
  ),
);

/** GET /api/quiz/admin/export?statut=actif|all&theme=&categorieSlug= */
router.get(
  '/admin/export',
  quizManagePermission,
  quizHandler(async (req, res) =>
    sendXlsx(res, 'foretmap-export-qcm.xlsx', await quizService.buildExportWorkbook(req.query)),
  ),
);

/** POST /api/quiz/admin/import */
router.post(
  '/admin/import',
  quizManagePermission,
  quizHandler(async (req, res) =>
    res.json({ report: await quizService.importQuestions(req.body) }),
  ),
);

module.exports = router;
