'use strict';

const express = require('express');
const { queryOne, queryAll } = require('../../database');
const { requireGlAuth, requireGlPermission } = require('../../middleware/requireGlAuth');
const { getGameplaySettings } = require('../../lib/glSettings');
const { buildClassStats, buildPlayerStats } = require('../../lib/glPlayerStats');
const { logRouteError, respondInternalError } = require('../../lib/routeLog');

const router = express.Router();
const db = { queryOne, queryAll };

async function resolveVitalityEnabled() {
  const settings = await getGameplaySettings();
  return settings.vitalityEnabled === true;
}

async function resolveClassIdForAuth(auth, requestedClassId) {
  const requested = String(requestedClassId || '').trim();
  if (requested) {
    const row = await queryOne(
      'SELECT id FROM gl_classes WHERE id = ? AND is_active = 1 LIMIT 1',
      [Number(requested)]
    );
    return row ? Number(row.id) : null;
  }

  if (auth?.classId != null) {
    const fromToken = Number(auth.classId);
    if (Number.isFinite(fromToken) && fromToken > 0) {
      const row = await queryOne(
        'SELECT id FROM gl_classes WHERE id = ? AND is_active = 1 LIMIT 1',
        [fromToken]
      );
      if (row) return Number(row.id);
    }
  }

  if (auth?.userType === 'gl_player') {
    const player = await queryOne(
      'SELECT class_id FROM gl_players WHERE id = ? AND is_active = 1 LIMIT 1',
      [Number(auth.userId)]
    );
    if (player?.class_id) return Number(player.class_id);
  }

  const fallback = await queryOne(
    'SELECT id FROM gl_classes WHERE is_active = 1 ORDER BY id ASC LIMIT 1'
  );
  return fallback ? Number(fallback.id) : null;
}

/** GET /api/gl/stats/me — statistiques du joueur connecté. */
router.get('/me', requireGlAuth, async (req, res) => {
  try {
    if (req.glAuth.userType !== 'gl_player') {
      return res.status(403).json({ error: 'Réservé aux joueurs GL' });
    }
    const vitalityEnabled = await resolveVitalityEnabled();
    const data = await buildPlayerStats(db, req.glAuth.userId, { vitalityEnabled });
    if (!data) return res.status(404).json({ error: 'Joueur introuvable' });
    return res.json(data);
  } catch (e) {
    logRouteError(e, req, 'gl_stats_me');
    return respondInternalError(res, req, e);
  }
});

/** GET /api/gl/stats/class?class_id= — statistiques collectives d'une classe (MJ/admin). */
router.get('/class', requireGlPermission('gl.players.manage'), async (req, res) => {
  try {
    const classId = await resolveClassIdForAuth(req.glAuth, req.query?.class_id);
    if (!classId) {
      return res.status(400).json({ error: 'Classe introuvable ou non spécifiée' });
    }
    const vitalityEnabled = await resolveVitalityEnabled();
    const data = await buildClassStats(db, classId, { vitalityEnabled });
    return res.json(data);
  } catch (e) {
    logRouteError(e, req, 'gl_stats_class');
    return respondInternalError(res, req, e);
  }
});

module.exports = router;
