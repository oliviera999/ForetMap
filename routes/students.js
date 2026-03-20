const express = require('express');
const { queryAll, queryOne, execute } = require('../database');
const { requireTeacher } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const { logAudit } = require('./audit');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { studentId } = req.body;
    if (!studentId) return res.status(400).json({ error: 'studentId requis' });
    const s = await queryOne('SELECT * FROM students WHERE id = ?', [studentId]);
    if (!s) return res.status(401).json({ error: 'Compte supprimé', deleted: true });
    await execute('UPDATE students SET last_seen = ? WHERE id = ?', [new Date().toISOString(), studentId]);
    res.json({ ...s, password: undefined });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requireTeacher, async (req, res) => {
  try {
    const s = await queryOne('SELECT * FROM students WHERE id = ?', [req.params.id]);
    if (!s) return res.status(404).json({ error: 'Élève introuvable' });

    const affectedRows = await queryAll(
      'SELECT DISTINCT task_id FROM task_assignments WHERE student_first_name = ? AND student_last_name = ?',
      [s.first_name, s.last_name]
    );
    const affectedTasks = affectedRows.map(r => r.task_id);

    await execute(
      'DELETE FROM task_assignments WHERE student_first_name = ? AND student_last_name = ?',
      [s.first_name, s.last_name]
    );
    await execute(
      'DELETE FROM task_logs WHERE student_first_name = ? AND student_last_name = ?',
      [s.first_name, s.last_name]
    );

    for (const taskId of affectedTasks) {
      const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [taskId]);
      if (!task) continue;
      if (task.status === 'validated') continue;

      const remainingRow = await queryOne('SELECT COUNT(*) AS c FROM task_assignments WHERE task_id = ?', [taskId]);
      const remaining = remainingRow ? Number(remainingRow.c) : 0;

      let newStatus;
      if (remaining === 0) {
        newStatus = 'available';
      } else if (remaining >= task.required_students) {
        newStatus = task.status === 'done' ? 'done' : 'in_progress';
      } else {
        newStatus = 'available';
      }
      await execute('UPDATE tasks SET status = ? WHERE id = ?', [newStatus, taskId]);
    }

    await execute('DELETE FROM students WHERE id = ?', [req.params.id]);
    logAudit('delete_student', 'student', req.params.id, `${s.first_name} ${s.last_name}`);
    res.json({ success: true });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
