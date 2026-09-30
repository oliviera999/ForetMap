const express = require('express');
const { requireAuth } = require('../middleware/requireTeacher');
const asyncHandler = require('../lib/asyncHandler');
const { signUploadRelativePath } = require('../lib/uploadsSignedUrls');
const { z, validate } = require('../lib/validate');
const { getStudentProgressionConfig, syncStudentPrimaryRoleFromProgress } = require('../lib/rbac');
const { getScopedStudentIds, canAccessStudentId } = require('../lib/groupScope');
const { getOnlineUserIdSet } = require('../lib/realtime');
const { attachPresenceStatus } = require('../lib/shared/presenceCore');
const { isModuleEnabled } = require('../lib/shared/moduleGate');
const { getAccountN3beurStatus } = require('../lib/n3beurStudents');
const {
  EMPTY_ASSIGNMENT_COUNTS,
  summarizeAssignments,
  fetchAssignmentStatusCountsByStudent,
  fetchEngagementByUserId,
  engagementStatsForUser,
  fetchSiteEngagementTotals,
  fetchUserEngagementStats,
  getStatsUserRow,
  listStudentTaskAssignments,
  listScopedStudents,
} = require('../lib/stats/statsReadModel');

const router = express.Router();

// O7 — périmètre des stats agrégées (`/all`, `/export`) : coercition permissive (jamais de 400
// pour une query invalide) reproduisant exactement l'ancienne lecture manuelle :
//   group_id/subgroup_id → String(x || '').trim() ; map_id/project_id → transmis tels quels ou null.
const statsScopeQuerySchema = z
  .object({
    group_id: z.unknown().optional(),
    subgroup_id: z.unknown().optional(),
    map_id: z.unknown().optional(),
    project_id: z.unknown().optional(),
  })
  .transform((q) => ({
    groupId: String(q.group_id || '').trim(),
    subgroupId: String(q.subgroup_id || '').trim(),
    mapId: q.map_id || null,
    projectId: q.project_id || null,
  }));

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

async function userStats(userId, options = {}) {
  const s = await getStatsUserRow(userId);
  if (!s) return null;
  // Progression n3beur et tâches ne concernent que les comptes n3beurs (profil effectif de
  // palier, ou compte encore promotible membre d'un groupe n3beur). Un visiteur, un membre du
  // personnel ou un encadrant n'a ni échelle de paliers ni activité de tâches à afficher :
  // sa fiche se limite au volet biodiversité & tutoriels (docs/reference/foretmap/stats-forum-et-suivi.md).
  const n3beurStatus = await getAccountN3beurStatus(s.id);
  const isN3beur = n3beurStatus.isN3beur;
  const tracksTasks = String(s.user_type || '').toLowerCase() === 'student' && isN3beur;
  const progressionConfig = tracksTasks ? await getStudentProgressionConfig() : null;
  const assignments = tracksTasks ? await listStudentTaskAssignments(s) : [];
  const { done, pending, submitted, total } = summarizeAssignments(assignments);
  const engagement = await fetchUserEngagementStats(s.id);
  let progression = null;
  if (tracksTasks) {
    const sync = await syncStudentPrimaryRoleFromProgress(s.id, done, progressionConfig, {
      recordPromotionNotice: !!options.recordPromotionNotice,
    });
    const currentStep = (sync.steps || []).find(
      (step) => String(step.roleSlug) === String(sync.currentRoleSlug),
    );
    progression = {
      thresholds: sync.thresholds,
      steps: sync.steps,
      roleSlug: sync.currentRoleSlug,
      roleDisplayName: sync.currentRoleDisplayName,
      roleEmoji: currentStep?.emoji || null,
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
    pseudo: s.pseudo,
    description: s.description,
    avatar_path: signUploadRelativePath(s.avatar_path),
    last_seen: s.last_seen,
    is_n3beur: isN3beur,
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

router.get(
  '/me/:studentId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const askedStudentId = String(req.params.studentId || '').trim();
    const auth = req.auth || null;
    const perms = Array.isArray(auth?.permissions) ? auth.permissions : [];
    const canReadAll = perms.includes('stats.read.all');
    const canReadGroup = perms.includes('stats.read.group');
    // Autorise l'accès aux propres stats sur l'ID du compte, y compris profils legacy.
    const isOwner = String(auth?.userId || '') === askedStudentId;
    if (!canReadAll && !isOwner && !canReadGroup) {
      return res.status(403).json({ error: 'Accès refusé à ces statistiques' });
    }
    if (!canReadAll && !isOwner && canReadGroup) {
      const allowed = await canAccessStudentId(auth, askedStudentId);
      if (!allowed) return res.status(403).json({ error: 'Accès refusé à ces statistiques' });
    }
    const recordPromotionNotice =
      isOwner && String(auth?.userType || '').toLowerCase() === 'student';
    const data = await userStats(askedStudentId, { recordPromotionNotice });
    if (!data) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(data);
  }),
);

router.get(
  '/all',
  requireAuth,
  validate({ query: statsScopeQuerySchema }),
  asyncHandler(async (req, res) => {
    const perms = Array.isArray(req.auth?.permissions) ? req.auth.permissions : [];
    const canReadAll = perms.includes('stats.read.all');
    const canReadGroup = perms.includes('stats.read.group');
    if (!canReadAll && !canReadGroup) {
      return res.status(403).json({ error: 'Permission insuffisante' });
    }
    const {
      groupId: requestedGroupId,
      subgroupId: requestedSubgroupId,
      mapId,
      projectId,
    } = req.validatedQuery;
    const scope = await getScopedStudentIds(req.auth, {
      groupId: requestedSubgroupId || requestedGroupId || null,
      mapId,
      projectId,
    });
    if (scope.unauthorizedGroup) {
      return res.status(403).json({ error: 'Groupe hors périmètre' });
    }
    const [students, progressionConfig, { plantMap, tutMap }, site, assignmentCounts] =
      await Promise.all([
        listScopedStudents(scope, 'dashboard'),
        getStudentProgressionConfig(),
        fetchEngagementByUserId(),
        fetchSiteEngagementTotals(),
        fetchAssignmentStatusCountsByStudent(scope),
      ]);
    const result = await mapWithConcurrency(students, STATS_STUDENT_AGG_CONCURRENCY, async (s) => {
      const agg = assignmentCounts.get(String(s.id)) || EMPTY_ASSIGNMENT_COUNTS;
      const done = agg.done;
      const sync = await syncStudentPrimaryRoleFromProgress(s.id, done, progressionConfig);
      const currentStep = (sync.steps || []).find(
        (step) => String(step.roleSlug) === String(sync.currentRoleSlug),
      );
      const extra = engagementStatsForUser(s.id, plantMap, tutMap);
      return {
        id: s.id,
        first_name: s.first_name,
        last_name: s.last_name,
        pseudo: s.pseudo,
        description: s.description,
        avatar_path: signUploadRelativePath(s.avatar_path),
        last_seen: s.last_seen,
        stats: {
          total: agg.total,
          done,
          pending: agg.pending,
          submitted: agg.submitted,
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
    let studentsOut = result;
    if (await isModuleEnabled('foret', 'presence')) {
      studentsOut = attachPresenceStatus(result, {
        onlineIds: getOnlineUserIdSet('foret'),
      });
    }
    res.json({ students: studentsOut, site });
  }),
);

// Export CSV des stats n3beurs (n3boss uniquement)
router.get(
  '/export',
  requireAuth,
  validate({ query: statsScopeQuerySchema }),
  asyncHandler(async (req, res) => {
    const perms = Array.isArray(req.auth?.permissions) ? req.auth.permissions : [];
    const canExport = perms.includes('stats.export');
    if (!canExport) return res.status(403).json({ error: 'Permission insuffisante' });
    const {
      groupId: requestedGroupId,
      subgroupId: requestedSubgroupId,
      mapId,
      projectId,
    } = req.validatedQuery;
    const scope = await getScopedStudentIds(req.auth, {
      groupId: requestedSubgroupId || requestedGroupId || null,
      mapId,
      projectId,
    });
    if (scope.unauthorizedGroup) {
      return res.status(403).json({ error: 'Groupe hors périmètre' });
    }
    const [students, { plantMap, tutMap }, assignmentCounts] = await Promise.all([
      listScopedStudents(scope, 'export'),
      fetchEngagementByUserId(),
      fetchAssignmentStatusCountsByStudent(scope),
    ]);
    const result = students.map((s) => {
      const agg = assignmentCounts.get(String(s.id)) || EMPTY_ASSIGNMENT_COUNTS;
      const extra = engagementStatsForUser(s.id, plantMap, tutMap);
      return {
        first_name: s.first_name,
        last_name: s.last_name,
        last_seen: s.last_seen,
        validated: agg.done,
        pending: agg.pending,
        submitted: agg.submitted,
        total: agg.total,
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
    const escapeCSV = (v) => {
      const s = String(v ?? '');
      return s.includes(';') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const rows = result.map((s) =>
      [
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
      ]
        .map(escapeCSV)
        .join(';'),
    );

    const BOM = '\uFEFF';
    const csv = BOM + [headers.join(';'), ...rows].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="foretmap-stats-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.send(csv);
  }),
);

module.exports = router;
module.exports.statsScopeQuerySchema = statsScopeQuerySchema; // exporté pour test no-DB du contrat O7
