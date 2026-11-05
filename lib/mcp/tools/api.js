'use strict';

/**
 * Socle universel du connecteur : `foretmap_api` (pont API interne) et `foretmap_api_catalog`.
 *
 * `foretmap_api` appelle n'importe quelle route `/api/*` ForêtMap **en tant que** la personne
 * connectée au connecteur : ses droits applicatifs s'appliquent (un prof de classe ne peut rien
 * faire par Claude qu'il ne puisse faire dans l'application), et la route garde **sa** logique
 * métier. Toute méthode autre que GET exige la portée `foretmap.write`, vérifiée à l'appel.
 */

const { z } = require('zod');
const { SCOPES } = require('../config');
const { McpToolError } = require('../registry');
const { bridgeRequest, auditBridgeCall, getBridgeApp } = require('../apiBridge');
const { loadCatalog, filterCatalog } = require('../apiCatalog');
const { READ_ONLY } = require('./common');

const fileSchema = z.strictObject({
  field: z.string().min(1).max(64).describe('Nom du champ multipart (ex. image, file)'),
  filename: z.string().min(1).max(200),
  mime: z.string().min(3).max(120),
  content_base64: z.string().min(1).max(21_000_000).describe('Contenu encodé en base64'),
});

function scopesOf(ctx) {
  return new Set(ctx?.access?.scopes || []);
}

async function apiHandler(args, ctx) {
  const method = String(args.method || 'GET').toUpperCase();
  if (method !== 'GET' && !scopesOf(ctx).has(SCOPES.WRITE)) {
    throw new McpToolError(
      'Portée OAuth « foretmap.write » requise pour une méthode autre que GET',
      'MCP_FORBIDDEN',
    );
  }
  const res = await bridgeRequest(ctx, {
    method,
    path: args.path,
    query: args.query,
    body: args.body,
    files: args.files,
    tool: 'foretmap_api',
  });
  await auditBridgeCall(ctx, { method, path: args.path, status: res.status, tool: 'foretmap_api' });
  const out = { status: res.status, request_id: res.request_id };
  if (res.location) out.location = res.location;
  if (res.json !== undefined) out.json = res.json;
  if (res.text !== undefined) out.text = res.text;
  if (res.text_truncated) out.text_truncated = true;
  if (res.binary) out.binary = res.binary;
  if (res.headers['content-disposition']) {
    out.content_disposition = res.headers['content-disposition'];
  }
  return out;
}

function catalogHandler(args) {
  const routes = loadCatalog(getBridgeApp());
  const filtered = filterCatalog(routes, args);
  const limit = Math.min(500, Math.max(1, args.limit ?? 200));
  const offset = Math.max(0, args.offset ?? 0);
  const items = filtered.slice(offset, offset + limit);
  const out = {
    total: filtered.length,
    count: items.length,
    offset,
    items: items.map((r) => ({
      method: r.method,
      path: r.path,
      section: r.section,
      permissions: r.permissions.length ? r.permissions : undefined,
      documented: r.documented,
      served: r.served,
      description: r.description || undefined,
    })),
  };
  if (offset + items.length < filtered.length) out.next_offset = offset + items.length;
  return out;
}

function buildApiTools() {
  return [
    {
      name: 'foretmap_api',
      title: 'Appeler l’API ForêtMap (pont interne)',
      description:
        'Appelle n’importe quelle route /api/* ForêtMap EN TANT QUE la personne connectée, avec ses droits applicatifs et la logique métier de la route (recalcul des statuts, avancement des projets, progression des élèves, notifications, journal d’audit, temps réel). Préférer les outils de domaine (foretmap_tasks…) quand ils couvrent le besoin ; foretmap_api_catalog liste les routes. GET lit ; POST/PUT/PATCH/DELETE écrivent (portée foretmap.write). Refusés : /api/gl/*, /api/auth/login, /api/auth/logout ; routes d’authentification sensibles selon le réglage. Fichiers en multipart (15 Mo au total). Sortie : { status, json | text, location?, request_id } ; une erreur 4xx/5xx est renvoyée telle quelle avec son message.',
      inputSchema: z.strictObject({
        method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).describe('Méthode HTTP'),
        path: z.string().min(5).max(500).describe('Chemin commençant par /api/ (ex. /api/tasks)'),
        query: z
          .record(
            z.string(),
            z.union([
              z.string(),
              z.number(),
              z.boolean(),
              z.array(z.union([z.string(), z.number()])),
            ]),
          )
          .optional()
          .describe('Paramètres de requête'),
        body: z.unknown().optional().describe('Corps JSON (ou champs texte en multipart)'),
        files: z.array(fileSchema).max(10).optional().describe('Fichiers envoyés en multipart'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      requires: { scope: SCOPES.READ, permission: 'mcp.use', flag: 'api_bridge' },
      // Un élève nommé dans une réponse d'API n'est visible que si le bypass est actif.
      scrub: (ctx) => (ctx.privacyBypass ? 'secrets' : 'full'),
      handler: apiHandler,
    },
    {
      name: 'foretmap_api_catalog',
      title: 'Catalogue des routes de l’API ForêtMap',
      description:
        'Liste les routes ForêtMap (hors Gnomes & Licornes) : méthode, chemin, section, permission(s) citée(s), description, d’après docs/API.md croisé avec les routeurs réellement montés (documented: false = route servie non documentée). Filtres prefix (/api/tasks), q (texte), method. À consulter avant foretmap_api.',
      inputSchema: z.strictObject({
        prefix: z.string().max(200).optional().describe('Préfixe de chemin (ex. /api/tasks)'),
        q: z.string().max(200).optional().describe('Texte recherché'),
        method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
        undocumented_only: z.boolean().optional().describe('Seulement les routes non documentées'),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).max(100000).optional(),
      }),
      annotations: READ_ONLY,
      requires: { scope: SCOPES.READ, permission: 'mcp.use', flag: 'api_bridge' },
      handler: catalogHandler,
    },
  ];
}

module.exports = { buildApiTools };
