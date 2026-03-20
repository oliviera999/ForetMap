const express = require('express');
const { queryAll, queryOne } = require('../database');
const { requireTeacher } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');

const router = express.Router();

async function studentStats(studentId) {
  const s = await queryOne('SELECT * FROM students WHERE id = ?', [studentId]);
  if (!s) return null;
  const assignments = await queryAll(
    `SELECT ta.*, t.status, t.title, t.due_date, t.zone_id, z.name as zone_name
     FROM task_assignments ta
     JOIN tasks t ON ta.task_id = t.id
     LEFT JOIN zones z ON t.zone_id = z.id
     WHERE ta.student_first_name = ? AND ta.student_last_name = ?
     ORDER BY ta.assigned_at DESC`,
    [s.first_name, s.last_name]
  );
  const done      = assignments.filter(a => a.status === 'validated').length;
  const pending   = assignments.filter(a => a.status === 'available' || a.status === 'in_progress').length;
  const submitted = assignments.filter(a => a.status === 'done').length;
  const total     = assignments.length;
  return { ...s, password: undefined, stats: { done, pending, submitted, total }, assignments };
}

router.get('/me/:studentId', async (req, res) => {
  try {
    const data = await studentStats(req.params.studentId);
    if (!data) return res.status(404).json({ error: 'Élève introuvable' });
    res.json(data);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.get('/all', requireTeacher, async (req, res) => {
  try {
    const students = await queryAll('SELECT * FROM students');
    const result = await Promise.all(students.map(async (s) => {
      const assignments = await queryAll(
        `SELECT ta.*, t.status FROM task_assignments ta
         JOIN tasks t ON ta.task_id = t.id
         WHERE ta.student_first_name = ? AND ta.student_last_name = ?`,
        [s.first_name, s.last_name]
      );
      return {
        id: s.id,
        first_name: s.first_name,
        last_name: s.last_name,
        last_seen: s.last_seen,
        stats: {
          total: assignments.length,
          done: assignments.filter(a => a.status === 'validated').length,
          pending: assignments.filter(a => a.status === 'available' || a.status === 'in_progress').length,
          submitted: assignments.filter(a => a.status === 'done').length,
        }
      };
    }));
    result.sort((a, b) => b.stats.done - a.stats.done);
    res.json(result);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

// Export CSV des stats élèves (prof uniquement)
router.get('/export', requireTeacher, async (req, res) => {
  try {
    const students = await queryAll('SELECT * FROM students');
    const result = await Promise.all(students.map(async (s) => {
      const assignments = await queryAll(
        `SELECT ta.*, t.status FROM task_assignments ta
         JOIN tasks t ON ta.task_id = t.id
         WHERE ta.student_first_name = ? AND ta.student_last_name = ?`,
        [s.first_name, s.last_name]
      );
      return {
        first_name: s.first_name,
        last_name: s.last_name,
        last_seen: s.last_seen,
        validated: assignments.filter(a => a.status === 'validated').length,
        pending: assignments.filter(a => a.status === 'available' || a.status === 'in_progress').length,
        submitted: assignments.filter(a => a.status === 'done').length,
        total: assignments.length,
      };
    }));
    result.sort((a, b) => b.validated - a.validated);

    const headers = ['Prénom', 'Nom', 'Validées', 'En cours', 'En attente', 'Total', 'Dernière connexion'];
    const escapeCSV = v => {
      const s = String(v ?? '');
      return s.includes(';') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = result.map(s => [
      s.first_name, s.last_name, s.validated, s.pending, s.submitted, s.total,
      s.last_seen ? new Date(s.last_seen).toLocaleDateString('fr-FR') : 'Jamais'
    ].map(escapeCSV).join(';'));

    const BOM = '\uFEFF';
    const csv = BOM + [headers.join(';'), ...rows].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="foretmap-stats-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(csv);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
