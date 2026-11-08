'use strict';

/**
 * « Tenir à deux » v2 — exports CSV par classe (spec § 11), `gl.game.manage`.
 * Monté sous `/api/gl/admin` (server.js) : `GET /classes/:classId/exports/team-spirit.csv`,
 * `GET /classes/:classId/exports/badges.csv`. Aucun classement, aucune bourse.
 */

const express = require('express');
const db = require('../../database');
const { requireGlPermission } = require('../../middleware/requireGlAuth');
const asyncHandler = require('../../lib/asyncHandler');
const { parseId } = require('../../lib/shared/httpHelpers');
const { buildTeamSpiritCsv, buildBadgesCsv } = require('../../lib/glTenirExports');

const router = express.Router();

function sendCsv(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(csv);
}

/** La classe de démonstration (joueurs fictifs) n'a rien à exporter : refus explicite. */
function rejectDemoClass(res, cls) {
  if (!Number(cls?.is_demo)) return false;
  res.status(400).json({ error: 'Classe de démonstration : aucun export' });
  return true;
}

async function loadClass(classId) {
  return db.queryOne('SELECT id, name, is_demo FROM gl_classes WHERE id = ? LIMIT 1', [classId]);
}

router.get(
  '/classes/:classId/exports/team-spirit.csv',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const classId = parseId(req.params.classId);
    if (!classId) return res.status(400).json({ error: 'Identifiant de classe invalide' });
    const cls = await loadClass(classId);
    if (!cls) return res.status(404).json({ error: 'Classe introuvable' });
    if (rejectDemoClass(res, cls)) return undefined;
    return sendCsv(
      res,
      `gl-team-spirit-classe-${classId}.csv`,
      await buildTeamSpiritCsv(db, classId),
    );
  }),
);

router.get(
  '/classes/:classId/exports/badges.csv',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const classId = parseId(req.params.classId);
    if (!classId) return res.status(400).json({ error: 'Identifiant de classe invalide' });
    const cls = await loadClass(classId);
    if (!cls) return res.status(404).json({ error: 'Classe introuvable' });
    if (rejectDemoClass(res, cls)) return undefined;
    return sendCsv(res, `gl-badges-classe-${classId}.csv`, await buildBadgesCsv(db, classId));
  }),
);

module.exports = router;
