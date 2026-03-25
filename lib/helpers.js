const { queryAll, queryOne } = require('../database');

async function getTaskWithAssignments(taskId) {
  const task = await queryOne(
    'SELECT t.*, z.name as zone_name FROM tasks t LEFT JOIN zones z ON t.zone_id = z.id WHERE t.id = ?',
    [taskId]
  );
  if (!task) return null;
  task.assignments = await queryAll('SELECT * FROM task_assignments WHERE task_id = ? ORDER BY assigned_at', [taskId]);
  return task;
}

async function studentStats(studentId) {
  const s = await queryOne('SELECT * FROM students WHERE id = ?', [studentId]);
  if (!s) return null;
  const assignments = await queryAll(
    `SELECT ta.*, t.status, t.title, t.due_date, t.zone_id, z.name as zone_name
     FROM task_assignments ta
     JOIN tasks t ON ta.task_id = t.id
     LEFT JOIN zones z ON t.zone_id = z.id
     WHERE ta.student_id = ? OR (ta.student_first_name = ? AND ta.student_last_name = ?)
     ORDER BY ta.assigned_at DESC`,
    [s.id, s.first_name, s.last_name]
  );
  const done      = assignments.filter(a => a.status === 'validated').length;
  const pending   = assignments.filter(a => a.status === 'available' || a.status === 'in_progress').length;
  const submitted = assignments.filter(a => a.status === 'done').length;
  const total     = assignments.length;
  return { ...s, password: undefined, stats: { done, pending, submitted, total }, assignments };
}

module.exports = { getTaskWithAssignments, studentStats };
