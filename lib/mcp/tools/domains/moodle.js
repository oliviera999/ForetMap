'use strict';

/**
 * `foretmap_moodle` — lien Moodle (lot D4) : contrôle de la connexion, simulation et
 * application de la synchronisation des cohortes, historique des exécutions.
 *
 * Par l'API `/api/admin/integrations/moodle` (permission `integrations.moodle.manage`), donc
 * avec le verrou d'exécution, les seuils de sécurité, le journal d'annulation et l'audit de la
 * route. Une simulation (`dry_run`) n'écrit que sa ligne d'historique ; l'application (`apply`)
 * crée, rattache ou désactive des comptes.
 *
 * Nominatif : le rapport d'une simulation, d'une application ou d'une exécution détaillée nomme
 * les comptes concernés. La liste des exécutions ne porte que des totaux.
 */

const { z } = require('zod');
const { defineDomainTool, req, api, pageOf, pageParams, qs, seg } = require('./factory');

const TOOL = 'foretmap_moodle';
const BASE = '/api/admin/integrations/moodle';

const cohortIds = z
  .array(z.number().int().positive())
  .min(1)
  .max(200)
  .describe('Cohortes Moodle à synchroniser (identifiants, voir cohorts)');
const runOptions = {
  cohort_ids: req(cohortIds),
  teams: z.boolean().describe('Synchroniser aussi les équipes'),
};

function runBody(mode, args) {
  const body = { mode, cohortIds: args.cohort_ids, teams: !!args.teams };
  if (args.force) {
    body.force = true;
    if (args.force_reason) body.forceReason = args.force_reason;
  }
  return body;
}

const tool = defineDomainTool({
  name: TOOL,
  domain: 'moodle',
  title: 'Lien Moodle (synchronisation)',
  intro:
    'Synchronisation des comptes et groupes avec Moodle : état et contrôle de la connexion, cohortes disponibles, simulation (dry_run) puis application d’une synchronisation, historique des exécutions et détail d’une exécution.',
  actions: {
    check: {
      summary: 'état du lien et contrôle de la connexion (fonctions Moodle disponibles)',
      params: {
        live: z.boolean().describe('Contrôle actif auprès de Moodle (défaut : état mémorisé)'),
      },
      run: (args, ctx) =>
        args.live
          ? api(ctx, 'POST', `${BASE}/check`, {}, { tool: TOOL })
          : api(ctx, 'GET', `${BASE}/status`, undefined, { tool: TOOL }),
    },
    cohorts: {
      summary: 'cohortes Moodle disponibles',
      run: (_args, ctx) => api(ctx, 'GET', `${BASE}/cohorts`, undefined, { tool: TOOL }),
    },
    dry_run: {
      summary: 'simuler une synchronisation (rapport : créations, rattachements, désactivations)',
      nominative: true,
      params: runOptions,
      run: (args, ctx) =>
        api(ctx, 'POST', `${BASE}/runs`, runBody('dry_run', args), { tool: TOOL }),
    },
    apply: {
      summary: 'appliquer une synchronisation (force + force_reason pour passer un seuil)',
      write: true,
      nominative: true,
      params: {
        ...runOptions,
        force: z.boolean().describe('Passer outre un seuil de sécurité'),
        force_reason: z.string().max(300).describe('Motif obligatoire avec force'),
      },
      run: (args, ctx) => api(ctx, 'POST', `${BASE}/runs`, runBody('apply', args), { tool: TOOL }),
    },
    runs: {
      summary: 'historique des exécutions (mode, statut, totaux ; détail : action run)',
      params: { ...pageParams },
      run: (args, ctx) => {
        const p = pageOf(args, ctx, 20);
        return api(
          ctx,
          'GET',
          `${BASE}/runs${qs({ limit: Math.min(100, p.limit), offset: p.offset })}`,
          undefined,
          { tool: TOOL },
        );
      },
    },
    run: {
      summary: 'détail d’une exécution (rapport complet)',
      nominative: true,
      params: { run_id: req(z.number().int().positive().describe('Exécution')) },
      run: (args, ctx) =>
        api(ctx, 'GET', `${BASE}/runs/${seg(args.run_id)}`, undefined, { tool: TOOL }),
    },
  },
});

function buildMoodleTool() {
  return tool;
}

module.exports = { buildMoodleTool };
