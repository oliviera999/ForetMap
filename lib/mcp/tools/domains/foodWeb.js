'use strict';

/**
 * `foretmap_food_web` — le réseau trophique : interactions entre espèces (lot D3).
 *
 * Lectures et écritures par l'API `/api/food-web` : le noyau partagé
 * (`lib/shared/foodWebCore.js`) valide le type, le niveau de preuve, l'efficacité de
 * pollinisation, refuse les doublons et oriente l'interaction ; la route journalise.
 *
 * Modification : la route remplace l'interaction entière. L'outil relit l'interaction et
 * fusionne les seuls champs fournis, pour qu'une correction du niveau de preuve n'efface pas
 * la description ou la source.
 */

const { z } = require('zod');
const { defineDomainTool, req, api, pageOf, pageParams, paged, qs, seg } = require('./factory');
const { McpToolError } = require('../../registry');

const TOOL = 'foretmap_food_web';

const interactionId = z.number().int().positive().describe('Identifiant de l’interaction');
const speciesId = z.number().int().positive();
const fields = {
  from_id: speciesId.describe('Espèce source (mangeur, pollinisateur, hôte…)'),
  to_id: z.union([speciesId, z.null()]).describe('Espèce cible (null : interaction sans cible)'),
  interaction_type: z
    .string()
    .min(3)
    .max(32)
    .describe('Type (pollinisation, herbivorie, predation… — action types pour la liste)'),
  description: z.union([z.string().max(2000), z.null()]).describe('Description'),
  evidence_level: z
    .enum(['bibliographie', 'observe_site', 'hypothese'])
    .describe('Niveau de preuve'),
  pollination_efficacy: z
    .union([z.enum(['efficace', 'accessoire', 'visiteur', 'voleur_nectar']), z.null()])
    .describe('Efficacité (pollinisation seulement)'),
  source_ref: z.union([z.string().max(500), z.null()]).describe('Source bibliographique'),
};

async function listInteractions(ctx, { map_id, zone_id } = {}) {
  const res = await api(
    ctx,
    'GET',
    `/api/food-web${qs({ mapId: map_id, zoneId: zone_id })}`,
    undefined,
    { tool: TOOL },
  );
  return Array.isArray(res?.items) ? res.items : [];
}

function pickFields(args) {
  const out = {};
  for (const k of Object.keys(fields)) if (args[k] !== undefined) out[k] = args[k];
  return out;
}

const tool = defineDomainTool({
  name: TOOL,
  domain: 'food_web',
  title: 'Réseau trophique (interactions entre espèces)',
  intro:
    'Interactions du réseau trophique (qui mange, pollinise, parasite qui…) : liste filtrée par carte, zone, espèce, type ou niveau de preuve ; vocabulaire ; création, modification et suppression avec niveau de preuve et source.',
  actions: {
    list: {
      summary: 'interactions (filtres : carte, zone, espèce, type, niveau de preuve)',
      params: {
        map_id: z.string().max(32).describe('Espèces présentes sur cette carte'),
        zone_id: z.string().max(64).describe('Espèces de cette zone'),
        plant_id: speciesId.describe('Interactions où figure cette espèce'),
        interaction_type: fields.interaction_type,
        evidence_level: fields.evidence_level,
        ...pageParams,
      },
      run: async (args, ctx) => {
        const rows = (await listInteractions(ctx, args)).filter((r) => {
          if (args.plant_id) {
            const id = Number(args.plant_id);
            if (Number(r.from_id) !== id && Number(r.to_id) !== id) return false;
          }
          if (args.interaction_type && r.interaction_type !== args.interaction_type) return false;
          if (args.evidence_level && r.evidence_level !== args.evidence_level) return false;
          return true;
        });
        const p = pageOf(args, ctx, 200);
        return paged(rows.slice(p.offset, p.offset + p.limit), p, { total: rows.length });
      },
    },
    types: {
      summary: 'vocabulaire : types d’interaction, niveaux de preuve, efficacités',
      run: (args, ctx) =>
        api(ctx, 'GET', '/api/food-web/interaction-types', undefined, { tool: TOOL }),
    },
    create: {
      summary: 'créer une interaction (doublon refusé)',
      write: true,
      params: {
        ...fields,
        from_id: req(fields.from_id),
        interaction_type: req(fields.interaction_type),
      },
      run: async (args, ctx) => {
        const res = await api(ctx, 'POST', '/api/food-web/interactions', pickFields(args), {
          tool: TOOL,
        });
        return res?.interaction ?? res;
      },
    },
    update: {
      summary: 'modifier une interaction (seuls les champs fournis changent)',
      write: true,
      params: { interaction_id: req(interactionId), ...fields },
      run: async (args, ctx) => {
        const current = (await listInteractions(ctx)).find(
          (r) => Number(r.id) === Number(args.interaction_id),
        );
        if (!current) {
          throw new McpToolError(`Interaction ${args.interaction_id} introuvable`, 'MCP_NOT_FOUND');
        }
        const body = {
          from_id: current.from_id,
          to_id: current.to_id,
          interaction_type: current.interaction_type,
          description: current.description,
          evidence_level: current.evidence_level,
          pollination_efficacy: current.pollination_efficacy,
          source_ref: current.source_ref,
          ...pickFields(args),
        };
        // L'efficacité n'a de sens que pour la pollinisation : changer de type l'efface.
        if (body.interaction_type !== 'pollinisation') body.pollination_efficacy = null;
        const res = await api(
          ctx,
          'PUT',
          `/api/food-web/interactions/${seg(args.interaction_id)}`,
          body,
          { tool: TOOL },
        );
        return res?.interaction ?? res;
      },
    },
    delete: {
      summary: 'supprimer une interaction',
      write: true,
      params: { interaction_id: req(interactionId) },
      run: (args, ctx) =>
        api(ctx, 'DELETE', `/api/food-web/interactions/${seg(args.interaction_id)}`, undefined, {
          tool: TOOL,
        }),
    },
  },
});

module.exports = { buildFoodWebTool: () => tool };
