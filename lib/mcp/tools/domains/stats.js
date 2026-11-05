'use strict';

/**
 * `foretmap_stats` — tableaux de bord (lot D4).
 *
 * - `dashboard` : `GET /api/stats/all` (permissions `stats.read.all` ou `stats.read.group`,
 *   périmètre de groupes de la personne connectée) réduit à des **agrégats** : effectif, totaux
 *   des tâches, répartition par palier, engagement du site. Aucune ligne par élève.
 * - `students` : le même tableau, **par élève** (nom, palier, tâches, observations,
 *   tutoriels lus) — nominatif.
 * - `student` : fiche statistique d'un élève (`GET /api/stats/me/:studentId`) — nominatif.
 * - `usage` : compteurs d'usage anonymes par jour (`GET /api/admin/usage`, permission
 *   `admin.settings.read`).
 */

const { z } = require('zod');
const { defineDomainTool, req, api, pageOf, pageParams, paged, qs, seg } = require('./factory');

const TOOL = 'foretmap_stats';

const scopeParams = {
  group_id: z.string().min(1).max(64).describe('Groupe'),
  subgroup_id: z.string().min(1).max(64).describe('Sous-groupe'),
  map_id: z.string().min(1).max(64).describe('Carte'),
  project_id: z.string().min(1).max(64).describe('Projet'),
};

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date AAAA-MM-JJ')
  .describe('Jour (AAAA-MM-JJ)');

function loadDashboard(args, ctx) {
  return api(
    ctx,
    'GET',
    `/api/stats/all${qs({
      group_id: args.group_id,
      subgroup_id: args.subgroup_id,
      map_id: args.map_id,
      project_id: args.project_id,
    })}`,
    undefined,
    { tool: TOOL },
  );
}

/** Agrégats d'un tableau par élève (aucun identifiant ni nom). */
function aggregateDashboard(data) {
  const students = Array.isArray(data?.students) ? data.students : [];
  const totals = {
    tasks_total: 0,
    tasks_done: 0,
    tasks_pending: 0,
    tasks_submitted: 0,
    plant_observation_events: 0,
    tutorials_read: 0,
  };
  const byRole = new Map();
  let active = 0;
  for (const s of students) {
    const st = s.stats || {};
    totals.tasks_total += Number(st.total || 0);
    totals.tasks_done += Number(st.done || 0);
    totals.tasks_pending += Number(st.pending || 0);
    totals.tasks_submitted += Number(st.submitted || 0);
    totals.plant_observation_events += Number(st.plant_observation_events || 0);
    totals.tutorials_read += Number(st.tutorials_read || 0);
    if (Number(st.total || 0) > 0) active += 1;
    const role = s.progression?.roleDisplayName || s.progression?.roleSlug || 'sans palier';
    byRole.set(role, (byRole.get(role) || 0) + 1);
  }
  return {
    students_count: students.length,
    students_with_tasks: active,
    totals,
    by_progression: [...byRole.entries()]
      .map(([role, count]) => ({ role, count }))
      .sort((a, b) => b.count - a.count),
    site: data?.site || null,
  };
}

const tool = defineDomainTool({
  name: TOOL,
  domain: 'stats',
  title: 'Statistiques et usage',
  intro:
    'Tableaux de bord : agrégats des élèves du périmètre (tâches, paliers, observations, tutoriels, engagement du site), détail par élève (nominatif), fiche d’un élève (nominatif) et compteurs d’usage anonymes par jour.',
  actions: {
    dashboard: {
      summary: 'agrégats du périmètre (effectif, tâches, paliers, engagement) — sans nom',
      params: scopeParams,
      run: async (args, ctx) => aggregateDashboard(await loadDashboard(args, ctx)),
    },
    students: {
      summary: 'détail par élève (palier, tâches faites / en cours, observations, tutoriels lus)',
      nominative: true,
      params: { ...scopeParams, ...pageParams },
      run: async (args, ctx) => {
        const data = await loadDashboard(args, ctx);
        const list = Array.isArray(data?.students) ? data.students : [];
        const p = pageOf(args, ctx);
        return paged(
          list.slice(p.offset, p.offset + p.limit).map((s) => ({
            id: s.id,
            first_name: s.first_name,
            last_name: s.last_name,
            pseudo: s.pseudo,
            last_seen: s.last_seen || null,
            presence: s.presence_status || null,
            stats: s.stats,
            progression: s.progression,
          })),
          p,
          { total: list.length },
        );
      },
    },
    student: {
      summary: 'statistiques d’un élève',
      nominative: true,
      params: { student_id: req(z.string().min(1).max(64).describe('Élève')) },
      run: (args, ctx) =>
        api(ctx, 'GET', `/api/stats/me/${seg(args.student_id)}`, undefined, { tool: TOOL }),
    },
    usage: {
      summary: 'compteurs d’usage anonymes par jour (défaut : 30 derniers jours)',
      params: {
        from: day,
        to: day,
        product: z.string().min(1).max(16).describe('Produit (foret, plan…)'),
      },
      run: (args, ctx) =>
        api(
          ctx,
          'GET',
          `/api/admin/usage${qs({ from: args.from, to: args.to, product: args.product })}`,
          undefined,
          { tool: TOOL },
        ),
    },
  },
});

function buildStatsTool() {
  return tool;
}

module.exports = { aggregateDashboard, buildStatsTool };
