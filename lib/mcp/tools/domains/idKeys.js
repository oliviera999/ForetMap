'use strict';

/**
 * `foretmap_id_keys` — clés d'identification dichotomiques (lot D3).
 *
 * Une clé est un graphe de couplets ; chaque couplet porte au moins deux propositions
 * (« leads ») qui mènent à un autre couplet ou à une espèce. Tout passe par `/api/id-keys`
 * (permission `id_keys.manage`) : la route refuse les cycles, les renvois vers une autre clé,
 * les espèces inconnues et les consignes de manipulation dangereuses.
 *
 * Limite connue : il n'existe pas de route pour modifier le **numéro** d'un couplet existant
 * (seulement ses propositions) — `upsert_node` ne le change donc pas.
 */

const { z } = require('zod');
const { defineDomainTool, req, api, qs, seg } = require('./factory');
const { McpToolError } = require('../../registry');

const TOOL = 'foretmap_id_keys';

const keyId = z.number().int().positive().describe('Identifiant numérique de la clé');
const coupletId = z.number().int().positive().describe('Identifiant du couplet (nœud)');
const keyFields = {
  slug: z.string().max(80).describe('Identifiant d’URL (création seulement)'),
  title: z.string().max(255).describe('Titre'),
  description: z.union([z.string().max(5000), z.null()]).describe('Description'),
  map_id: z.union([z.string().max(32), z.null()]).describe('Carte de rattachement'),
  scope_label: z.union([z.string().max(255), z.null()]).describe('Périmètre (« arbres du parc »)'),
  niveau: z.string().max(32).describe('Niveau (college, lycee…)'),
  is_published: z.boolean().describe('Publiée (visible des élèves)'),
};

const lead = z.object({
  statement: z.string().min(1).max(2000).describe('Proposition (« feuilles opposées »)'),
  image_url: z.string().max(1024).optional(),
  next_couplet_id: z.number().int().positive().optional().describe('Couplet suivant'),
  plant_id: z.number().int().positive().optional().describe('Espèce atteinte'),
  sort_order: z.number().int().min(0).max(100).optional(),
});

function pick(args, keys) {
  const out = {};
  for (const k of keys) if (args[k] !== undefined) out[k] = args[k];
  return out;
}

const tool = defineDomainTool({
  name: TOOL,
  domain: 'id_keys',
  title: 'Clés d’identification (couplets et propositions)',
  intro:
    'Clés d’identification dichotomiques : liste (brouillons compris), clé complète, création et modification des métadonnées (publication), suppression, et édition des nœuds (couplets) avec leurs propositions menant à un couplet ou à une espèce.',
  actions: {
    list: {
      summary: 'clés (publiées et brouillons si vous gérez les clés)',
      run: (args, ctx) =>
        api(ctx, 'GET', `/api/id-keys${qs({ all: 1 })}`, undefined, { tool: TOOL }),
    },
    get: {
      summary: 'clé complète : couplets, propositions, espèces atteintes',
      params: {
        key: req(z.union([keyId, z.string().min(1).max(80)]).describe('Identifiant ou slug')),
      },
      run: (args, ctx) =>
        api(ctx, 'GET', `/api/id-keys/${seg(args.key)}`, undefined, { tool: TOOL }),
    },
    create_key: {
      summary: 'créer une clé (titre et slug requis)',
      write: true,
      params: { ...keyFields, title: req(keyFields.title), slug: req(keyFields.slug) },
      run: (args, ctx) =>
        api(ctx, 'POST', '/api/id-keys', pick(args, Object.keys(keyFields)), { tool: TOOL }),
    },
    update_key: {
      summary: 'modifier les métadonnées ou publier / dépublier (la publication vérifie la clé)',
      write: true,
      params: { key_id: req(keyId), ...keyFields },
      run: (args, ctx) => {
        const { slug: _slug, ...editable } = keyFields;
        return api(
          ctx,
          'PUT',
          `/api/id-keys/${seg(args.key_id)}`,
          pick(args, Object.keys(editable)),
          { tool: TOOL },
        );
      },
    },
    delete_key: {
      summary: 'supprimer une clé (couplets et propositions compris)',
      write: true,
      params: { key_id: req(keyId) },
      run: (args, ctx) =>
        api(ctx, 'DELETE', `/api/id-keys/${seg(args.key_id)}`, undefined, { tool: TOOL }),
    },
    upsert_node: {
      summary:
        'créer un couplet (sans couplet_id ; number facultatif) ou remplacer les propositions d’un couplet existant (au moins deux)',
      write: true,
      params: {
        key_id: req(keyId),
        couplet_id: coupletId,
        number: z.number().int().positive().max(10_000).describe('Numéro (création seulement)'),
        leads: req(z.array(lead).min(2).max(12).describe('Propositions du couplet')),
      },
      run: async (args, ctx) => {
        const base = `/api/id-keys/${seg(args.key_id)}/couplets`;
        let id = args.couplet_id;
        let created = false;
        if (!id) {
          const res = await api(ctx, 'POST', base, args.number ? { number: args.number } : {}, {
            tool: TOOL,
          });
          id = res?.id;
          created = true;
          if (!id) throw new McpToolError('Création du couplet sans identifiant', 'MCP_API_ERROR');
        } else if (args.number !== undefined) {
          throw new McpToolError(
            'Le numéro d’un couplet existant ne se modifie pas (aucune route) : omettez number',
            'MCP_INVALID_ARGS',
          );
        }
        try {
          const couplet = await api(
            ctx,
            'PUT',
            `${base}/${seg(id)}/leads`,
            { leads: args.leads },
            { tool: TOOL },
          );
          return { created, couplet };
        } catch (err) {
          // Propositions refusées (cycle, espèce inconnue…) : ne pas laisser un couplet vide.
          if (created) {
            await api(ctx, 'DELETE', `${base}/${seg(id)}`, undefined, { tool: TOOL }).catch(
              () => null,
            );
          }
          throw err;
        }
      },
    },
    delete_node: {
      summary: 'supprimer un couplet (le couplet de départ reste si c’est le seul)',
      write: true,
      params: { key_id: req(keyId), couplet_id: req(coupletId) },
      run: (args, ctx) =>
        api(
          ctx,
          'DELETE',
          `/api/id-keys/${seg(args.key_id)}/couplets/${seg(args.couplet_id)}`,
          undefined,
          { tool: TOOL },
        ),
    },
  },
});

module.exports = { buildIdKeysTool: () => tool };
