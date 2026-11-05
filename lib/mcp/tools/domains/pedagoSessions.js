'use strict';

/**
 * `foretmap_pedago_sessions` — séances pédagogiques guidées (lot D2).
 *
 * Tout passe par l'API `/api/pedago-sessions` (gestion sous `plants.manage`) : catalogue
 * (brouillons compris), fiche, statistiques de passages (agrégées ; le détail par élève est
 * nominatif), création à partir d'un modèle, modification, suppression, et rattachement d'une
 * tâche (`PUT /api/tasks/:id` avec `pedago_session_id`).
 */

const { z } = require('zod');
const { defineDomainTool, req, api, pageOf, pageParams, paged, qs, seg } = require('./factory');

const TOOL = 'foretmap_pedago_sessions';

const sessionId = z.string().min(1).max(120).describe('Identifiant ou slug de la séance');
const data = z
  .record(z.string(), z.unknown())
  .describe(
    'Champs de la séance (comme l’API : templateKey (création), title, slug, description, level, mapId, config { keyIdOrSlug, plantId, plantIds, notionNiveau, notionId, questionCode, individualId, mapRouteSlug, requiresSessionId }, steps (séance libre « custom »), isPublished, sortOrder)',
  );

const tool = defineDomainTool({
  name: TOOL,
  domain: 'pedago_sessions',
  title: 'Séances pédagogiques',
  intro:
    'Séances pédagogiques guidées (modèles ou séances libres) : catalogue (brouillons compris), fiche, statistiques de passages (élèves ayant démarré / terminé), création, modification, publication, suppression et rattachement d’une tâche à une séance.',
  actions: {
    list: {
      summary: 'catalogue (brouillons compris si include_drafts)',
      params: {
        include_drafts: z.boolean().describe('Inclure les séances non publiées (défaut true)'),
        q: z.string().max(200).describe('Texte cherché dans le titre'),
        ...pageParams,
      },
      run: async (args, ctx) => {
        const r = await api(
          ctx,
          'GET',
          `/api/pedago-sessions${qs({ all: args.include_drafts === false ? undefined : '1' })}`,
          undefined,
          { tool: TOOL },
        );
        const needle = args.q ? String(args.q).toLowerCase() : null;
        const list = (r?.items || []).filter(
          (s) =>
            !needle ||
            String(s.title || '')
              .toLowerCase()
              .includes(needle),
        );
        const p = pageOf(args, ctx);
        return paged(list.slice(p.offset, p.offset + p.limit), p, { total: list.length });
      },
    },
    get: {
      summary: 'fiche d’une séance (étapes, configuration, publication)',
      params: { session_id: req(sessionId) },
      run: (args, ctx) =>
        api(ctx, 'GET', `/api/pedago-sessions/${seg(args.session_id)}`, undefined, {
          tool: TOOL,
        }),
    },
    runs: {
      summary:
        'statistiques de passages : élèves ayant démarré et terminé, dernière fin (par séance)',
      params: { session_id: sessionId },
      run: async (args, ctx) => {
        const r = await api(ctx, 'GET', '/api/pedago-sessions/stats', undefined, { tool: TOOL });
        let stats = r?.stats || [];
        if (args.session_id) {
          const s = await api(
            ctx,
            'GET',
            `/api/pedago-sessions/${seg(args.session_id)}`,
            undefined,
            {
              tool: TOOL,
            },
          );
          stats = stats.filter((x) => String(x.sessionId) === String(s?.id));
          if (!stats.length) {
            stats = [
              { sessionId: s?.id, startedUsers: 0, completedUsers: 0, lastCompletedAt: null },
            ];
          }
        }
        return { stats };
      },
    },
    runs_detail: {
      summary: 'passages élève par élève d’une séance (filtre groupe)',
      nominative: true,
      params: {
        session_id: req(sessionId),
        group_id: z.string().max(64).describe('Groupe'),
      },
      run: (args, ctx) =>
        api(
          ctx,
          'GET',
          `/api/pedago-sessions/${seg(args.session_id)}/runs${qs({ groupId: args.group_id })}`,
          undefined,
          { tool: TOOL },
        ),
    },
    create: {
      summary: 'créer une séance (templateKey requis ; custom = séance libre avec steps)',
      write: true,
      params: { data: req(data) },
      run: (args, ctx) => api(ctx, 'POST', '/api/pedago-sessions', args.data, { tool: TOOL }),
    },
    update: {
      summary: 'modifier une séance (configuration, publication ; étapes pour une séance libre)',
      write: true,
      params: { session_id: req(sessionId), data: req(data) },
      run: (args, ctx) =>
        api(ctx, 'PUT', `/api/pedago-sessions/${seg(args.session_id)}`, args.data, {
          tool: TOOL,
        }),
    },
    delete: {
      summary: 'supprimer une séance (passages effacés, tâches liées détachées)',
      write: true,
      params: { session_id: req(sessionId) },
      run: (args, ctx) =>
        api(ctx, 'DELETE', `/api/pedago-sessions/${seg(args.session_id)}`, undefined, {
          tool: TOOL,
        }),
    },
    link_task: {
      summary: 'rattacher une tâche à une séance (session_id null pour la détacher)',
      write: true,
      params: {
        task_id: req(z.string().min(1).max(64).describe('Identifiant de la tâche')),
        session_id: req(z.union([sessionId, z.null()])),
      },
      run: async (args, ctx) => {
        let target = null;
        if (args.session_id) {
          // L'API des tâches attend l'identifiant : un slug est résolu par la fiche.
          const s = await api(
            ctx,
            'GET',
            `/api/pedago-sessions/${seg(args.session_id)}`,
            undefined,
            {
              tool: TOOL,
            },
          );
          target = s?.id || args.session_id;
        }
        const task = await api(
          ctx,
          'PUT',
          `/api/tasks/${seg(args.task_id)}`,
          { pedago_session_id: target },
          { tool: TOOL },
        );
        return { task_id: task?.id, pedago_session_id: task?.pedago_session_id ?? target };
      },
    },
  },
});

module.exports = { buildPedagoSessionsTool: () => tool };
