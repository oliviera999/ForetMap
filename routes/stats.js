const express = require('express');
const { queryAll, queryOne } = require('../database');
const { requireAuth, requirePermission } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const { getStudentProgressionConfig, syncStudentPrimaryRoleFromProgress } = require('../lib/rbac');

const router = express.Router();

async function userStats(userId) {
  const s = await queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
  if (!s) return null;
  const isStudent = String(s.user_type || '').toLowerCase() === 'student';
  const progressionConfig = isStudent ? await getStudentProgressionConfig() : null;
  let assignments = [];
  if (isStudent) {
    assignments = await queryAll(
      `SELECT ta.*, t.status, t.title, t.due_date, t.zone_id, z.name as zone_name
       FROM task_assignments ta
       JOIN tasks t ON ta.task_id = t.id
       LEFT JOIN zones z ON t.zone_id = z.id
       WHERE ta.student_id = ? OR (ta.student_first_name = ? AND ta.student_last_name = ?)
       ORDER BY ta.assigned_at DESC`,
      [s.id, s.first_name, s.last_name]
    );
  }
  const done = assignments.filter((a) => a.status === 'validated').length;
  const pending = assignments.filter((a) => a.status === 'available' || a.status === 'in_progress').length;
  const submitted = assignments.filter((a) => a.status === 'done').length;
  const total = assignments.length;
  let progression = null;
  if (isStudent) {
    const sync = await syncStudentPrimaryRoleFromProgress(s.id, done, progressionConfig);
    progression = {
      thresholds: sync.thresholds,
      steps: sync.steps,
      roleSlug: sync.currentRoleSlug,
      roleDisplayName: sync.currentRoleDisplayName,
      autoProgressionEnabled: sync.autoProgressionEnabled !== false,
    };
  }
  return {
    id: s.id,
    user_type: s.user_type,
    first_name: s.first_name,
    last_name: s.last_name,
    display_name: s.display_name,
    email: s.email,
    affiliation: s.affiliation,
    pseudo: s.pseudo,
    description: s.description,
    avatar_path: s.avatar_path,
    last_seen: s.last_seen,
    stats: { done, pending, submitted, total },
    progression,
    assignments,
  };
}

router.get('/me/:studentId', requireAuth, async (req, res) => {
  try {
    const askedStudentId = String(req.params.studentId || '').trim();
    const auth = req.auth || null;
    const perms = Array.isArray(auth?.permissions) ? auth.permissions : [];
    const canReadAll = perms.includes('stats.read.all');
    // Autorise l'accès aux propres stats sur l'ID du compte, y compris profils legacy.
    const isOwner = String(auth?.userId || '') === askedStudentId;
    if (!canReadAll && !isOwner) {
      return res.status(403).json({ error: 'Accès refusé à ces statistiques' });
    }
    const data = await userStats(askedStudentId);
    if (!data) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(data);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.get('/all', requirePermission('stats.read.all'), async (req, res) => {
  try {
    const students = await queryAll("SELECT * FROM users WHERE user_type = 'student'");
    const progressionConfig = await getStudentProgressionConfig();
    const result = await Promise.all(students.map(async (s) => {
      const assignments = await queryAll(
        `SELECT ta.*, t.status FROM task_assignments ta
         JOIN tasks t ON ta.task_id = t.id
         WHERE ta.student_id = ? OR (ta.student_first_name = ? AND ta.student_last_name = ?)`,
        [s.id, s.first_name, s.last_name]
      );
      const done = assignments.filter(a => a.status === 'validated').length;
      const sync = await syncStudentPrimaryRoleFromProgress(s.id, done, progressionConfig);
      const currentStep = (sync.steps || []).find((step) => String(step.roleSlug) === String(sync.currentRoleSlug));
      return {
        id: s.id,
        first_name: s.first_name,
        last_name: s.last_name,
        pseudo: s.pseudo,
        description: s.description,
        avatar_path: s.avatar_path,
        last_seen: s.last_seen,
        stats: {
          total: assignments.length,
          done,
          pending: assignments.filter(a => a.status === 'available' || a.status === 'in_progress').length,
          submitted: assignments.filter(a => a.status === 'done').length,
        },
        progression: {
          roleSlug: sync.currentRoleSlug,
          roleDisplayName: sync.currentRoleDisplayName,
          roleEmoji: currentStep?.emoji || null,
          autoProgressionEnabled: sync.autoProgressionEnabled !== false,
        },
      };
    }));
    result.sort((a, b) => b.stats.done - a.stats.done);
    res.json(result);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

// Export CSV des stats n3beurs (n3boss uniquement)
router.get('/export', requirePermission('stats.export', { needsElevation: true }), async (req, res) => {
  try {
    const students = await queryAll("SELECT * FROM users WHERE user_type = 'student'");
    const result = await Promise.all(students.map(async (s) => {
      const assignments = await queryAll(
        `SELECT ta.*, t.status FROM task_assignments ta
         JOIN tasks t ON ta.task_id = t.id
         WHERE ta.student_id = ? OR (ta.student_first_name = ? AND ta.student_last_name = ?)`,
        [s.id, s.first_name, s.last_name]
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
