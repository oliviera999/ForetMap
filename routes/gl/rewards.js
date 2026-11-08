'use strict';

/**
 * Gnomes & Licornes — badges individuels « Tenir à deux » sur le moteur commun
 * (`lib/glRewards.js`, `docs/REWARDS_ENGINE.md`). Monté sous `/api/gl/rewards` (server.js).
 *
 *  - `GET  /me`               joueur : ses badges, sa progression, le catalogue, les familles et
 *                             les paliers de la Trame. Évalue d'abord toutes les familles : un
 *                             badge mérité arrive à l'ouverture, sans attendre la nuit ;
 *  - `POST /me/seen`          annonces vues (`seen_at`) ;
 *  - `GET  /games/:id`        vitrine du prof (`gl.game.manage`) : membres de la partie ×
 *                             familles, « à un pas du palier suivant ». Tri alphabétique,
 *                             **jamais de classement** ;
 *  - `POST /games/:id/award`  badge décerné (`gl.game.manage`) : `{ playerId, type, note }`,
 *                             mot obligatoire ; `RewardAwardError` → statut HTTP.
 *
 * Interrupteur `modules.rewards_enabled` : tout le routeur répond 503 quand il est éteint
 * (les badges automatiques continuent d'être enregistrés en silence par les crochets).
 * Aucun badge ne donne de ressource ; aucune donnée d'élève dans les journaux.
 */

const express = require('express');
const db = require('../../database');
const asyncHandler = require('../../lib/asyncHandler');
const logger = require('../../lib/logger');
const { requireGlAuth, requireGlPermission } = require('../../middleware/requireGlAuth');
const { requireModuleEnabled } = require('../../lib/shared/moduleGate');
const { parseId } = require('../../lib/shared/httpHelpers');
const { getPlayerGameMembership } = require('../../lib/gl/gamesRuntime');
const { insertGameEvent } = require('../../lib/glGameEvents');
const { emitGlGameEvent } = require('../../lib/realtime');
const { RewardAwardError } = require('../../lib/rewards/core/engine');
const { glRewards, listGameMemberIds } = require('../../lib/glRewards');

const router = express.Router();

router.use(requireModuleEnabled('gl', 'rewards', 'Badges désactivés'));

function playerIdOf(req) {
  if (req.glAuth?.userType !== 'gl_player') return null;
  const id = Number(req.glAuth.userId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.get(
  '/me',
  requireGlAuth,
  asyncHandler(async (req, res) => {
    const playerId = playerIdOf(req);
    if (!playerId) return res.status(403).json({ error: 'Réservé aux joueurs' });
    try {
      await glRewards.evaluate(String(playerId), { source: { type: 'open' } });
    } catch (err) {
      // Lecture d'abord : une panne d'évaluation n'empêche pas d'afficher les badges.
      logger.error({ err }, 'gl_rewards_open_evaluation_failed');
    }
    const { rewards, progress } = await glRewards.buildProgress(String(playerId));
    return res.json({ rewards, progress, ...glRewards.publicCatalogue(), enabled: true });
  }),
);

router.post(
  '/me/seen',
  requireGlAuth,
  asyncHandler(async (req, res) => {
    const playerId = playerIdOf(req);
    if (!playerId) return res.status(403).json({ error: 'Réservé aux joueurs' });
    return res.json({ seen: await glRewards.markSeen(String(playerId)) });
  }),
);

async function loadGame(gameId) {
  return db.queryOne('SELECT id, name, class_id FROM gl_games WHERE id = ? LIMIT 1', [gameId]);
}

router.get(
  '/games/:id',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    const game = await loadGame(gameId);
    if (!game) return res.status(404).json({ error: 'Partie introuvable' });
    const members = await listGameMemberIds(gameId);
    const showcase = await glRewards.buildShowcase(members);
    const { catalogue, families, tiers } = glRewards.publicCatalogue();
    return res.json({
      game: { id: Number(game.id), name: game.name },
      players: showcase.students,
      near: showcase.near,
      families,
      tiers,
      manualTypes: catalogue.filter((e) => e.source === 'manual'),
    });
  }),
);

router.post(
  '/games/:id/award',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    if (!(await loadGame(gameId))) return res.status(404).json({ error: 'Partie introuvable' });
    const playerId = parseId(req.body?.playerId);
    if (!playerId) return res.status(400).json({ error: 'playerId requis' });
    if (!(await getPlayerGameMembership(gameId, playerId))) {
      return res.status(404).json({ error: 'Joueur non rattaché à cette partie' });
    }
    try {
      const { reward } = await glRewards.awardManual({
        ownerId: String(playerId),
        type: req.body?.type,
        note: req.body?.note,
        awardedBy: String(req.glAuth.userId),
      });
      // Journal de partie : le badge est privé (seul le nom du badge est public).
      try {
        const evt = await db.withTransaction((tx) =>
          insertGameEvent(tx, {
            gameId,
            actorType: 'mj',
            actorId: String(req.glAuth.userId),
            eventType: 'badge',
            payload: {
              playerId,
              rewardKey: reward.key,
              nom: reward.title,
              private: true,
              publicKeys: ['nom'],
            },
          }),
        );
        emitGlGameEvent(gameId, evt);
      } catch (err) {
        logger.warn({ err, gameId }, 'gl_rewards_badge_event_failed');
      }
      return res.status(201).json({ reward });
    } catch (err) {
      if (err instanceof RewardAwardError)
        return res.status(err.status).json({ error: err.message });
      throw err;
    }
  }),
);

module.exports = router;
