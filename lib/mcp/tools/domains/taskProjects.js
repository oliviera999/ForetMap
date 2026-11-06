'use strict';

/**
 * `foretmap_task_projects` — projets de tâches (lot D). Lectures et écritures par l'API du site
 * (`/api/task-projects`), donc avec la logique métier : valider un projet, l'archiver (cascade
 * sur ses tâches), le dupliquer, le mettre en attente.
 */

const { z } = require('zod');
const { defineDomainTool, req, api, pageOf, pageParams, paged, qs, seg } = require('./factory');

const TOOL = 'foretmap_task_projects';

const id = z.string().min(1).max(64).describe('Identifiant du projet');
const data = z
  .record(z.string(), z.unknown())
  .describe(
    'Champs du projet (comme l’API : title, description, map_id, status active|on_hold, zone_ids, marker_ids, tutorial_ids)',
  );

const tool = defineDomainTool({
  name: TOOL,
  domain: 'task_projects',
  profile: 'essentiel',
  title: 'Projets de tâches',
  intro:
    'Projets regroupant des tâches : liste, fiche avec avancement (compteurs par statut, pourcentage validé), création, modification, suppression, duplication, mise en attente / reprise, validation, archivage (cascade sur les tâches), ordre des tâches d’un projet.',
  actions: {
    list: {
      summary: 'liste (carte, archivés)',
      params: {
        map_id: z.string().max(64).describe('Carte'),
        archived: z.enum(['active', 'archived', 'all']).describe('Archivés (défaut active)'),
        q: z.string().max(200).describe('Texte cherché dans le titre'),
        ...pageParams,
      },
      run: async (args, ctx) => {
        const rows = await api(
          ctx,
          'GET',
          `/api/task-projects${qs({ map_id: args.map_id, archived: args.archived })}`,
          undefined,
          { tool: TOOL },
        );
        const q = args.q ? String(args.q).toLowerCase() : null;
        const list = (Array.isArray(rows) ? rows : []).filter(
          (p) =>
            !q ||
            String(p.title || '')
              .toLowerCase()
              .includes(q),
        );
        const p = pageOf(args, ctx);
        return paged(list.slice(p.offset, p.offset + p.limit), p, { total: list.length });
      },
    },
    get: {
      summary: 'fiche, type de projet, avancement par statut et par phase (phase courante)',
      params: { project_id: req(id) },
      run: (args, ctx) =>
        api(ctx, 'GET', `/api/task-projects/${seg(args.project_id)}`, undefined, { tool: TOOL }),
    },
    create: {
      summary: 'créer un projet',
      write: true,
      params: { data: req(data) },
      run: (args, ctx) => api(ctx, 'POST', '/api/task-projects', args.data, { tool: TOOL }),
    },
    update: {
      summary: 'modifier un projet',
      write: true,
      params: { project_id: req(id), data: req(data) },
      run: (args, ctx) =>
        api(ctx, 'PUT', `/api/task-projects/${seg(args.project_id)}`, args.data, { tool: TOOL }),
    },
    delete: {
      summary: 'supprimer un projet',
      write: true,
      params: { project_id: req(id) },
      run: (args, ctx) =>
        api(ctx, 'DELETE', `/api/task-projects/${seg(args.project_id)}`, undefined, {
          tool: TOOL,
        }),
    },
    duplicate: {
      summary: 'dupliquer (tâches actives comprises)',
      write: true,
      params: {
        project_id: req(id),
        title: z.string().max(255).describe('Titre de la copie'),
        map_id: z.string().max(64).describe('Carte de destination'),
      },
      run: (args, ctx) => {
        const body = {};
        if (args.title) body.title = args.title;
        if (args.map_id) body.map_id = args.map_id;
        return api(ctx, 'POST', `/api/task-projects/${seg(args.project_id)}/duplicate`, body, {
          tool: TOOL,
        });
      },
    },
    hold: {
      summary: 'mettre en attente (on=true) ou reprendre (on=false)',
      write: true,
      params: { project_id: req(id), on: req(z.boolean()) },
      run: (args, ctx) =>
        api(
          ctx,
          'PUT',
          `/api/task-projects/${seg(args.project_id)}`,
          { status: args.on === false ? 'active' : 'on_hold' },
          { tool: TOOL },
        ),
    },
    validate: {
      summary: 'valider le projet',
      write: true,
      params: { project_id: req(id) },
      run: (args, ctx) =>
        api(ctx, 'POST', `/api/task-projects/${seg(args.project_id)}/validate`, {}, { tool: TOOL }),
    },
    archive: {
      summary: 'archiver (ses tâches aussi)',
      write: true,
      params: { project_id: req(id) },
      run: (args, ctx) =>
        api(ctx, 'POST', `/api/task-projects/${seg(args.project_id)}/archive`, {}, { tool: TOOL }),
    },
    unarchive: {
      summary: 'désarchiver',
      write: true,
      params: { project_id: req(id) },
      run: (args, ctx) =>
        api(
          ctx,
          'POST',
          `/api/task-projects/${seg(args.project_id)}/unarchive`,
          {},
          {
            tool: TOOL,
          },
        ),
    },
    reorder: {
      summary: 'ordonner les tâches d’un projet (task_ids dans l’ordre voulu)',
      write: true,
      params: {
        project_id: req(id),
        task_ids: req(z.array(z.string().max(64)).min(1).max(500)),
      },
      run: (args, ctx) =>
        api(
          ctx,
          'POST',
          '/api/tasks/reorder-project',
          { project_id: args.project_id, task_ids: args.task_ids },
          { tool: TOOL },
        ),
    },
  },
});

module.exports = { buildTaskProjectsTool: () => tool };
