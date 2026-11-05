'use strict';

/**
 * Routes de gestion ajoutées pour le connecteur Claude (lot D, 05/11/2026), utiles aussi à
 * l'interface : dupliquer une tâche, générer tout de suite l'occurrence suivante d'une série,
 * ajouter un compte rendu au nom de la gestion. Montées par `routes/tasks.js` (chemins
 * `/api/tasks/:id/…`). Réservées à `tasks.manage`.
 */

const express = require('express');
const crypto = require('node:crypto');
const { queryOne, execute, withTransaction } = require('../../database');
const { requirePermission } = require('../../middleware/requireTeacher');
const asyncHandler = require('../../lib/asyncHandler');
const { logAudit } = require('../../lib/auditLog');
const { emitTasksChanged } = require('../../lib/realtime');
const { nowDbTimestamp } = require('../../lib/shared/isoTimestamp');
const { saveBase64ToDisk } = require('../../lib/uploads');
const { syncTaskProjectCompletionForProjects } = require('../../lib/syncTaskProjectCompletion');
const { getTaskWithAssignments } = require('../../lib/tasks/taskQueries');
const { resolveTaskMapId } = require('../../lib/taskRouteHelpers');
const { spawnRecurringTaskNow } = require('../../lib/recurringTasks');

const router = express.Router();

/** Date locale du jour (`AAAA-MM-JJ`), comme la duplication d'un projet. */
function currentLocalDateOnly() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const SPAWN_REASONS = Object.freeze({
  not_found: [404, 'Tâche introuvable'],
  not_recurring: [400, 'Cette tâche n’est pas récurrente'],
  archived: [409, 'Tâche archivée : désarchivez-la d’abord'],
  not_validated: [409, 'Validez d’abord l’occurrence courante de la série'],
  already_spawned: [409, 'L’occurrence suivante existe déjà'],
});

/**
 * POST /api/tasks/:id/duplicate — copie active (statut `available`, démarrage aujourd'hui) avec
 * ses lieux, tutoriels, espèces et référents ; ni inscriptions ni comptes rendus. Titre
 * `{titre} (copie)` sauf `title` fourni. Même contenu copié que la duplication d'un projet.
 */
router.post(
  '/:id/duplicate',
  requirePermission('tasks.manage'),
  asyncHandler(async (req, res) => {
    const src = await queryOne('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!src) return res.status(404).json({ error: 'Tâche introuvable' });
    const requested = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const title = (requested || `${src.title} (copie)`).slice(0, 255);
    const newId = crypto.randomUUID();
    await withTransaction(async (tx) => {
      await tx.execute(
        `INSERT INTO tasks (
          id, title, description, map_id, project_id, zone_id, marker_id,
          start_date, due_date, required_students, completion_mode, danger_level,
          difficulty_level, importance_level, recurrence, sort_order, status, created_at,
          group_id, pedago_session_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?, ?)`,
        [
          newId,
          title,
          src.description || '',
          src.map_id || null,
          src.project_id || null,
          src.zone_id || null,
          src.marker_id || null,
          currentLocalDateOnly(),
          src.due_date || null,
          src.required_students != null ? Number(src.required_students) : 1,
          src.completion_mode || 'single_done',
          src.danger_level || null,
          src.difficulty_level || null,
          src.importance_level || null,
          src.recurrence || null,
          Number(src.sort_order) || 0,
          nowDbTimestamp(),
          src.group_id || null,
          src.pedago_session_id || null,
        ],
      );
      for (const [table, col] of [
        ['task_zones', 'zone_id'],
        ['task_markers', 'marker_id'],
        ['task_tutorials', 'tutorial_id'],
        ['task_species', 'plant_id'],
        ['task_referents', 'user_id'],
      ]) {
        const rows = await tx.queryAll(`SELECT ${col} AS v FROM ${table} WHERE task_id = ?`, [
          src.id,
        ]);
        for (const r of rows) {
          await tx.execute(`INSERT INTO ${table} (task_id, ${col}) VALUES (?, ?)`, [newId, r.v]);
        }
      }
    });
    logAudit('duplicate_task', 'task', newId, title, {
      req,
      payload: { source_task_id: src.id },
    });
    const created = await getTaskWithAssignments(newId);
    emitTasksChanged({ reason: 'duplicate_task', taskId: newId, mapId: resolveTaskMapId(created) });
    await syncTaskProjectCompletionForProjects([src.project_id]);
    return res.status(201).json(created);
  }),
);

/**
 * POST /api/tasks/:id/recurrence/spawn — génère tout de suite l'occurrence suivante d'une série
 * récurrente (occurrence courante validée). Réponse `201 { created, task }`.
 */
router.post(
  '/:id/recurrence/spawn',
  requirePermission('tasks.manage'),
  asyncHandler(async (req, res) => {
    const out = await spawnRecurringTaskNow(req.params.id);
    if (!out.created) {
      const [status, error] = SPAWN_REASONS[out.reason] || [400, 'Génération impossible'];
      return res.status(status).json({ error, code: out.reason });
    }
    const task = await getTaskWithAssignments(out.created);
    emitTasksChanged({
      reason: 'recurring_spawn',
      taskId: out.created,
      mapId: resolveTaskMapId(task),
    });
    return res.status(201).json({ created: out.created, task });
  }),
);

/**
 * POST /api/tasks/:id/logs — compte rendu ajouté par la gestion (`comment`, `imageData` en data
 * URL facultative, `student_id` facultatif pour l'attribuer à un élève). Ne change ni le statut
 * ni les inscriptions.
 */
router.post(
  '/:id/logs',
  requirePermission('tasks.manage'),
  asyncHandler(async (req, res) => {
    const task = await queryOne(
      'SELECT id, title, map_id, zone_id, marker_id FROM tasks WHERE id = ?',
      [req.params.id],
    );
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : '';
    const imageData = req.body?.imageData || null;
    if (!comment && !imageData) {
      return res.status(400).json({ error: 'Commentaire ou image requis' });
    }
    if (comment.length > 5000) return res.status(400).json({ error: 'Commentaire trop long' });
    let studentId = null;
    let firstName = '';
    let lastName = '';
    if (req.body?.student_id) {
      const student = await queryOne(
        "SELECT id, first_name, last_name FROM users WHERE id = ? AND user_type = 'student' LIMIT 1",
        [String(req.body.student_id)],
      );
      if (!student) return res.status(400).json({ error: 'Élève introuvable' });
      studentId = student.id;
      firstName = student.first_name || '';
      lastName = student.last_name || '';
    }
    const result = await execute(
      'INSERT INTO task_logs (task_id, student_id, student_first_name, student_last_name, comment, image_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [task.id, studentId, firstName, lastName, comment, null, nowDbTimestamp()],
    );
    const logId = result.insertId;
    if (imageData) {
      const relativePath = `task-logs/${task.id}_${logId}.jpg`;
      try {
        await saveBase64ToDisk(relativePath, imageData);
      } catch (err) {
        await execute('DELETE FROM task_logs WHERE id = ?', [logId]);
        return res.status(400).json({ error: err?.message || 'Image invalide' });
      }
      await execute('UPDATE task_logs SET image_path = ? WHERE id = ?', [relativePath, logId]);
    }
    logAudit('add_task_log', 'task_log', String(logId), task.title, {
      req,
      payload: { task_id: task.id, with_image: !!imageData, student_id: studentId },
    });
    emitTasksChanged({ reason: 'task_log_added', taskId: task.id, mapId: resolveTaskMapId(task) });
    const row = await queryOne(
      'SELECT id, task_id, student_id, comment, image_path, created_at FROM task_logs WHERE id = ?',
      [logId],
    );
    return res.status(201).json({ ...row, has_image: !!row.image_path, image_path: undefined });
  }),
);

module.exports = router;
