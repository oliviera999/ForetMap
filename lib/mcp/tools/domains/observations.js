'use strict';

/**
 * `foretmap_observations` — observations d'espèces soumises par les élèves, et individus
 * suivis (arbres mesurés) — lot D3.
 *
 * - File d'examen et fiche d'une observation : **nominatives** (nom de l'observateur), par
 *   l'API (`/api/species-observations/review`, `/:id`), donc avec le périmètre de cartes du
 *   compte et la permission `observations.validate`.
 * - Décision (`validate`, `reject`) : `POST /:id/decision`, transaction du service
 *   (`lib/terrain/observationService.js`) — une validation confirme la présence au registre de
 *   la carte (`map_species.validation_status = 'confirme_site'`) et fait monter les
 *   interactions dont l'observation est la preuve. La réponse est rendue **sans** l'identité de
 *   l'observateur ni du validateur : ces actions ne sont pas nominatives.
 * - `stats` : SQL agrégé en lecture seule (`lib/mcp/domains/observations.js`), permission
 *   `observations.read.all`.
 * - Individus : `/api/individuals` ; les champs personnels des mesures (auteur, groupe, notes)
 *   sont retirés de la sortie.
 */

const { z } = require('zod');
const { defineDomainTool, req, api, pageOf, pageParams, paged, qs, seg } = require('./factory');
const { McpToolError } = require('../../registry');
const { observationStats } = require('../../domains/observations');

const TOOL = 'foretmap_observations';

const observationId = z.number().int().positive().describe('Identifiant de l’observation');
const individualId = z.number().int().positive().describe('Identifiant de l’individu suivi');
const note = z.string().max(1000).describe('Note de décision (visible de l’élève)');
/**
 * Opération des actions « _write » : un seul schéma pour tout l'outil (le schéma publié est
 * commun à toutes les actions) ; chaque action vérifie les opérations qu'elle admet.
 */
const op = z.enum(['attach', 'detach', 'create', 'update', 'delete']);

function assertOp(args, allowed) {
  if (!allowed.includes(args.op)) {
    throw new McpToolError(
      `op « ${args.op} » non admise ici (${allowed.join(', ')})`,
      'MCP_INVALID_ARGS',
    );
  }
}

/** Champs d'identité retirés des réponses non nominatives. */
const IDENTITY_KEYS = [
  'observer_user_id',
  'observer_name',
  'validated_by',
  'validator_name',
  'first_record_by',
  'client_uuid',
  'journal_article_id',
];

function withoutIdentity(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = { ...obj };
  for (const k of IDENTITY_KEYS) delete out[k];
  return out;
}

async function decide(ctx, args, decision) {
  const body = { decision };
  if (args.plant_id !== undefined) body.plant_id = args.plant_id;
  if (args.note !== undefined) body.note = args.note;
  const res = await api(
    ctx,
    'POST',
    `/api/species-observations/${seg(args.observation_id)}/decision`,
    body,
    { tool: TOOL },
  );
  return {
    observation: withoutIdentity(res?.observation),
    already_decided: !!res?.already_decided,
    map_species: withoutIdentity(res?.map_species),
    interactions_upgraded: res?.interactions_upgraded ?? 0,
  };
}

/** Mesure sans ses champs personnels (auteur, groupe, notes libres). */
function publicMeasurement(m) {
  const { observer_user_id: _o, group_id: _g, notes: _n, ...rest } = m || {};
  return rest;
}

const individualData = z
  .record(z.string(), z.unknown())
  .describe(
    'Champs de l’individu (plant_id, map_id, label, zone_id, marker_id, planted_at AAAA-MM-JJ, wood_density, is_active, notes)',
  );

const tool = defineDomainTool({
  name: TOOL,
  domain: 'observations',
  title: 'Observations d’espèces et individus suivis',
  intro:
    'Observations d’espèces des élèves : file d’examen, fiche, validation (confirme la présence au registre de la carte) ou refus, preuves d’interaction, statistiques agrégées ; individus suivis (arbres) : liste, fiche avec mesures, création, modification, suppression.',
  actions: {
    queue: {
      summary: 'file d’examen (statut soumise par défaut, carte facultative) — avec l’observateur',
      nominative: true,
      params: {
        map_id: z.string().max(32).describe('Carte'),
        status: z.enum(['soumise', 'validee', 'refusee', 'all']).describe('Défaut soumise'),
        limit: pageParams.limit,
      },
      run: (args, ctx) =>
        api(
          ctx,
          'GET',
          `/api/species-observations/review${qs({
            map_id: args.map_id,
            status: args.status,
            limit: args.limit,
          })}`,
          undefined,
          { tool: TOOL },
        ),
    },
    get: {
      summary: 'fiche d’une observation (photos, preuves) — avec l’observateur',
      nominative: true,
      params: { observation_id: req(observationId) },
      run: (args, ctx) =>
        api(ctx, 'GET', `/api/species-observations/${seg(args.observation_id)}`, undefined, {
          tool: TOOL,
        }),
    },
    validate: {
      summary:
        'valider (espèce exigée : plant_id si l’élève ne l’a pas donnée) → présence confirmée au registre',
      write: true,
      params: {
        observation_id: req(observationId),
        plant_id: z.number().int().positive().describe('Espèce retenue'),
        note,
      },
      run: (args, ctx) => decide(ctx, args, 'validee'),
    },
    reject: {
      summary: 'refuser (le registre n’est jamais touché)',
      write: true,
      params: { observation_id: req(observationId), note },
      run: (args, ctx) => decide(ctx, args, 'refusee'),
    },
    evidence: {
      summary: 'interactions candidates où figure l’espèce observée (preuve rattachée ou non)',
      params: { observation_id: req(observationId) },
      run: (args, ctx) =>
        api(
          ctx,
          'GET',
          `/api/species-observations/${seg(args.observation_id)}/interactions`,
          undefined,
          { tool: TOOL },
        ),
    },
    evidence_write: {
      summary: 'op=attach : l’observation devient preuve d’une interaction ; op=detach : retirer',
      write: true,
      params: {
        observation_id: req(observationId),
        interaction_id: req(z.number().int().positive()),
        op: req(op),
      },
      run: (args, ctx) => {
        assertOp(args, ['attach', 'detach']);
        const base = `/api/species-observations/${seg(args.observation_id)}/interaction-evidence`;
        return args.op === 'attach'
          ? api(ctx, 'POST', base, { interaction_id: args.interaction_id }, { tool: TOOL })
          : api(ctx, 'DELETE', `${base}/${seg(args.interaction_id)}`, undefined, { tool: TOOL });
      },
    },
    stats: {
      summary:
        'statistiques : par statut, carte, espèce, mois, mode de détection ; délai de décision ; taux de validation',
      permission: 'observations.read.all',
      params: {
        map_id: z.string().max(32).describe('Carte'),
        from: z.string().max(10).describe('Observées à partir du (AAAA-MM-JJ)'),
        to: z.string().max(10).describe('Observées jusqu’au (AAAA-MM-JJ)'),
      },
      run: (args) => observationStats(args),
    },
    individuals: {
      summary:
        'individus suivis : liste (carte, espèce, actifs) ou fiche avec mesures et estimation biomasse si individual_id',
      params: {
        individual_id: individualId,
        map_id: z.string().max(32).describe('Carte'),
        plant_id: z.number().int().positive().describe('Espèce'),
        include_inactive: z.boolean().describe('Inclure les individus retirés'),
        ...pageParams,
      },
      run: async (args, ctx) => {
        if (args.individual_id) {
          const res = await api(
            ctx,
            'GET',
            `/api/individuals/${seg(args.individual_id)}`,
            undefined,
            { tool: TOOL },
          );
          if (res && Array.isArray(res.measurements)) {
            return { ...res, measurements: res.measurements.map(publicMeasurement) };
          }
          return res;
        }
        const res = await api(
          ctx,
          'GET',
          `/api/individuals${qs({
            mapId: args.map_id,
            plantId: args.plant_id,
            active: args.include_inactive ? '0' : undefined,
          })}`,
          undefined,
          { tool: TOOL },
        );
        const rows = Array.isArray(res) ? res : res?.items || res?.individuals || [];
        const p = pageOf(args, ctx);
        return paged(rows.slice(p.offset, p.offset + p.limit), p, { total: rows.length });
      },
    },
    individual_write: {
      summary: 'individus suivis : op=create (data), update (individual_id + data), delete',
      write: true,
      params: {
        op: req(op),
        individual_id: individualId,
        data: individualData,
      },
      run: (args, ctx) => {
        assertOp(args, ['create', 'update', 'delete']);
        if (args.op === 'create') {
          if (!args.data) throw new McpToolError('data requis pour create', 'MCP_INVALID_ARGS');
          return api(ctx, 'POST', '/api/individuals', args.data, { tool: TOOL });
        }
        if (!args.individual_id) {
          throw new McpToolError(`individual_id requis pour ${args.op}`, 'MCP_INVALID_ARGS');
        }
        const path = `/api/individuals/${seg(args.individual_id)}`;
        if (args.op === 'delete') return api(ctx, 'DELETE', path, undefined, { tool: TOOL });
        if (!args.data) throw new McpToolError('data requis pour update', 'MCP_INVALID_ARGS');
        return api(ctx, 'PUT', path, args.data, { tool: TOOL });
      },
    },
  },
});

module.exports = { buildObservationsTool: () => tool, withoutIdentity };
