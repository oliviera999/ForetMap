'use strict';

const express = require('express');
const { queryOne, queryAll, execute } = require('../../database');
const { requireGlAuth } = require('../../middleware/requireGlAuth');
const { canAccessGlGame } = require('../../lib/glGameAccess');
const { getGlModulesSettings } = require('../../lib/glSettings');
const { parseGlId, resolveTeamContext } = require('../../lib/glTeamContext');
const { revealFeuilletForSpeciesStudy } = require('../../lib/glLoreFeuilletSpeciesReveal');
const {
  parseConfirmBody,
  normalizeTargetCode,
  buildReaderKey,
  upsertLearningAck,
  listLearningAcks,
  groupLearningAcksByType,
} = require('../../lib/shared/learningAckCore');
const { z, validate } = require('../../lib/validate');
const asyncHandler = require('../../lib/asyncHandler');
const {
  assertGatingSatisfiedForAcknowledge,
  getChallengeState,
} = require('../../lib/learningGatingAcknowledge');
const {
  normalizeResourceType,
  normalizeResourceRef,
  GL_RESOURCE_TYPES,
} = require('../../lib/shared/resourceQuestionGatingCore');
const { GL_MARKABLE } = require('../../lib/learningGatingRuntime');
const { resourceExists } = require('../../lib/glLearnableResources');

const router = express.Router();

const db = { queryOne, queryAll, execute };

// O7 — validation déclarative des entrées (zod via lib/validate). Les schémas restent aussi
// permissifs que la validation manuelle qu'ils précèdent : les handlers conservent leur propre
// logique (parseConfirmBody, normalizeTargetCode, Number(req.params.id), etc.) et leurs messages 400.
//
// body `confirm` — reproduit exactement `parseConfirmBody(req.body)` :
// `if (!body || body.confirm !== true) -> 400 'Confirmation explicite requise (confirm: true)'`.
// Refine au niveau racine (path vide) pour préserver le message verbatim et tolérer un body
// null/undefined comme l'helper d'origine. Placé sur `body` pour que `validate` (body → params)
// reproduise l'ordre des gardes du handler (confirm body AVANT code) : précédence des 400 inchangée.
const confirmBodySchema = z.unknown().superRefine((b, ctx) => {
  if (!b || b.confirm !== true) {
    ctx.addIssue({
      code: 'custom',
      message: 'Confirmation explicite requise (confirm: true)',
      path: [],
    });
  }
});

// :code — reproduit exactement `normalizeTargetCode(req.params.code)` suivi de
// `if (!code) -> 400 'Identifiant invalide'`. normalizeTargetCode rejette le vide ET les codes de
// plus de 64 caractères (MAX_TARGET_CODE_LEN) : le refine applique la même règle. Refine racine
// (path vide) pour préserver le message verbatim. Le param n'est PAS transformé : le handler relit
// et re-normalise `req.params.code` lui-même.
const MAX_TARGET_CODE_LEN = 64;
const learningCodeParamsSchema = z.unknown().superRefine((p, ctx) => {
  const code = String((p == null ? '' : p.code) || '').trim();
  if (!code || code.length > MAX_TARGET_CODE_LEN) {
    ctx.addIssue({ code: 'custom', message: 'Identifiant invalide', path: [] });
  }
});

// :id (tutoriels) — reproduit exactement le gate `const id = Number(req.params.id);
// if (!Number.isFinite(id) || id <= 0) -> 400 'Identifiant invalide'`. Refine racine pour préserver
// le message verbatim. Le handler relit `Number(req.params.id)` lui-même : contrat inchangé.
const tutorialIdParamsSchema = z.unknown().superRefine((p, ctx) => {
  const id = Number(p == null ? undefined : p.id);
  if (!Number.isFinite(id) || id <= 0) {
    ctx.addIssue({ code: 'custom', message: 'Identifiant invalide', path: [] });
  }
});

/** GET /api/gl/learning/gating/challenge?resourceType=&resourceRef= */
router.get(
  '/gating/challenge',
  requireGlAuth,
  asyncHandler(async (req, res) => {
    const resourceType = normalizeResourceType(req.query.resourceType, GL_RESOURCE_TYPES);
    const resourceRef = normalizeResourceRef(req.query.resourceRef);
    if (!resourceType || !resourceRef || !GL_MARKABLE.has(resourceType)) {
      return res.status(400).json({ error: 'Paramètres de ressource invalides' });
    }
    const reader = buildReaderKey(req.glAuth);
    if (!reader) return res.status(403).json({ error: 'Profil invalide' });

    const alreadyAcked = await hasExistingLearningAck(reader, resourceType, resourceRef);
    const state = await getChallengeState(db, {
      product: 'gl',
      resourceType,
      resourceRef,
      glAuth: req.glAuth,
      skipGating: alreadyAcked,
    });
    if (!state.ok) {
      return res.status(state.status || 400).json({ error: state.error || 'Challenge invalide' });
    }
    return res.json({
      gating_enabled: state.gating_enabled,
      required: state.required,
      mode: state.mode,
      questions: state.questions,
      pending_count: state.pending_count,
    });
  }),
);

/** GET /api/gl/learning/me — progression du lecteur connecté. */
router.get('/me', requireGlAuth, async (req, res) => {
  const reader = buildReaderKey(req.glAuth);
  if (!reader) return res.status(403).json({ error: 'Profil invalide' });
  const rows = await listLearningAcks(db, reader);
  return res.json(groupLearningAcksByType(rows));
});

async function handleAcknowledge(req, res, { targetType, resolveTarget, skipGating = false }) {
  const confirm = parseConfirmBody(req.body);
  if (!confirm.ok) return res.status(400).json({ error: confirm.error });
  const reader = buildReaderKey(req.glAuth);
  if (!reader) return res.status(403).json({ error: 'Profil invalide' });
  const code = normalizeTargetCode(req.params.code ?? req.params.id);
  if (!code) return res.status(400).json({ error: 'Identifiant invalide' });
  const exists = await resolveTarget(code);
  if (!exists) return res.status(404).json({ error: 'Ressource introuvable' });

  const gating = await assertGatingSatisfiedForAcknowledge(db, {
    product: 'gl',
    resourceType: targetType,
    resourceRef: code,
    glAuth: req.glAuth,
    skipGating,
  });
  if (!gating.ok) {
    return res.status(gating.status || 403).json({
      error: gating.error,
      missing_question_codes: gating.missing_question_codes || [],
    });
  }

  await upsertLearningAck(db, reader, targetType, code);
  return res.json({ success: true, target_type: targetType, target_code: code });
}

async function hasExistingLearningAck(reader, targetType, targetCode) {
  const row = await queryOne(
    `SELECT target_code FROM gl_learning_acknowledgements
      WHERE reader_user_type = ? AND reader_user_id = ?
        AND target_type = ? AND target_code = ?
      LIMIT 1`,
    [reader.reader_user_type, reader.reader_user_id, targetType, targetCode],
  );
  return !!row;
}

/** POST /api/gl/learning/species/:code — marquer une espèce comme étudiée. */
router.post(
  '/species/:code',
  requireGlAuth,
  validate({ body: confirmBodySchema, params: learningCodeParamsSchema }),
  async (req, res) => {
    const confirm = parseConfirmBody(req.body);
    if (!confirm.ok) return res.status(400).json({ error: confirm.error });
    const reader = buildReaderKey(req.glAuth);
    if (!reader) return res.status(403).json({ error: 'Profil invalide' });
    const code = normalizeTargetCode(req.params.code);
    if (!code) return res.status(400).json({ error: 'Identifiant invalide' });

    const species = await queryOne(
      "SELECT species_code, biome_slug FROM gl_species WHERE species_code = ? AND statut = 'actif' LIMIT 1",
      [code],
    );
    if (!species) return res.status(404).json({ error: 'Ressource introuvable' });

    const alreadyStudied = await hasExistingLearningAck(reader, 'species', code);

    const gating = await assertGatingSatisfiedForAcknowledge(db, {
      product: 'gl',
      resourceType: 'species',
      resourceRef: code,
      glAuth: req.glAuth,
      skipGating: alreadyStudied,
    });
    if (!gating.ok) {
      return res.status(gating.status || 403).json({
        error: gating.error,
        missing_question_codes: gating.missing_question_codes || [],
      });
    }

    await upsertLearningAck(db, reader, 'species', code);

    const response = {
      success: true,
      target_type: 'species',
      target_code: code,
    };

    if (!alreadyStudied) {
      const gameId = parseGlId(req.body?.gameId ?? req.glAuth.gameId);
      if (gameId) {
        const modules = await getGlModulesSettings();
        if (modules.loreCarnetEnabled && (await canAccessGlGame(req.glAuth, gameId))) {
          const teamCtx = await resolveTeamContext(req, gameId, req.body?.teamId);
          if (!teamCtx.error) {
            const isMj = req.glAuth.userType === 'gl_admin';
            const actorType = isMj ? 'mj' : 'team';
            const feuilletRevealed = await revealFeuilletForSpeciesStudy(db, {
              gameId,
              teamId: teamCtx.teamId,
              speciesCode: code,
              biomeSlug: species.biome_slug,
              actorType,
              actorId: String(req.glAuth.userId),
              isMj,
            });
            if (feuilletRevealed) {
              response.feuilletRevealed = feuilletRevealed;
            }
          }
        }
      }
    }

    return res.json(response);
  },
);

/** POST /api/gl/learning/glossary/:code — marquer un terme de glossaire comme appris. */
router.post(
  '/glossary/:code',
  requireGlAuth,
  validate({ body: confirmBodySchema, params: learningCodeParamsSchema }),
  async (req, res) => {
    const reader = buildReaderKey(req.glAuth);
    const code = normalizeTargetCode(req.params.code);
    const alreadyAcked =
      reader && code ? await hasExistingLearningAck(reader, 'glossary', code) : false;
    return handleAcknowledge(req, res, {
      targetType: 'glossary',
      skipGating: alreadyAcked,
      resolveTarget: async (targetCode) => {
        const row = await queryOne(
          "SELECT glossary_code FROM gl_glossary_terms WHERE glossary_code = ? AND statut = 'actif' LIMIT 1",
          [targetCode],
        );
        return !!row;
      },
    });
  },
);

/** POST /api/gl/learning/tutorials/:id — marquer un tutoriel GL comme lu. */
router.post(
  '/tutorials/:id',
  requireGlAuth,
  validate({ params: tutorialIdParamsSchema }),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'Identifiant invalide' });
    }
    req.params.code = String(id);
    const reader = buildReaderKey(req.glAuth);
    const alreadyAcked = reader
      ? await hasExistingLearningAck(reader, 'tutorial', String(id))
      : false;
    return handleAcknowledge(req, res, {
      targetType: 'tutorial',
      skipGating: alreadyAcked,
      resolveTarget: async (targetCode) => {
        const tid = Number(targetCode);
        if (!Number.isFinite(tid) || tid <= 0) return false;
        const row = await queryOne('SELECT id FROM gl_tutorials WHERE id = ? LIMIT 1', [tid]);
        return !!row;
      },
    });
  },
);

/**
 * POST /api/gl/learning/mark/:resourceType/:ref — accusé générique « appris / lu / découvert »
 * pour les types sans endpoint dédié (glossaire lore, feuillet, page de contenu, écosystème…).
 * Même contrat que les endpoints spécifiques : confirm:true, gating éventuel, ressource existante.
 */
router.post(
  '/mark/:resourceType/:ref',
  requireGlAuth,
  asyncHandler(async (req, res) => {
    const confirm = parseConfirmBody(req.body);
    if (!confirm.ok) return res.status(400).json({ error: confirm.error });
    const reader = buildReaderKey(req.glAuth);
    if (!reader) return res.status(403).json({ error: 'Profil invalide' });

    const resourceType = normalizeResourceType(req.params.resourceType, GL_RESOURCE_TYPES);
    const ref = normalizeResourceRef(req.params.ref);
    if (!resourceType || !ref || !GL_MARKABLE.has(resourceType)) {
      return res.status(400).json({ error: 'Type de ressource non marquable' });
    }

    if (!(await resourceExists(db, resourceType, ref))) {
      return res.status(404).json({ error: 'Ressource introuvable' });
    }

    const alreadyAcked = await hasExistingLearningAck(reader, resourceType, ref);
    const gating = await assertGatingSatisfiedForAcknowledge(db, {
      product: 'gl',
      resourceType,
      resourceRef: ref,
      glAuth: req.glAuth,
      skipGating: alreadyAcked,
    });
    if (!gating.ok) {
      return res.status(gating.status || 403).json({
        error: gating.error,
        missing_question_codes: gating.missing_question_codes || [],
      });
    }

    await upsertLearningAck(db, reader, resourceType, ref);
    return res.json({ success: true, target_type: resourceType, target_code: ref });
  }),
);

module.exports = router;
module.exports.confirmBodySchema = confirmBodySchema; // exporté pour test no-DB du contrat O7
module.exports.learningCodeParamsSchema = learningCodeParamsSchema; // exporté pour test no-DB du contrat O7
module.exports.tutorialIdParamsSchema = tutorialIdParamsSchema; // exporté pour test no-DB du contrat O7
