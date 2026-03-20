const express = require('express');
const { queryAll, execute } = require('../database');
const { requireTeacher } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');

const router = express.Router();

// Consulter l'historique (prof uniquement)
router.get('/', requireTeacher, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const rows = await queryAll(
      'SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?',
      [limit]
    );
    res.json(rows);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Enregistre une action dans l'audit log.
 * Importé et appelé depuis les autres routes.
 */
async function logAudit(action, targetType, targetId, details) {
  try {
    await execute(
      'INSERT INTO audit_log (action, target_type, target_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
      [action, targetType, targetId || null, details || null, new Date().toISOString()]
    );
  } catch (_) {
    // Ne pas bloquer l'action principale si l'audit échoue
  }
}

module.exports = router;
module.exports.logAudit = logAudit;
