'use strict';

/**
 * `foretmap_social` — vie collective (lot D4) : forum, commentaires sur les éléments,
 * messages déposés sur les lieux, notifications, carnets et fresques.
 *
 * Tout passe par l'API du site (pont `ctx` → route), donc avec la visibilité et les droits de
 * la personne connectée : périmètre de groupes du forum, module désactivé, permission de
 * modération (`forum.group.moderate`), statut des messages de lieu (`place_messages.manage`),
 * envoi de notifications (`notifications.send`).
 *
 * Nominatif : le détail d'un sujet, les signalements, les commentaires, les carnets et les
 * fresques portent des noms d'élèves. La liste des sujets est rendue **sans** auteur.
 *
 * Absent faute de route (non créé ici, à arbitrer) : masquer un message sans le supprimer,
 * éditer un message en modérateur, supprimer un sujet entier, traiter les signalements de
 * commentaires (`context_comment_reports` n'a pas de route de lecture ni de traitement),
 * modérer un carnet d'élève.
 */

const { z } = require('zod');
const { defineDomainTool, req, api, pageOf, pageParams, paged, qs, seg } = require('./factory');
const { McpToolError } = require('../../registry');

const TOOL = 'foretmap_social';
const FORUM_PAGE_MAX = 100;

const idParam = z.string().min(1).max(64);
const groupId = z.string().min(1).max(64).describe('Groupe');
const contextTypes = ['task', 'project', 'zone', 'marker', 'plant', 'tutorial'];

/** Sujet de forum sans auteur (la liste n'est pas nominative). */
function compactThread(t) {
  return {
    id: t.id,
    group_id: t.group_id || null,
    title: t.title,
    is_pinned: !!Number(t.is_pinned),
    is_locked: !!Number(t.is_locked),
    created_at: t.created_at,
    last_post_at: t.last_post_at || null,
    posts_count: t.posts_count == null ? null : Number(t.posts_count),
  };
}

/** Pagination du forum (page / page_size de l'API) à partir de limit / offset. */
function forumPage(args, ctx, def = 50) {
  const p = pageOf(args, ctx, def);
  const pageSize = Math.min(FORUM_PAGE_MAX, p.limit);
  return { page: Math.floor(p.offset / pageSize) + 1, page_size: pageSize };
}

async function forumModerate(args, ctx) {
  const op = args.op;
  const call = (method, path, body) => api(ctx, method, path, body, { tool: TOOL });
  if (op === 'pin' || op === 'unpin' || op === 'lock' || op === 'unlock') {
    if (!args.thread_id) throw new McpToolError(`${op} : thread_id requis`, 'MCP_INVALID_ARGS');
    const flag = op.endsWith('pin') ? 'pin' : 'lock';
    const body = flag === 'pin' ? { pinned: op === 'pin' } : { locked: op === 'lock' };
    return call('PATCH', `/api/forum/threads/${seg(args.thread_id)}/${flag}`, body);
  }
  if (op === 'delete_post') {
    if (!args.post_id) throw new McpToolError('delete_post : post_id requis', 'MCP_INVALID_ARGS');
    return call('DELETE', `/api/forum/posts/${seg(args.post_id)}`);
  }
  // resolve_report
  if (!args.report_id || !args.status) {
    throw new McpToolError('resolve_report : report_id et status requis', 'MCP_INVALID_ARGS');
  }
  return call('PATCH', `/api/forum/reports/${seg(args.report_id)}`, { status: args.status });
}

const tool = defineDomainTool({
  name: TOOL,
  domain: 'social',
  title: 'Vie collective (forum, commentaires, lieux, notifications, carnets)',
  intro:
    'Vie collective du site : sujets du forum et leur modération (épingler, verrouiller, supprimer un message, signalements), commentaires sur les tâches, lieux, plantes et tutoriels, messages déposés sur les lieux et leur statut de traitement, envoi d’une notification, carnets d’observation et fresques des élèves. Pas de route pour masquer ou éditer un message en modérateur, supprimer un sujet entier, traiter les signalements de commentaires ni modérer un carnet.',
  actions: {
    forum_list: {
      summary: 'sujets du forum (sans auteur), épinglés d’abord ; filtre de groupe',
      params: { group_id: groupId, ...pageParams },
      run: async (args, ctx) => {
        const fp = forumPage(args, ctx);
        const out = await api(
          ctx,
          'GET',
          `/api/forum/threads${qs({ group_id: args.group_id, ...fp })}`,
          undefined,
          { tool: TOOL },
        );
        const items = (out?.items || []).map(compactThread);
        const offset = (fp.page - 1) * fp.page_size;
        return paged(items, { limit: fp.page_size, offset }, { total: out?.total ?? null });
      },
    },
    forum_get: {
      summary: 'un sujet et ses messages (auteurs, réactions)',
      nominative: true,
      params: { thread_id: req(idParam.describe('Sujet')), ...pageParams },
      run: (args, ctx) =>
        api(
          ctx,
          'GET',
          `/api/forum/threads/${seg(args.thread_id)}${qs(forumPage(args, ctx))}`,
          undefined,
          { tool: TOOL },
        ),
    },
    forum_reports: {
      summary: 'signalements de messages du forum (auteur, signaleur, extrait)',
      nominative: true,
      params: {
        status: z.enum(['open', 'resolved', 'dismissed']).describe('Statut (défaut : tous)'),
        ...pageParams,
      },
      run: (args, ctx) =>
        api(
          ctx,
          'GET',
          `/api/forum/reports${qs({ status: args.status, ...forumPage(args, ctx) })}`,
          undefined,
          { tool: TOOL },
        ),
    },
    forum_moderate: {
      summary:
        'modérer : op pin / unpin / lock / unlock (thread_id), delete_post (post_id), resolve_report (report_id + status)',
      write: true,
      params: {
        op: req(
          z
            .enum(['pin', 'unpin', 'lock', 'unlock', 'delete_post', 'resolve_report'])
            .describe('Opération de modération'),
        ),
        thread_id: idParam.describe('Sujet'),
        post_id: idParam.describe('Message'),
        report_id: idParam.describe('Signalement'),
        status: z.enum(['open', 'resolved', 'dismissed']).describe('Statut du signalement'),
      },
      run: forumModerate,
    },
    comments_list: {
      summary:
        'commentaires d’un élément (context_type + context_id) ; sans élément : derniers messages déposés sur les lieux',
      nominative: true,
      params: {
        context_type: z.enum(contextTypes).describe('Type d’élément commenté'),
        context_id: idParam.describe('Identifiant de l’élément'),
        ...pageParams,
      },
      run: async (args, ctx) => {
        const p = pageOf(args, ctx, 50);
        if (args.context_type || args.context_id) {
          if (!args.context_type || !args.context_id) {
            throw new McpToolError(
              'comments_list : context_type et context_id vont ensemble',
              'MCP_INVALID_ARGS',
            );
          }
          const pageSize = Math.min(FORUM_PAGE_MAX, p.limit);
          return api(
            ctx,
            'GET',
            `/api/context-comments${qs({
              contextType: args.context_type,
              contextId: args.context_id,
              page: Math.floor(p.offset / pageSize) + 1,
              page_size: pageSize,
            })}`,
            undefined,
            { tool: TOOL },
          );
        }
        return api(ctx, 'GET', `/api/context-comments/recent${qs({ limit: p.limit })}`, undefined, {
          tool: TOOL,
        });
      },
    },
    comments_moderate: {
      summary: 'supprimer un commentaire (suppression douce, journalisée comme modération)',
      write: true,
      params: { comment_id: req(idParam.describe('Commentaire')) },
      run: (args, ctx) =>
        api(ctx, 'DELETE', `/api/context-comments/${seg(args.comment_id)}`, undefined, {
          tool: TOOL,
        }),
    },
    place_reports: {
      summary:
        'statut de traitement d’un message déposé sur un lieu (pris_en_compte, traite, sans_suite) ; l’auteur est prévenu',
      write: true,
      params: {
        comment_id: req(idParam.describe('Message de lieu')),
        place_status: req(
          z.enum(['pris_en_compte', 'traite', 'sans_suite']).describe('Statut de traitement'),
        ),
      },
      run: (args, ctx) =>
        api(
          ctx,
          'PATCH',
          `/api/context-comments/${seg(args.comment_id)}/place-status`,
          { status: args.place_status },
          { tool: TOOL },
        ),
    },
    notify: {
      summary:
        'envoyer une notification (titre, texte, lien vers une tâche / un lieu / un sujet / une section des réglages) à des comptes, un groupe ou tous',
      write: true,
      params: {
        title: req(z.string().min(1).max(200).describe('Titre')),
        body: z.string().max(500).describe('Texte'),
        link: z
          .object({
            type: z.enum(['task', 'place', 'thread', 'settings']),
            id: z.string().max(64).optional(),
            map_id: z.string().max(64).optional(),
            kind: z.enum(['zone', 'marker']).optional(),
            post_id: z.string().max(64).optional(),
            section: z.string().max(64).optional(),
            filter: z.string().max(64).optional(),
          })
          .strict()
          .describe('Élément ouvert au clic'),
        user_ids: z.array(idParam).min(1).max(500).describe('Comptes destinataires'),
        group_id: groupId,
        all: z.literal(true).describe('Tous les comptes actifs'),
        user_type: z.enum(['student', 'teacher']).describe('Restreindre à élèves ou enseignants'),
      },
      run: (args, ctx) => {
        const target = {};
        for (const k of ['user_ids', 'group_id', 'all', 'user_type']) {
          if (args[k] !== undefined) target[k] = args[k];
        }
        const body = { title: args.title, target };
        if (args.body) body.body = args.body;
        if (args.link) body.link = args.link;
        return api(ctx, 'POST', '/api/notifications/send', body, { tool: TOOL });
      },
    },
    journals: {
      summary: 'carnets d’observation : fil récent du périmètre (group_id) ou carnet d’un compte',
      nominative: true,
      params: { user_id: idParam.describe('Compte dont on lit le carnet'), group_id: groupId },
      run: (args, ctx) => {
        if (args.user_id) {
          return api(ctx, 'GET', `/api/user-journal/users/${seg(args.user_id)}`, undefined, {
            tool: TOOL,
          });
        }
        return api(
          ctx,
          'GET',
          `/api/user-journal/feed${qs({ group_id: args.group_id })}`,
          undefined,
          {
            tool: TOOL,
          },
        );
      },
    },
    fresques: {
      summary: 'avancement des fresques par élève ou groupe (filtre jeu et groupe)',
      nominative: true,
      params: {
        deck_id: z.string().min(1).max(64).describe('Jeu de cartes'),
        group_id: groupId,
        ...pageParams,
      },
      run: async (args, ctx) => {
        const out = await api(
          ctx,
          'GET',
          `/api/fresques/overview${qs({ deckId: args.deck_id, groupId: args.group_id })}`,
          undefined,
          { tool: TOOL },
        );
        const p = pageOf(args, ctx);
        const boards = Array.isArray(out?.boards) ? out.boards : [];
        return paged(boards.slice(p.offset, p.offset + p.limit), p, {
          deck_id: out?.deckId ?? null,
          group_id: out?.groupId ?? null,
          total: boards.length,
        });
      },
    },
  },
});

function buildSocialTool() {
  return tool;
}

module.exports = { buildSocialTool, compactThread };
