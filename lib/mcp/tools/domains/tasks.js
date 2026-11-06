'use strict';

/**
 * `foretmap_tasks` — les tâches de bout en bout (lot D, besoin immédiat).
 *
 * - Lectures : par l'API du site (`GET /api/tasks`, `/api/tasks/:id`…), donc avec la
 *   visibilité de la personne connectée ; filtres fins appliqués ensuite. `stats` compose du
 *   SQL en lecture seule (`lib/mcp/domains/tasks.js`) et exige `tasks.manage` ou
 *   `stats.read.all`.
 * - Écritures : **toutes** par le pont API (`ctx` → route), donc avec la logique métier :
 *   valider détache les lieux, recalcule la progression des élèves et l'avancement du projet,
 *   notifie, génère l'occurrence récurrente ; archiver retire la tâche de l'avancement.
 */

const { z } = require('zod');
const { defineDomainTool, req, api, pageOf, pageParams, paged, qs, seg } = require('./factory');
const { taskStats } = require('../../domains/tasks');

const TOOL = 'foretmap_tasks';

const id = z.string().min(1).max(64).describe('Identifiant de la tâche');
const studentId = z.string().min(1).max(64).describe('Identifiant de l’élève');
const data = z
  .record(z.string(), z.unknown())
  .describe(
    'Champs de la tâche (comme l’API : title, description, map_id, project_id, zone_ids, marker_ids, tutorial_ids, referent_user_ids, species_ids, pedago_session_id, start_date, due_date, required_students, completion_mode, danger_level, difficulty_level, importance_level, recurrence, group_id, status, category (métier), format (flash, routine, seance), project_phase (concevoir, preparer, realiser, tester, transmettre)…)',
  );

const listFilters = {
  map_id: z.string().max(64).describe('Carte'),
  project_id: z.string().max(64).describe('Projet'),
  group_id: z.string().max(64).describe('Groupe'),
  status: z
    .union([z.string().max(32), z.array(z.string().max(32)).max(10)])
    .describe('Statut(s) : available, in_progress, done, validated, proposed, on_hold…'),
  danger_level: z.string().max(32).describe('Niveau de danger'),
  difficulty_level: z.string().max(32).describe('Niveau de difficulté'),
  importance_level: z.string().max(32).describe('Importance'),
  category: z
    .string()
    .max(200)
    .describe(
      'Métier(s), séparés par des virgules : jardinage, animaux, entretien, bricolage, terrassement, rangement, electronique, communication',
    ),
  format: z
    .string()
    .max(60)
    .describe('Format(s), séparés par des virgules : flash, routine, seance'),
  project_phase: z
    .string()
    .max(80)
    .describe('Phase(s) de projet : concevoir, preparer, realiser, tester, transmettre'),
  due_from: z.string().max(10).describe('Échéance à partir du (AAAA-MM-JJ)'),
  due_to: z.string().max(10).describe('Échéance jusqu’au (AAAA-MM-JJ)'),
  overdue: z.boolean().describe('Seulement les tâches en retard'),
  archived: z.enum(['active', 'archived', 'all']).describe('Archivées (défaut active)'),
  q: z.string().max(200).describe('Texte cherché (titre, description)'),
};

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateOnly(v) {
  return v ? String(v).slice(0, 10) : null;
}

function isOverdue(t, now = today()) {
  const due = dateOnly(t.due_date);
  return !!due && due < now && !['validated', 'done'].includes(String(t.status));
}

/** Forme compacte d'une tâche pour les listes. */
function compactTask(t) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    map_id: t.map_id,
    project_id: t.project_id || null,
    start_date: dateOnly(t.start_date),
    due_date: dateOnly(t.due_date),
    required_students: t.required_students,
    assigned_count: Array.isArray(t.assignments) ? t.assignments.length : t.assigned_count,
    danger_level: t.danger_level,
    difficulty_level: t.difficulty_level,
    importance_level: t.importance_level,
    category: t.category || null,
    format: t.format || null,
    project_phase: t.project_phase || null,
    recurrence: t.recurrence || null,
    archived: t.archived_at != null,
    overdue: isOverdue(t),
  };
}

async function listTasks(args, ctx, extraFilter) {
  const rows = await api(
    ctx,
    'GET',
    `/api/tasks${qs({
      map_id: args.map_id,
      project_id: args.project_id,
      group_id: args.group_id,
      archived: args.archived,
      // Filtres de taxonomie appliqués par la route (valeur inconnue → 400 explicite).
      category: args.category,
      format: args.format,
      project_phase: args.project_phase,
    })}`,
    undefined,
    { tool: TOOL },
  );
  const list = Array.isArray(rows) ? rows : rows?.tasks || [];
  const statuses = args.status ? [].concat(args.status).map(String) : null;
  const q = args.q ? String(args.q).toLowerCase() : null;
  const now = today();
  const filtered = list.filter((t) => {
    if (statuses && !statuses.includes(String(t.status))) return false;
    for (const k of ['danger_level', 'difficulty_level', 'importance_level']) {
      if (args[k] && String(t[k] || '') !== String(args[k])) return false;
    }
    const due = dateOnly(t.due_date);
    if (args.due_from && (!due || due < args.due_from)) return false;
    if (args.due_to && (!due || due > args.due_to)) return false;
    if (args.overdue && !isOverdue(t, now)) return false;
    if (q && !`${t.title || ''} ${t.description || ''}`.toLowerCase().includes(q)) return false;
    return extraFilter ? extraFilter(t) : true;
  });
  const p = pageOf(args, ctx);
  return paged(filtered.slice(p.offset, p.offset + p.limit).map(compactTask), p, {
    total: filtered.length,
  });
}

/** Lignes CSV pour `bulk_create` (mêmes colonnes que le modèle d'import). */
function rowsToCsv(rows) {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    const s = Array.isArray(v) ? v.join(',') : String(v);
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
}

const tool = defineDomainTool({
  name: TOOL,
  domain: 'tasks',
  profile: 'essentiel',
  title: 'Tâches (lire, créer, valider, archiver…)',
  intro:
    'Tâches de la forêt : liste filtrée, fiche, statistiques, tâches à valider et en retard, et toutes les actions de gestion (création, modification, duplication, validation, statut, archivage, inscriptions, comptes rendus, liens, récurrence, création en masse).',
  actions: {
    list: {
      summary:
        'liste filtrée (carte, projet, groupe, statut, niveaux, métier, format, phase, dates, retard, texte)',
      params: { ...listFilters, ...pageParams },
      run: (args, ctx) => listTasks(args, ctx),
    },
    get: {
      summary: 'fiche complète (lieux, espèces, tutoriels, séance, référents, série, inscrits)',
      params: { task_id: req(id) },
      run: (args, ctx) =>
        api(ctx, 'GET', `/api/tasks/${seg(args.task_id)}`, undefined, { tool: TOOL }),
    },
    logs: {
      summary: 'comptes rendus d’une tâche (auteurs, commentaires)',
      nominative: true,
      params: { task_id: req(id) },
      run: (args, ctx) =>
        api(ctx, 'GET', `/api/tasks/${seg(args.task_id)}/logs`, undefined, { tool: TOOL }),
    },
    stats: {
      summary:
        'statistiques : par carte, projet, mois, statut, métier, format ; délai de validation ; taux de retard, de remplissage, d’abandon',
      permission: ['tasks.manage', 'stats.read.all'],
      params: {
        map_id: listFilters.map_id,
        project_id: listFilters.project_id,
        from: z.string().max(10).describe('Créées à partir du (AAAA-MM-JJ)'),
        to: z.string().max(10).describe('Créées jusqu’au (AAAA-MM-JJ)'),
      },
      run: (args) => taskStats(args),
    },
    to_validate: {
      summary: 'tâches faites en attente de validation',
      params: { map_id: listFilters.map_id, project_id: listFilters.project_id, ...pageParams },
      run: (args, ctx) => listTasks({ ...args, status: 'done' }, ctx),
    },
    overdue: {
      summary: 'tâches en retard (échéance passée, non validées)',
      params: { map_id: listFilters.map_id, project_id: listFilters.project_id, ...pageParams },
      run: (args, ctx) => listTasks({ ...args, overdue: true }, ctx),
    },
    create: {
      summary: 'créer une tâche',
      write: true,
      params: { data: req(data) },
      run: (args, ctx) => api(ctx, 'POST', '/api/tasks', args.data, { tool: TOOL }),
    },
    update: {
      summary: 'modifier une tâche (champs de data ; expected_revision possible)',
      write: true,
      params: { task_id: req(id), data: req(data) },
      run: (args, ctx) =>
        api(ctx, 'PUT', `/api/tasks/${seg(args.task_id)}`, args.data, { tool: TOOL }),
    },
    delete: {
      summary: 'supprimer une tâche (inscriptions et comptes rendus compris)',
      write: true,
      params: { task_id: req(id) },
      run: (args, ctx) =>
        api(ctx, 'DELETE', `/api/tasks/${seg(args.task_id)}`, undefined, { tool: TOOL }),
    },
    bulk_create: {
      summary:
        'créer en masse (mêmes colonnes et règles que l’import : titre, carte, projet, dates, Métier, Format, Phase de projet…) ; dry_run pour simuler',
      write: true,
      params: {
        rows: req(z.array(z.record(z.string(), z.unknown())).min(1).max(1000)),
        dry_run: z.boolean().describe('Simulation sans écriture'),
      },
      run: (args, ctx) =>
        api(
          ctx,
          'POST',
          '/api/tasks/import',
          {
            fileDataBase64: Buffer.from(rowsToCsv(args.rows), 'utf8').toString('base64'),
            fileName: 'mcp-import.csv',
            dryRun: !!args.dry_run,
          },
          { tool: TOOL },
        ),
    },
    duplicate: {
      summary: 'dupliquer une tâche (copie active, lieux, tutoriels, espèces, référents)',
      write: true,
      params: { task_id: req(id), title: z.string().max(255).describe('Titre de la copie') },
      run: (args, ctx) =>
        api(
          ctx,
          'POST',
          `/api/tasks/${seg(args.task_id)}/duplicate`,
          args.title ? { title: args.title } : {},
          { tool: TOOL },
        ),
    },
    validate: {
      summary: 'valider (détache les lieux, progression des élèves, avancement du projet)',
      write: true,
      params: { task_id: req(id) },
      run: (args, ctx) =>
        api(ctx, 'POST', `/api/tasks/${seg(args.task_id)}/validate`, {}, { tool: TOOL }),
    },
    set_status: {
      summary: 'changer le statut (ex. remise au travail : in_progress / available)',
      write: true,
      params: { task_id: req(id), status: req(z.string().min(2).max(32)) },
      run: (args, ctx) =>
        api(ctx, 'PUT', `/api/tasks/${seg(args.task_id)}`, { status: args.status }, { tool: TOOL }),
    },
    archive: {
      summary: 'archiver (retirée des listes et de l’avancement du projet)',
      write: true,
      params: { task_id: req(id) },
      run: (args, ctx) =>
        api(ctx, 'POST', `/api/tasks/${seg(args.task_id)}/archive`, {}, { tool: TOOL }),
    },
    unarchive: {
      summary: 'désarchiver',
      write: true,
      params: { task_id: req(id) },
      run: (args, ctx) =>
        api(ctx, 'POST', `/api/tasks/${seg(args.task_id)}/unarchive`, {}, { tool: TOOL }),
    },
    assign: {
      summary: 'inscrire un élève',
      write: true,
      nominative: true,
      params: { task_id: req(id), student_id: req(studentId) },
      run: (args, ctx) =>
        api(
          ctx,
          'POST',
          `/api/tasks/${seg(args.task_id)}/assign`,
          { studentId: args.student_id },
          { tool: TOOL },
        ),
    },
    unassign: {
      summary: 'désinscrire un élève',
      write: true,
      nominative: true,
      params: { task_id: req(id), student_id: req(studentId) },
      run: (args, ctx) =>
        api(
          ctx,
          'POST',
          `/api/tasks/${seg(args.task_id)}/unassign`,
          { studentId: args.student_id },
          { tool: TOOL },
        ),
    },
    mark_done: {
      summary: 'marquer faite pour un élève inscrit (commentaire, photo en data URL)',
      write: true,
      nominative: true,
      params: {
        task_id: req(id),
        student_id: studentId,
        comment: z.string().max(5000),
        image_data: z.string().max(20_000_000).describe('Image en data URL (base64)'),
      },
      run: (args, ctx) =>
        api(
          ctx,
          'POST',
          `/api/tasks/${seg(args.task_id)}/done`,
          { studentId: args.student_id, comment: args.comment, imageData: args.image_data },
          { tool: TOOL },
        ),
    },
    assign_group: {
      summary: 'inscrire les élèves d’un groupe',
      write: true,
      params: { task_id: req(id), group_id: req(z.string().min(1).max(64)) },
      run: (args, ctx) =>
        api(
          ctx,
          'POST',
          `/api/tasks/${seg(args.task_id)}/assign-group`,
          { group_id: args.group_id },
          { tool: TOOL },
        ),
    },
    add_log: {
      summary: 'ajouter un compte rendu de la gestion (commentaire, image, élève facultatif)',
      write: true,
      params: {
        task_id: req(id),
        comment: z.string().max(5000),
        image_data: z.string().max(20_000_000).describe('Image en data URL (base64)'),
        student_id: studentId,
      },
      run: (args, ctx) =>
        api(
          ctx,
          'POST',
          `/api/tasks/${seg(args.task_id)}/logs`,
          { comment: args.comment, imageData: args.image_data, student_id: args.student_id },
          { tool: TOOL },
        ),
    },
    delete_log: {
      summary: 'supprimer un compte rendu',
      write: true,
      params: {
        task_id: req(id),
        log_id: req(z.union([z.string().max(32), z.number().int()])),
      },
      run: (args, ctx) =>
        api(ctx, 'DELETE', `/api/tasks/${seg(args.task_id)}/logs/${seg(args.log_id)}`, undefined, {
          tool: TOOL,
        }),
    },
    set_links: {
      summary:
        'remplacer les liens : zones, repères, espèces, tutoriels, référents, séance (seuls les champs fournis changent)',
      write: true,
      params: {
        task_id: req(id),
        zone_ids: z.array(z.string().max(64)).max(200),
        marker_ids: z.array(z.string().max(64)).max(200),
        species_ids: z.array(z.union([z.string().max(64), z.number().int()])).max(200),
        tutorial_ids: z.array(z.union([z.string().max(64), z.number().int()])).max(200),
        referent_user_ids: z.array(z.string().max(64)).max(50),
        pedago_session_id: z.union([z.string().max(64), z.null()]),
      },
      run: (args, ctx) => {
        const body = {};
        for (const k of [
          'zone_ids',
          'marker_ids',
          'species_ids',
          'tutorial_ids',
          'referent_user_ids',
          'pedago_session_id',
        ]) {
          if (args[k] !== undefined) body[k] = args[k];
        }
        return api(ctx, 'PUT', `/api/tasks/${seg(args.task_id)}`, body, { tool: TOOL });
      },
    },
    recurrence: {
      summary:
        'série récurrente : mode=view (prévision des séries, filtrée sur la tâche si donnée) ou mode=spawn (générer tout de suite l’occurrence suivante)',
      write: true,
      params: { task_id: id, mode: req(z.enum(['view', 'spawn'])) },
      run: async (args, ctx) => {
        if (args.mode === 'spawn') {
          if (!args.task_id) return { error: 'task_id requis pour spawn' };
          return api(
            ctx,
            'POST',
            `/api/tasks/${seg(args.task_id)}/recurrence/spawn`,
            {},
            {
              tool: TOOL,
            },
          );
        }
        const preview = await api(ctx, 'GET', '/api/tasks/recurring-preview', undefined, {
          tool: TOOL,
        });
        if (!args.task_id) return preview;
        const items = (preview?.items || preview?.series || preview || []).filter?.(
          (s) => s.id === args.task_id || s.task_id === args.task_id,
        );
        return { items: items || [], source: 'recurring-preview' };
      },
    },
  },
});

module.exports = { buildTasksTool: () => tool, compactTask, isOverdue, rowsToCsv };
