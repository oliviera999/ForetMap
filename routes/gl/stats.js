'use strict';

const express = require('express');
const { queryOne, queryAll } = require('../../database');
const { requireGlAuth, requireGlPermission } = require('../../middleware/requireGlAuth');
const { getGameplaySettings } = require('../../lib/glSettings');
const { buildClassStats, buildPlayerStats } = require('../../lib/glPlayerStats');
const { logRouteError, respondInternalError } = require('../../lib/routeLog');
const { z, validate } = require('../../lib/validate');

const router = express.Router();
const db = { queryOne, queryAll };

// O7 — `class_id` de GET /class : coercition permissive (jamais de 400 issu du schéma)
// reproduisant exactement l'ancien début de resolveClassIdForAuth :
// `String(raw || '').trim()` puis Number si non vide (NaN conservé — il part en lookup DB et
// échoue comme avant), sinon null (→ replis token / joueur / première classe active).
const glStatsClassQuerySchema = z
  .object({ class_id: z.unknown().optional() })
  .transform((q) => {
    const requested = String(q.class_id || '').trim();
    return { class_id: requested ? Number(requested) : null };
  });

async function resolveVitalityEnabled() {
  const settings = await getGameplaySettings();
  return settings.vitalityEnabled === true;
}

// `requestedClassId` : nombre déjà coercé par glStatsClassQuerySchema (null = non demandé,
// NaN possible et envoyé au lookup comme avant — aucune ligne → null → 400 du handler).
async function resolveClassIdForAuth(auth, requestedClassId) {
  if (requestedClassId != null) {
    const row = await queryOne(
      'SELECT id FROM gl_classes WHERE id = ? AND is_active = 1 LIMIT 1',
      [requestedClassId]
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
router.get('/class', requireGlPermission('gl.players.manage'), validate({ query: glStatsClassQuerySchema }), async (req, res) => {
  try {
    const classId = await resolveClassIdForAuth(req.glAuth, req.validatedQuery?.class_id);
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
module.exports.glStatsClassQuerySchema = glStatsClassQuerySchema; // exporté pour test no-DB du contrat O7
