const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, execute } = require('../database');
const { requireTeacher } = require('../middleware/requireTeacher');
const { saveBase64ToDisk, getAbsolutePath } = require('../lib/uploads');
const { logRouteError } = require('../lib/routeLog');
const { logAudit } = require('./audit');
const { emitTasksChanged } = require('../lib/realtime');

const router = express.Router();

function sanitizeRequiredStudents(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

async function getTaskWithAssignments(taskId) {
  const task = await queryOne(
    'SELECT t.*, z.name as zone_name FROM tasks t LEFT JOIN zones z ON t.zone_id = z.id WHERE t.id = ?',
    [taskId]
  );
  if (!task) return null;
  task.assignments = await queryAll('SELECT * FROM task_assignments WHERE task_id = ? ORDER BY assigned_at', [taskId]);
  return task;
}

router.get('/', async (req, res) => {
  try {
    const tasks = await queryAll(
      'SELECT t.*, z.name as zone_name FROM tasks t LEFT JOIN zones z ON t.zone_id = z.id ORDER BY due_date ASC'
    );
    const assignments = await queryAll('SELECT * FROM task_assignments');
    res.json(tasks.map(t => ({
      ...t,
      assignments: assignments.filter(a => a.task_id === t.id)
    })));
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const task = await getTaskWithAssignments(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    res.json(task);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.post('/', requireTeacher, async (req, res) => {
  try {
    const { title, description, zone_id, due_date, required_students, recurrence } = req.body;
    if (!title) return res.status(400).json({ error: 'Titre requis' });
    const reqStudents = sanitizeRequiredStudents(required_students);
    const id = uuidv4();
    await execute(
      'INSERT INTO tasks (id, title, description, zone_id, due_date, required_students, recurrence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, title, description || '', zone_id || null, due_date || null, reqStudents, recurrence || null, new Date().toISOString()]
    );
    const task = await getTaskWithAssignments(id);
    logAudit('create_task', 'task', id, title);
    emitTasksChanged({ reason: 'create_task', taskId: id });
    res.status(201).json(task);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', requireTeacher, async (req, res) => {
  try {
    const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    const { title, description, zone_id, due_date, required_students, status, recurrence } = req.body;
    const reqStudents = required_students != null
      ? sanitizeRequiredStudents(required_students)
      : task.required_students;
    await execute(
      'UPDATE tasks SET title=?, description=?, zone_id=?, due_date=?, required_students=?, status=?, recurrence=? WHERE id=?',
      [
        title ?? task.title,
        description ?? task.description,
        zone_id ?? task.zone_id,
        due_date ?? task.due_date,
        reqStudents,
        status ?? task.status,
        recurrence !== undefined ? (recurrence || null) : (task.recurrence || null),
        task.id
      ]
    );
    const updated = await getTaskWithAssignments(task.id);
    emitTasksChanged({ reason: 'update_task', taskId: task.id });
    res.json(updated);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requireTeacher, async (req, res) => {
  try {
    const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    await execute('DELETE FROM task_logs WHERE task_id = ?', [req.params.id]);
    await execute('DELETE FROM task_assignments WHERE task_id = ?', [req.params.id]);
    await execute('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    logAudit('delete_task', 'task', req.params.id, task.title);
    emitTasksChanged({ reason: 'delete_task', taskId: req.params.id });
    res.json({ success: true });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/assign', async (req, res) => {
  try {
    const task = await getTaskWithAssignments(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    if (task.status === 'validated') return res.status(400).json({ error: 'Tâche déjà validée' });

    const { firstName, lastName, studentId } = req.body;
    if (!firstName || !lastName) return res.status(400).json({ error: 'Nom requis' });

    if (studentId) {
      const exists = await queryOne('SELECT id FROM students WHERE id = ?', [studentId]);
      if (!exists) return res.status(401).json({ error: 'Compte supprimé', deleted: true });
    }

    const already = task.assignments.find(
      a => String(a.student_first_name).toLowerCase() === firstName.toLowerCase() &&
           String(a.student_last_name).toLowerCase() === lastName.toLowerCase()
    );
    if (already) return res.status(400).json({ error: 'Déjà assigné à cette tâche' });

    if (task.assignments.length >= task.required_students) {
      return res.status(400).json({ error: 'Plus de place disponible sur cette tâche' });
    }

    await execute(
      'INSERT INTO task_assignments (task_id, student_first_name, student_last_name, assigned_at) VALUES (?, ?, ?, ?)',
      [task.id, firstName, lastName, new Date().toISOString()]
    );

    const newCount = task.assignments.length + 1;
    const newStatus = newCount >= task.required_students ? 'in_progress' : 'available';
    await execute('UPDATE tasks SET status = ? WHERE id = ?', [newStatus, task.id]);

    const updated = await getTaskWithAssignments(task.id);
    emitTasksChanged({ reason: 'assign', taskId: task.id });
    res.json(updated);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/done', async (req, res) => {
  try {
    const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });

    const { comment, imageData, firstName, lastName, studentId } = req.body || {};

    if (studentId) {
      const exists = await queryOne('SELECT id FROM students WHERE id = ?', [studentId]);
      if (!exists) return res.status(401).json({ error: 'Compte supprimé', deleted: true });
    }

    if (comment || imageData) {
      const result = await execute(
        'INSERT INTO task_logs (task_id, student_first_name, student_last_name, comment, image_data, image_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [task.id, firstName || '', lastName || '', comment || '', imageData || null, null, new Date().toISOString()]
      );
      const logId = result.insertId;
      if (imageData) {
        const relativePath = `task-logs/${task.id}_${logId}.jpg`;
        try {
          saveBase64ToDisk(relativePath, imageData);
        } catch (fileErr) {
          await execute('DELETE FROM task_logs WHERE id = ?', [logId]);
          throw fileErr;
        }
        await execute('UPDATE task_logs SET image_path = ?, image_data = NULL WHERE id = ?', [relativePath, logId]);
      }
    }

    await execute("UPDATE tasks SET status = 'done' WHERE id = ?", [task.id]);
    const updated = await getTaskWithAssignments(task.id);
    emitTasksChanged({ reason: 'done', taskId: task.id });
    res.json(updated);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/logs', async (req, res) => {
  try {
    const logs = await queryAll(
      'SELECT id, task_id, student_first_name, student_last_name, comment, image_data, image_path, created_at FROM task_logs WHERE task_id = ? ORDER BY created_at DESC',
      [req.params.id]
    );
    const taskId = req.params.id;
    const baseUrl = `/api/tasks/${taskId}/logs`;
    res.json(logs.map(l => ({
      ...l,
      image_url: l.image_path ? `${baseUrl}/${l.id}/image` : null,
    })));
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/logs/:logId/image', async (req, res) => {
  try {
    const log = await queryOne('SELECT image_path, image_data FROM task_logs WHERE id = ? AND task_id = ?', [req.params.logId, req.params.id]);
    if (!log) return res.status(404).json({ error: 'Log introuvable' });
    if (log.image_path) {
      const absolutePath = getAbsolutePath(log.image_path);
      return res.sendFile(absolutePath, (err) => {
        if (err && !res.headersSent) res.status(404).json({ error: 'Fichier introuvable' });
      });
    }
    if (log.image_data) return res.json({ image_data: log.image_data });
    res.status(404).json({ error: 'Aucune image' });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

// Suppression d'un log de tâche (modération prof)
router.delete('/:id/logs/:logId', requireTeacher, async (req, res) => {
  try {
    const log = await queryOne('SELECT * FROM task_logs WHERE id = ? AND task_id = ?', [req.params.logId, req.params.id]);
    if (!log) return res.status(404).json({ error: 'Rapport introuvable' });
    if (log.image_path) {
      const fs = require('fs');
      const absPath = getAbsolutePath(log.image_path);
      try { fs.unlinkSync(absPath); } catch (_) { /* fichier absent, ok */ }
    }
    await execute('DELETE FROM task_logs WHERE id = ?', [req.params.logId]);
    logAudit('delete_log', 'task_log', req.params.logId, `Tâche ${req.params.id}`);
    emitTasksChanged({ reason: 'delete_log', taskId: req.params.id });
    res.json({ success: true });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/validate', requireTeacher, async (req, res) => {
  try {
    const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    await execute("UPDATE tasks SET status = 'validated' WHERE id = ?", [req.params.id]);
    logAudit('validate_task', 'task', req.params.id, task.title);
    const updated = await getTaskWithAssignments(task.id);
    emitTasksChanged({ reason: 'validate', taskId: task.id });
    res.json(updated);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/unassign', requireTeacher, async (req, res) => {
  try {
    const task = await getTaskWithAssignments(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    if (task.status === 'done' || task.status === 'validated') {
      return res.status(400).json({ error: 'Impossible de quitter une tâche déjà terminée' });
    }

    const { firstName, lastName, studentId } = req.body;
    if (!firstName || !lastName) return res.status(400).json({ error: 'Nom requis' });

    if (studentId) {
      const exists = await queryOne('SELECT id FROM students WHERE id = ?', [studentId]);
      if (!exists) return res.status(401).json({ error: 'Compte supprimé', deleted: true });
    }

    await execute(
      'DELETE FROM task_assignments WHERE task_id = ? AND student_first_name = ? AND student_last_name = ?',
      [task.id, firstName, lastName]
    );

    const remainingRow = await queryOne('SELECT COUNT(*) AS c FROM task_assignments WHERE task_id = ?', [task.id]);
    const remaining = remainingRow ? Number(remainingRow.c) : 0;

    let newStatus;
    if (remaining === 0) {
      newStatus = 'available';
    } else if (remaining >= task.required_students) {
      newStatus = task.status === 'done' ? 'done' : 'in_progress';
    } else {
      newStatus = 'available';
    }
    await execute('UPDATE tasks SET status = ? WHERE id = ?', [newStatus, task.id]);

    const updated = await getTaskWithAssignments(task.id);
    emitTasksChanged({ reason: 'unassign', taskId: task.id });
    res.json(updated);
  } catch (err) {
    logRouteError(err, req, 'Erreur retrait assignation tâche');
    res.status(500).json({ error: 'Erreur lors du retrait : ' + err.message });
  }
});

module.exports = router;
