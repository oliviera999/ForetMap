const express = require('express');
const { queryOne, withTransaction } = require('../../../database');
const { requireGlPermission } = require('../../../middleware/requireGlAuth');
const { normalizeEventRow } = require('../../../lib/glGameEvents');
const { emitGlGameEvent } = require('../../../lib/realtime');
const { getGameplaySettings } = require('../../../lib/glSettings');
const {
  parseVitalityDelta,
  applyPlayerVitalityDelta,
  applyTeamVitalityDelta,
  resolveVitalityError,
} = require('../../../lib/glVitality');
const asyncHandler = require('../../../lib/asyncHandler');
// O10 — helpers runtime à I/O (DB) partagés via lib/gl/gamesRuntime.js (déplacement pur),
// recopie locale de parseId pour éviter tout import circulaire vers gl/games.js.
const {
  ensurePlayerInGameClass,
  recordVitalityChangeEvent,
} = require('../../../lib/gl/gamesRuntime');

const router = express.Router();

function parseId(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

router.post(
  '/games/:id/vitality/player',
  requireGlPermission('gl.event.emit'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const playerId = parseId(req.body?.playerId);
    const healthDelta = req.body?.healthDelta;
    const powerDelta = req.body?.powerDelta;
    const reason = req.body?.reason;
    if (!gameId || !playerId) {
      return res.status(400).json({ error: 'gameId et playerId requis' });
    }
    if (parseVitalityDelta(healthDelta) === 0 && parseVitalityDelta(powerDelta) === 0) {
      return res
        .status(400)
        .json({ error: 'Au moins un delta (healthDelta ou powerDelta) non nul requis' });
    }
    const settings = await getGameplaySettings();
    if (!settings.vitalityEnabled) {
      return res
        .status(409)
        .json({ error: 'Points de vie et de pouvoir désactivés dans les réglages' });
    }
    const game = await queryOne('SELECT id FROM gl_games WHERE id = ? LIMIT 1', [gameId]);
    if (!game) return res.status(404).json({ error: 'Partie introuvable' });
    try {
      await ensurePlayerInGameClass(playerId, gameId);
      let result;
      await withTransaction(async (tx) => {
        result = await applyPlayerVitalityDelta(tx, { playerId, healthDelta, powerDelta });
        await recordVitalityChangeEvent(tx, {
          gameId,
          teamId: null,
          actorId: String(req.glAuth.userId),
          healthDelta,
          powerDelta,
          reason,
          results: [result],
        });
      });
      const evt = await queryOne(
        `SELECT id, game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at
         FROM gl_game_events
        WHERE game_id = ?
        ORDER BY id DESC
        LIMIT 1`,
        [gameId],
      );
      const normalized = normalizeEventRow(evt);
      emitGlGameEvent(gameId, normalized);
      return res.status(200).json({ ok: true, result });
    } catch (err) {
      const mapped = resolveVitalityError(err);
      if (mapped) return res.status(mapped.status).json({ error: mapped.error });
      throw err;
    }
  }),
);

router.post(
  '/games/:id/vitality/team',
  requireGlPermission('gl.event.emit'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const teamId = parseId(req.body?.teamId);
    const healthDelta = req.body?.healthDelta;
    const powerDelta = req.body?.powerDelta;
    const reason = req.body?.reason;
    if (!gameId || !teamId) {
      return res.status(400).json({ error: 'gameId et teamId requis' });
    }
    if (parseVitalityDelta(healthDelta) === 0 && parseVitalityDelta(powerDelta) === 0) {
      return res
        .status(400)
        .json({ error: 'Au moins un delta (healthDelta ou powerDelta) non nul requis' });
    }
    const settings = await getGameplaySettings();
    if (!settings.vitalityEnabled) {
      return res
        .status(409)
        .json({ error: 'Points de vie et de pouvoir désactivés dans les réglages' });
    }
    const team = await queryOne('SELECT id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1', [
      teamId,
      gameId,
    ]);
    if (!team) return res.status(404).json({ error: 'Équipe introuvable' });
    try {
      let results;
      await withTransaction(async (tx) => {
        results = await applyTeamVitalityDelta(tx, { gameId, teamId, healthDelta, powerDelta });
        await recordVitalityChangeEvent(tx, {
          gameId,
          teamId,
          actorId: String(req.glAuth.userId),
          healthDelta,
          powerDelta,
          reason,
          results,
        });
      });
      const evt = await queryOne(
        `SELECT id, game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at
         FROM gl_game_events
        WHERE game_id = ?
        ORDER BY id DESC
        LIMIT 1`,
        [gameId],
      );
      const normalized = normalizeEventRow(evt);
      emitGlGameEvent(gameId, normalized);
      return res.status(200).json({ ok: true, results });
    } catch (err) {
      const mapped = resolveVitalityError(err);
      if (mapped) return res.status(mapped.status).json({ error: mapped.error });
      throw err;
    }
  }),
);

module.exports = router;
