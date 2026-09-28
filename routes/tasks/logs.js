const express = require('express');
const { queryAll, queryOne, execute } = require('../../database');
const {
  requirePermission,
  JWT_SECRET,
  hydrateAuthFromTokenClaims,
} = require('../../middleware/requireTeacher');
const { getAbsolutePath } = require('../../lib/uploads');
const asyncHandler = require('../../lib/asyncHandler');
const { logAudit } = require('../../lib/auditLog');
const { emitTasksChanged } = require('../../lib/realtime');
const { resolveTaskMapId } = require('../../lib/taskRouteHelpers');
const { isVisitorRole } = require('../../lib/taskAuthzHelpers');
const { parseOptionalForetAuth } = require('../../lib/auth/jwtPipeline');
const { filterLogsForViewer } = require('../../lib/tasks/assignmentVisibility');

const router = express.Router();

async function parseOptionalAuth(req) {
  return parseOptionalForetAuth(req, { jwtSecret: JWT_SECRET, hydrateAuthFromTokenClaims });
}

router.get(
  '/:id/logs',
  asyncHandler(async (req, res) => {
    const auth = await parseOptionalAuth(req);
    // Journaux = PII (prénoms/noms, commentaires) : jamais pour un anonyme ni un visiteur ;
    // pour un n3beur, selon `tasks.logs_visibility` (cf. lib/tasks/assignmentVisibility.js).
    if (!auth || isVisitorRole(auth)) {
      return res.status(403).json({ error: 'Accès refusé aux journaux de tâche' });
    }
    const allLogs = await queryAll(
      'SELECT id, task_id, student_id, student_first_name, student_last_name, comment, image_path, created_at FROM task_logs WHERE task_id = ? ORDER BY created_at DESC',
      [req.params.id],
    );
    const { allowed, rows: logs } = await filterLogsForViewer(auth, req.params.id, allLogs);
    if (!allowed) return res.status(403).json({ error: 'Accès refusé aux journaux de tâche' });
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

// Photo d'un journal de tâche : MÊME politique que la route liste ci-dessus (compte connecté,
// profil non visiteur, puis `tasks.logs_visibility` appliqué à l'entrée). L'image était
// servie sans aucun contrôle alors que la liste qui la référence est gardée — et les identifiants étant séquentiels, les photos de n3beurs étaient
// énumérables sans jeton (cf. audit B3, docs/AUDIT_BUGS_2026-07.md).
//
// Volontairement aligné sur la liste, et non sur la politique plus stricte des observations
// (propriétaire / n3boss) : le journal de tâche est un compte rendu collaboratif, déjà lisible
// par tous les inscrits de la tâche. Durcir l'image seule casserait leur affichage.
router.get(
  '/:id/logs/:logId/image',
  asyncHandler(async (req, res) => {
    const auth = await parseOptionalAuth(req);
    if (!auth || isVisitorRole(auth)) {
      return res.status(403).json({ error: 'Accès refusé à cette image' });
    }
    const log = await queryOne(
      'SELECT image_path, student_id, student_first_name, student_last_name FROM task_logs WHERE id = ? AND task_id = ?',
      [req.params.logId, req.params.id],
    );
    if (!log) return res.status(404).json({ error: 'Log introuvable' });
    const { allowed, rows } = await filterLogsForViewer(auth, req.params.id, [log]);
    if (!allowed || rows.length === 0) {
      return res.status(403).json({ error: 'Accès refusé à cette image' });
    }
    if (log.image_path) {
      const absolutePath = getAbsolutePath(log.image_path);
      return res.sendFile(absolutePath, { dotfiles: 'allow' }, (err) => {
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
