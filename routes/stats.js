const express = require('express');
const { queryAll, queryOne } = require('../database');
const { requireAuth, requirePermission } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const { getStudentProgressionConfig, syncStudentPrimaryRoleFromProgress } = require('../lib/rbac');

const router = express.Router();

/** Concurrence max pour agrégations « un SELECT par élève » (évite ER_CON_COUNT_ERROR ; > séquentiel pour l’UI prof). */
const STATS_STUDENT_AGG_CONCURRENCY = (() => {
  const raw = String(process.env.FORETMAP_STATS_STUDENT_AGG_CONCURRENCY || '').trim();
  const n = raw ? parseInt(raw, 10) : 8;
  if (!Number.isFinite(n) || n < 1) return 8;
  return Math.min(24, n);
})();

/**
 * Exécute `mapper` sur chaque élément avec au plus `limit` appels simultanés.
 * @template T,R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} mapper
 * @returns {Promise<R[]>}
 */
async function mapWithConcurrency(items, limit, mapper) {
  if (!items.length) return [];
  const results = new Array(items.length);
  let next = 0;
  const cap = Math.max(1, Math.min(limit, items.length));
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await mapper(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: cap }, () => worker()));
  return results;
}

/** Agrégats biodiversité + tutoriels par user_id (clés chaîne). */
async function fetchEngagementByUserId() {
  const [plantRows, tutRows] = await Promise.all([
    queryAll(
      `SELECT user_id, COUNT(DISTINCT plant_id) AS species, COUNT(*) AS events
       FROM user_plant_observation_events GROUP BY user_id`
    ),
    queryAll(`SELECT user_id, COUNT(*) AS tutorials_read FROM user_tutorial_reads GROUP BY user_id`),
  ]);
  const plantMap = new Map();
  for (const r of plantRows) {
    plantMap.set(String(r.user_id), {
      species: Number(r.species) || 0,
      events: Number(r.events) || 0,
    });
  }
  const tutMap = new Map();
  for (const r of tutRows) {
    tutMap.set(String(r.user_id), Number(r.tutorials_read) || 0);
  }
  return { plantMap, tutMap };
}

function engagementStatsForUser(userId, plantMap, tutMap) {
  const uid = String(userId);
  const p = plantMap.get(uid) || { species: 0, events: 0 };
  return {
    plant_species_observed: p.species,
    plant_observation_events: p.events,
    tutorials_read: tutMap.get(uid) || 0,
  };
}

/** Totaux site (distinct espèces observées, événements, lectures tutoriel). */
async function fetchSiteEngagementTotals() {
  const [plants, tutorials] = await Promise.all([
    queryOne(
      `SELECT COUNT(DISTINCT plant_id) AS plant_species_observed, COUNT(*) AS plant_observation_events
       FROM user_plant_observation_events`
    ),
    queryOne(`SELECT COUNT(*) AS tutorials_read FROM user_tutorial_reads`),
  ]);
  return {
    plant_species_observed: Number(plants?.plant_species_observed) || 0,
    plant_observation_events: Number(plants?.plant_observation_events) || 0,
    tutorials_read: Number(tutorials?.tutorials_read) || 0,
  };
}

async function fetchUserEngagementStats(userId) {
  const uid = String(userId);
  const [plantRow, tutRow] = await Promise.all([
    queryOne(
      `SELECT COUNT(DISTINCT plant_id) AS species, COUNT(*) AS events
       FROM user_plant_observation_events WHERE user_id = ?`,
      [uid]
    ),
    queryOne(`SELECT COUNT(*) AS tutorials_read FROM user_tutorial_reads WHERE user_id = ?`, [uid]),
  ]);
  return {
    plant_species_observed: Number(plantRow?.species) || 0,
    plant_observation_events: Number(plantRow?.events) || 0,
    tutorials_read: Number(tutRow?.tutorials_read) || 0,
  };
}

async function userStats(userId, options = {}) {
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
  const engagement = await fetchUserEngagementStats(s.id);
  let progression = null;
  if (isStudent) {
    const sync = await syncStudentPrimaryRoleFromProgress(s.id, done, progressionConfig, {
      recordPromotionNotice: !!options.recordPromotionNotice,
    });
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
    stats: {
      done,
      pending,
      submitted,
      total,
      plant_species_observed: engagement.plant_species_observed,
      plant_observation_events: engagement.plant_observation_events,
      tutorials_read: engagement.tutorials_read,
    },
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
    const recordPromotionNotice = isOwner && String(auth?.userType || '').toLowerCase() === 'student';
    const data = await userStats(askedStudentId, { recordPromotionNotice });
    if (!data) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(data);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.get('/all', requirePermission('stats.read.all'), async (req, res) => {
  try {
    const [students, progressionConfig, { plantMap, tutMap }, site] = await Promise.all([
      queryAll("SELECT * FROM users WHERE user_type = 'student'"),
      getStudentProgressionConfig(),
      fetchEngagementByUserId(),
      fetchSiteEngagementTotals(),
    ]);
    const result = await mapWithConcurrency(students, STATS_STUDENT_AGG_CONCURRENCY, async (s) => {
      const assignments = await queryAll(
        `SELECT ta.*, t.status FROM task_assignments ta
         JOIN tasks t ON ta.task_id = t.id
         WHERE ta.student_id = ? OR (ta.student_first_name = ? AND ta.student_last_name = ?)`,
        [s.id, s.first_name, s.last_name]
      );
      const done = assignments.filter(a => a.status === 'validated').length;
      const sync = await syncStudentPrimaryRoleFromProgress(s.id, done, progressionConfig);
      const currentStep = (sync.steps || []).find((step) => String(step.roleSlug) === String(sync.currentRoleSlug));
      const extra = engagementStatsForUser(s.id, plantMap, tutMap);
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
          plant_species_observed: extra.plant_species_observed,
          plant_observation_events: extra.plant_observation_events,
          tutorials_read: extra.tutorials_read,
        },
        progression: {
          roleSlug: sync.currentRoleSlug,
          roleDisplayName: sync.currentRoleDisplayName,
          roleEmoji: currentStep?.emoji || null,
          autoProgressionEnabled: sync.autoProgressionEnabled !== false,
        },
      };
    });
    result.sort((a, b) => b.stats.done - a.stats.done);
    res.json({ students: result, site });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

// Export CSV des stats n3beurs (n3boss uniquement)
router.get('/export', requirePermission('stats.export', { needsElevation: true }), async (req, res) => {
  try {
    const [students, { plantMap, tutMap }] = await Promise.all([
      queryAll("SELECT * FROM users WHERE user_type = 'student'"),
      fetchEngagementByUserId(),
    ]);
    const result = await mapWithConcurrency(students, STATS_STUDENT_AGG_CONCURRENCY, async (s) => {
      const assignments = await queryAll(
        `SELECT ta.*, t.status FROM task_assignments ta
         JOIN tasks t ON ta.task_id = t.id
         WHERE ta.student_id = ? OR (ta.student_first_name = ? AND ta.student_last_name = ?)`,
        [s.id, s.first_name, s.last_name]
      );
      const extra = engagementStatsForUser(s.id, plantMap, tutMap);
      return {
        first_name: s.first_name,
        last_name: s.last_name,
        last_seen: s.last_seen,
        validated: assignments.filter(a => a.status === 'validated').length,
        pending: assignments.filter(a => a.status === 'available' || a.status === 'in_progress').length,
        submitted: assignments.filter(a => a.status === 'done').length,
        total: assignments.length,
        plant_species_observed: extra.plant_species_observed,
        plant_observation_events: extra.plant_observation_events,
        tutorials_read: extra.tutorials_read,
      };
    });
    result.sort((a, b) => b.validated - a.validated);

    const headers = [
      'Prénom',
      'Nom',
      'Validées',
      'En cours',
      'En attente',
      'Total',
      'Espèces observées (fiches)',
      'Observations fiches plantes',
      'Tutoriels lus',
      'Dernière connexion',
    ];
    const escapeCSV = v => {
      const s = String(v ?? '');
      return s.includes(';') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = result.map(s => [
      s.first_name,
      s.last_name,
      s.validated,
      s.pending,
      s.submitted,
      s.total,
      s.plant_species_observed,
      s.plant_observation_events,
      s.tutorials_read,
      s.last_seen ? new Date(s.last_seen).toLocaleDateString('fr-FR') : 'Jamais',
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
