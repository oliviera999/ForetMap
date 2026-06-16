const express = require('express');
const { queryOne } = require('../../../database');
const { requireGlAuth, hasGlPermission } = require('../../../middleware/requireGlAuth');
const { normalizeEventRow } = require('../../../lib/glGameEvents');
const { emitGlGameEvent, emitGlSpellCastDraftChanged } = require('../../../lib/realtime');
const {
  getSpellCastConfig,
  assertSpellCastAvailable,
  assertSpellCastActorAllowed,
  resolveSpellCastError,
  mapSpellCastSqlError,
  createOrGetDraft,
  getDraftById,
  updateDraftContributions,
  launchDraft,
  cancelDraft,
  isStaff,
} = require('../../../lib/glSpellCast');
const { normalizeSpellCode } = require('../../../lib/glChapterSpells');
const { logRouteError } = require('../../../lib/routeLog');
const { canAccessGlGame } = require('../../../lib/glGameAccess');

const router = express.Router();

function parseId(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function requireSpellCastPermission(req, res, next) {
  requireGlAuth(req, res, () => {
    if (
      hasGlPermission(req.glAuth, 'gl.action.request') ||
      hasGlPermission(req.glAuth, 'gl.event.emit')
    ) {
      return next();
    }
    return res.status(403).json({ error: 'Permission insuffisante' });
  });
}

async function handleSpellCastRoute(req, res, handler) {
  try {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    const allowed = await canAccessGlGame(req.glAuth, gameId);
    if (!allowed) return res.status(403).json({ error: 'Accès partie refusé' });
    const config = await getSpellCastConfig();
    await assertSpellCastAvailable(config);
    assertSpellCastActorAllowed(req.glAuth, config);
    return await handler({ gameId, config });
  } catch (err) {
    const mapped = resolveSpellCastError(mapSpellCastSqlError(err));
    if (mapped) return res.status(mapped.status).json({ error: mapped.error });
    logRouteError(req, err, 'gl.spell_cast');
    return res.status(500).json({ error: 'Erreur lors du sortilège collaboratif' });
  }
}

router.get('/spell-cast-settings', requireGlAuth, async (_req, res) => {
  const config = await getSpellCastConfig();
  return res.json({
    settings: {
      enabled: config.enabled,
      vitalityRequired: true,
      contributionMode: config.contributionMode,
      teamScope: config.teamScope,
      mjOnly: config.mjOnly,
    },
  });
});

router.post('/games/:id/spell-casts/drafts', requireSpellCastPermission, async (req, res) => {
  return handleSpellCastRoute(req, res, async ({ gameId, config }) => {
    const spellCode = normalizeSpellCode(req.body?.spellCode);
    if (!spellCode) {
      return res.status(400).json({ error: 'spellCode requis' });
    }
    const teamId = parseId(req.body?.teamId);
    if (!teamId && !isStaff(req.glAuth)) {
      return res.status(400).json({ error: 'teamId requis pour les joueurs' });
    }
    const draft = await createOrGetDraft({
      gameId,
      teamId,
      spellCode,
      auth: req.glAuth,
      config,
    });
    emitGlSpellCastDraftChanged(gameId, { draftId: draft.id, type: 'draft_updated', draft });
    return res.status(201).json({ draft });
  });
});

router.get(
  '/games/:id/spell-casts/drafts/:draftId',
  requireSpellCastPermission,
  async (req, res) => {
    return handleSpellCastRoute(req, res, async ({ gameId }) => {
      const draftId = parseId(req.params.draftId);
      if (!draftId) return res.status(400).json({ error: 'draftId invalide' });
      const draft = await getDraftById(draftId, gameId);
      return res.json({ draft });
    });
  },
);

router.put(
  '/games/:id/spell-casts/drafts/:draftId/contributions',
  requireSpellCastPermission,
  async (req, res) => {
    return handleSpellCastRoute(req, res, async ({ gameId, config }) => {
      const draftId = parseId(req.params.draftId);
      if (!draftId) return res.status(400).json({ error: 'draftId invalide' });
      const contributions = req.body?.contributions;
      const draft = await updateDraftContributions({
        gameId,
        draftId,
        contributions,
        auth: req.glAuth,
        config,
      });
      emitGlSpellCastDraftChanged(gameId, { draftId: draft.id, type: 'draft_updated', draft });
      return res.json({ draft });
    });
  },
);

router.post(
  '/games/:id/spell-casts/drafts/:draftId/launch',
  requireSpellCastPermission,
  async (req, res) => {
    return handleSpellCastRoute(req, res, async ({ gameId, config }) => {
      const draftId = parseId(req.params.draftId);
      if (!draftId) return res.status(400).json({ error: 'draftId invalide' });
      const { draft, eventPayload, eventId } = await launchDraft({
        gameId,
        draftId,
        auth: req.glAuth,
        config,
      });
      const evt = eventId
        ? await queryOne(
            `SELECT id, game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at
           FROM gl_game_events
          WHERE id = ? AND game_id = ?
          LIMIT 1`,
            [eventId, gameId],
          )
        : null;
      if (!evt) {
        return res
          .status(500)
          .json({ error: 'Événement de sortilège introuvable après lancement' });
      }
      const normalized = normalizeEventRow(evt);
      if (normalized.eventType !== 'spell_cast') {
        return res.status(500).json({ error: 'Événement de sortilège incohérent après lancement' });
      }
      emitGlGameEvent(gameId, normalized);
      emitGlSpellCastDraftChanged(gameId, { draftId: draft.id, type: 'draft_cast', draft });
      return res.json({ ok: true, draft, event: normalized, payload: eventPayload });
    });
  },
);

router.delete(
  '/games/:id/spell-casts/drafts/:draftId',
  requireSpellCastPermission,
  async (req, res) => {
    return handleSpellCastRoute(req, res, async ({ gameId }) => {
      const draftId = parseId(req.params.draftId);
      if (!draftId) return res.status(400).json({ error: 'draftId invalide' });
      await cancelDraft({ gameId, draftId, auth: req.glAuth });
      emitGlSpellCastDraftChanged(gameId, { draftId, type: 'draft_cancelled' });
      return res.json({ ok: true });
    });
  },
);

module.exports = router;
