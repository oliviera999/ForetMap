'use strict';

/**
 * `gl_tenir_catalogues` — catalogues « Tenir à deux » (`data/gl/tenir/*.json`, domaine `gl`).
 *
 * - `status` : par fichier, table alimentée, nombre de lignes actives, empreinte du dépôt et de
 *   la base, écart, dernier rapport de synchronisation — `GET /api/gl/admin/tenir/catalogues`
 *   (`lib/glTenirSync.js › describeTenirCatalogues`, permission `gl.content.manage`) ;
 * - `sync` (écriture) : `POST /api/gl/admin/tenir/catalogues/sync { dryRun, fichier }` — import
 *   tolérant d'un fichier ou de tous, journalisé par la route (`gl_tenir_catalogues_sync`).
 */

const { z } = require('zod');
const { defineDomainTool } = require('./factory');
const { callGlApi } = require('../../glBridge');

const TOOL = 'gl_tenir_catalogues';

function fileNames() {
  const { IMPORT_ORDER } = require('../../../glTenirImport');
  return [...IMPORT_ORDER];
}

const tool = defineDomainTool({
  name: TOOL,
  domain: 'gl',
  title: 'G&L : catalogues « Tenir à deux » (état, synchronisation)',
  intro:
    'Catalogues « Tenir à deux » du dépôt (data/gl/tenir/*.json : sorts, zones de chasse, questions de lecture, péripéties, titres, missions, badges, lignes d’Olu, parures, Passeur) : comptes par table, empreintes dépôt / base et écarts, dernier rapport ; synchronisation (import tolérant, simulation possible). Réservé au staff G&L (permission gl.content.manage).',
  actions: {
    status: {
      summary: 'comptes par catalogue, empreintes dépôt / base, écarts, dernier rapport',
      run: (_args, ctx) =>
        callGlApi(ctx, 'GET', '/api/gl/admin/tenir/catalogues', undefined, { tool: TOOL }),
    },
    sync: {
      summary: 'synchroniser un fichier ou tous (dry_run : rapport sans écriture)',
      write: true,
      params: {
        fichier: z
          .string()
          .max(40)
          .refine((v) => fileNames().includes(v), 'fichier inconnu')
          .describe('Un catalogue (sorts, chasse-zones, questions-lecture…) ; absent = tous'),
        dry_run: z.boolean().describe('Simulation : rapport sans rien écrire'),
      },
      run: (args, ctx) =>
        callGlApi(
          ctx,
          'POST',
          '/api/gl/admin/tenir/catalogues/sync',
          { dryRun: args.dry_run === true, ...(args.fichier ? { fichier: args.fichier } : {}) },
          { tool: TOOL },
        ),
    },
  },
});

module.exports = { buildGlTenirCataloguesTool: () => tool };
