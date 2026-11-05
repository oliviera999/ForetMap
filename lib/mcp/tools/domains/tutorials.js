'use strict';

/**
 * `foretmap_tutorials` — tutoriels (fiches HTML, liens, PDF) et leurs rattachements (lot D2).
 *
 * Tout passe par l'API du site (`/api/tutorials`, `/api/tasks/:id`, `/api/learning-links`) :
 * - lier / délier une **zone** ou un **repère** : `PUT /api/tutorials/:id` avec la liste
 *   complète relue puis modifiée (`zone_ids`, `marker_ids`) ;
 * - une **tâche** : `PUT /api/tasks/:id` (`tutorial_ids`, liste relue puis modifiée) ;
 * - une **question** du quiz : `POST /api/learning-links` (lien non bloquant par défaut),
 *   suppression par `DELETE /api/learning-links/:id`.
 * Les lectures (`reads_stats`, `reads_detail`) passent par `GET /api/tutorials/:id/reads` ;
 * le détail (répartition par groupe, lecteurs nommés) est nominatif.
 */

const { z } = require('zod');
const { defineDomainTool, req, api, pageOf, pageParams, paged, qs, seg } = require('./factory');
const { McpToolError } = require('../../registry');

const TOOL = 'foretmap_tutorials';

const tutorialId = z.union([z.number().int().min(1), z.string().min(1).max(16)]);
const data = z
  .record(z.string(), z.unknown())
  .describe(
    'Champs du tutoriel (comme l’API : title, type html|link|pdf, summary, html_content, source_url, source_file_path, cover_image_url, sort_order, is_active, zone_ids, marker_ids)',
  );
const targetType = z
  .enum(['zone', 'marker', 'task', 'question'])
  .describe('Cible : zone, repère, tâche ou question du quiz');
const targetId = z.string().min(1).max(64).describe('Identifiant de la cible (code de question)');

function getTutorial(ctx, id, extra = {}) {
  return api(
    ctx,
    'GET',
    `/api/tutorials/${seg(id)}${qs({ include_inactive: '1', ...extra })}`,
    undefined,
    { tool: TOOL },
  );
}

/** Ajoute ou retire `value` d'une liste d'identifiants (comparaison textuelle). */
function toggled(list, value, add) {
  const ids = (Array.isArray(list) ? list : []).map(String);
  const v = String(value);
  if (add) return ids.includes(v) ? ids : [...ids, v];
  return ids.filter((x) => x !== v);
}

async function setLink(args, ctx, add) {
  const tid = String(args.tutorial_id);
  if (args.target_type === 'zone' || args.target_type === 'marker') {
    const key = args.target_type === 'zone' ? 'zone_ids' : 'marker_ids';
    const tuto = await getTutorial(ctx, tid);
    const next = toggled(tuto?.[key], args.target_id, add);
    return api(ctx, 'PUT', `/api/tutorials/${seg(tid)}`, { [key]: next }, { tool: TOOL });
  }
  if (args.target_type === 'task') {
    const task = await api(ctx, 'GET', `/api/tasks/${seg(args.target_id)}`, undefined, {
      tool: TOOL,
    });
    const next = toggled(task?.tutorial_ids, tid, add).map(Number);
    const updated = await api(
      ctx,
      'PUT',
      `/api/tasks/${seg(args.target_id)}`,
      { tutorial_ids: next },
      { tool: TOOL },
    );
    return { task_id: updated?.id, tutorial_ids: updated?.tutorial_ids ?? next };
  }
  // Question du quiz : lien ressource ↔ question (service unique `learning-links`).
  if (add) {
    return api(
      ctx,
      'POST',
      '/api/learning-links',
      {
        resource_type: 'tutorial',
        resource_ref: tid,
        question_code: args.target_id,
        // Bloquant seulement si demandé : un lien existant garde sinon son réglage.
        ...(args.is_gating !== undefined ? { is_gating: args.is_gating } : {}),
        status: 'approved',
      },
      { tool: TOOL },
    );
  }
  const found = await api(
    ctx,
    'GET',
    `/api/learning-links${qs({
      resourceType: 'tutorial',
      resourceRef: tid,
      questionCode: args.target_id,
    })}`,
    undefined,
    { tool: TOOL },
  );
  const link = (found?.links || [])[0];
  if (!link)
    throw new McpToolError('Aucun lien entre ce tutoriel et cette question', 'MCP_NOT_FOUND');
  await api(ctx, 'DELETE', `/api/learning-links/${seg(link.id)}`, undefined, { tool: TOOL });
  return { success: true, deleted_link_id: link.id };
}

const linkParams = {
  tutorial_id: req(tutorialId),
  target_type: req(targetType),
  target_id: req(targetId),
};

const tool = defineDomainTool({
  name: TOOL,
  domain: 'tutorials',
  title: 'Tutoriels (fiches, liens, lectures)',
  intro:
    'Tutoriels de la forêt : liste, fiche (lieux, tâches liées), création, modification, archivage, rattachement ou détachement d’une zone, d’un repère, d’une tâche ou d’une question du quiz, et statistiques de lecture (« lu et compris »).',
  actions: {
    list: {
      summary: 'liste (archivés compris si include_inactive)',
      params: {
        include_inactive: z.boolean().describe('Inclure les tutoriels archivés'),
        q: z.string().max(200).describe('Texte cherché (titre, résumé)'),
        ...pageParams,
      },
      run: async (args, ctx) => {
        const rows = await api(
          ctx,
          'GET',
          `/api/tutorials${qs({ include_inactive: args.include_inactive ? '1' : undefined })}`,
          undefined,
          { tool: TOOL },
        );
        const needle = args.q ? String(args.q).toLowerCase() : null;
        const list = (Array.isArray(rows) ? rows : []).filter(
          (t) => !needle || `${t.title || ''} ${t.summary || ''}`.toLowerCase().includes(needle),
        );
        const p = pageOf(args, ctx);
        return paged(list.slice(p.offset, p.offset + p.limit), p, { total: list.length });
      },
    },
    get: {
      summary: 'fiche (lieux, tâches liées ; contenu HTML si include_content)',
      params: {
        tutorial_id: req(tutorialId),
        include_content: z.boolean().describe('Inclure le HTML (volumineux)'),
      },
      run: async (args, ctx) => {
        const tuto = await getTutorial(ctx, args.tutorial_id, {
          include_content: args.include_content ? '1' : undefined,
        });
        const linked = await api(
          ctx,
          'GET',
          `/api/tutorials/${seg(args.tutorial_id)}/linked-tasks?include_inactive=1`,
          undefined,
          { tool: TOOL },
        );
        return { ...tuto, linked_tasks: linked?.tasks || [] };
      },
    },
    create: {
      summary: 'créer un tutoriel (title, type ; html_content, source_url ou fichier)',
      write: true,
      params: { data: req(data) },
      run: (args, ctx) => api(ctx, 'POST', '/api/tutorials', args.data, { tool: TOOL }),
    },
    update: {
      summary: 'modifier un tutoriel (seuls les champs fournis changent)',
      write: true,
      params: { tutorial_id: req(tutorialId), data: req(data) },
      run: (args, ctx) =>
        api(ctx, 'PUT', `/api/tutorials/${seg(args.tutorial_id)}`, args.data, { tool: TOOL }),
    },
    delete: {
      summary: 'archiver (désactivation : liens et lectures conservés ; réactiver par update)',
      write: true,
      params: { tutorial_id: req(tutorialId) },
      run: (args, ctx) =>
        api(ctx, 'DELETE', `/api/tutorials/${seg(args.tutorial_id)}`, undefined, { tool: TOOL }),
    },
    link: {
      summary:
        'rattacher à une zone, un repère, une tâche ou une question (is_gating pour une question bloquante)',
      write: true,
      params: {
        ...linkParams,
        is_gating: z.boolean().describe('Question bloquante (défaut false)'),
      },
      run: (args, ctx) => setLink(args, ctx, true),
    },
    unlink: {
      summary: 'détacher d’une zone, d’un repère, d’une tâche ou d’une question',
      write: true,
      params: linkParams,
      run: (args, ctx) => setLink(args, ctx, false),
    },
    reads_stats: {
      summary: 'lectures « lu et compris » : total, élèves, première et dernière date',
      permission: ['tutorials.manage', 'stats.read.all'],
      params: { tutorial_id: req(tutorialId) },
      run: async (args, ctx) => {
        const r = await api(
          ctx,
          'GET',
          `/api/tutorials/${seg(args.tutorial_id)}/reads`,
          undefined,
          {
            tool: TOOL,
          },
        );
        return {
          tutorial_id: r.tutorial_id,
          title: r.title,
          is_active: r.is_active,
          total_reads: r.total_reads,
          student_reads: r.student_reads,
          first_read_at: r.first_read_at,
          last_read_at: r.last_read_at,
          groups_with_readers: Array.isArray(r.by_group) ? r.by_group.length : 0,
        };
      },
    },
    reads_detail: {
      summary:
        'détail des lectures : par groupe (lecteurs / effectif) et lecteurs nommés (avec stats.read.all)',
      nominative: true,
      permission: ['tutorials.manage', 'stats.read.all'],
      params: { tutorial_id: req(tutorialId) },
      run: (args, ctx) =>
        api(ctx, 'GET', `/api/tutorials/${seg(args.tutorial_id)}/reads`, undefined, {
          tool: TOOL,
        }),
    },
  },
});

module.exports = { buildTutorialsTool: () => tool };
