const express = require('express');
const { queryAll, queryOne, execute } = require('../../database');
const {
  requirePermission,
  JWT_SECRET,
  hydrateAuthFromTokenClaims,
} = require('../../middleware/requireTeacher');
const { getAbsolutePath } = require('../../lib/uploads');
const asyncHandler = require('../../lib/asyncHandler');
const { logAudit } = require('../audit');
const { emitTasksChanged } = require('../../lib/realtime');
const { resolveTaskMapId } = require('../../lib/taskRouteHelpers');
const { isVisitorRole } = require('../../lib/taskAuthzHelpers');
const { parseOptionalForetAuth } = require('../../lib/auth/jwtPipeline');

const router = express.Router();

async function parseOptionalAuth(req) {
  return parseOptionalForetAuth(req, { jwtSecret: JWT_SECRET, hydrateAuthFromTokenClaims });
}

router.get(
  '/:id/logs',
  asyncHandler(async (req, res) => {
    const auth = await parseOptionalAuth(req);
    if (isVisitorRole(auth)) {
      return res
        .status(403)
        .json({ error: 'Accès refusé aux journaux de tâche pour le profil visiteur' });
    }
    const logs = await queryAll(
      'SELECT id, task_id, student_id, student_first_name, student_last_name, comment, image_path, created_at FROM task_logs WHERE task_id = ? ORDER BY created_at DESC',
      [req.params.id],
    );
    const taskId = req.params.id;
    const baseUrl = `/api/tasks/${taskId}/logs`;
    res.json(
      logs.map((l) => ({
        ...l,
        image_url: l.image_path ? `${baseUrl}/${l.id}/image` : null,
      })),
    );
  }),
);

router.get(
  '/:id/logs/:logId/image',
  asyncHandler(async (req, res) => {
    const log = await queryOne('SELECT image_path FROM task_logs WHERE id = ? AND task_id = ?', [
      req.params.logId,
      req.params.id,
    ]);
    if (!log) return res.status(404).json({ error: 'Log introuvable' });
    if (log.image_path) {
      const absolutePath = getAbsolutePath(log.image_path);
      return res.sendFile(absolutePath, (err) => {
        if (err && !res.headersSent) res.status(404).json({ error: 'Fichier introuvable' });
      });
    }
    res.status(404).json({ error: 'Aucune image' });
  }),
);

router.delete(
  '/:id/logs/:logId',
  requirePermission('tasks.manage'),
  asyncHandler(async (req, res) => {
    const log = await queryOne('SELECT * FROM task_logs WHERE id = ? AND task_id = ?', [
      req.params.logId,
      req.params.id,
    ]);
    const taskForLog = await queryOne('SELECT map_id FROM tasks WHERE id = ?', [req.params.id]);
    if (!log) return res.status(404).json({ error: 'Rapport introuvable' });
    if (log.image_path) {
      const fs = require('fs');
      const absPath = getAbsolutePath(log.image_path);
      try {
        fs.unlinkSync(absPath);
      } catch (_) {
        /* fichier absent */
      }
    }
    await execute('DELETE FROM task_logs WHERE id = ?', [req.params.logId]);
    logAudit('delete_log', 'task_log', req.params.logId, `Tâche ${req.params.id}`, { req });
    emitTasksChanged({
      reason: 'delete_log',
      taskId: req.params.id,
      mapId: resolveTaskMapId(taskForLog),
    });
    res.json({ success: true });
  }),
);

module.exports = router;
