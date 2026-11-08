'use strict';

/**
 * `gl_settings` — réglages Gnomes & Licornes (`gl_settings`, domaine `gl`).
 *
 * `gl_settings` est une table **secrète** pour le connecteur (`lib/mcp/secretGuard.js`,
 * `lib/mcp/sqlGuard.js`) : `foretmap_sql_select` la refuse. Cet outil est donc la seule voie :
 * - `list` / `get` : valeurs lues par la **route** `GET /api/gl/admin/settings` (permission
 *   `gl.settings.manage`, pont G&L `lib/mcp/glBridge.js`), croisées avec le registre déclaratif
 *   `GL_SETTINGS_REGISTRY` (`lib/glSettings.js`) : groupe, type, bornes, valeurs admises,
 *   défaut, et **source** (`défaut` = clé du registre absente de la base, `base` = enregistrée,
 *   `hors_registre` = clé libre persistée telle quelle). Une clé dont le nom ressemble à un
 *   secret est masquée (défense en profondeur) ;
 * - `set` (écriture) : `PUT /api/gl/admin/settings/:key` — validation du registre, gardes de
 *   clé et invalidation des caches de la route ; journalisé par le pont (`mcp_api_call`).
 */

const { z } = require('zod');
const { defineDomainTool, req, pageOf, pageParams, paged, seg } = require('./factory');
const { callGlApi } = require('../../glBridge');
const { McpToolError } = require('../../registry');

const TOOL = 'gl_settings';

const keyParam = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9_.-]+$/, 'clé invalide')
  .describe('Clé du réglage (ex. gameplay.tenir_enabled, modules.market_enabled)');

function metaOf(key) {
  const { GL_SETTINGS_REGISTRY } = require('../../../glSettings');
  const { metaOf: lookup } = require('../../../shared/settingsRegistryCore');
  return lookup(GL_SETTINGS_REGISTRY, key);
}

function describe(key, stored, meta) {
  const { isSecretColumn } = require('../../secretGuard');
  const inBase = stored !== undefined;
  const value = inBase ? stored : meta ? meta.default : null;
  const out = {
    key,
    group: meta?.group || null,
    type: meta?.type || null,
    value: isSecretColumn(key.split('.').pop()) ? '[masqué]' : value,
    default_value: meta ? meta.default : null,
    source: meta ? (inBase ? 'base' : 'défaut') : 'hors_registre',
    in_registry: !!meta,
  };
  if (meta?.min !== undefined) out.min = meta.min;
  if (meta?.max !== undefined) out.max = meta.max;
  if (Array.isArray(meta?.values)) out.values = meta.values;
  if (meta?.maxLength !== undefined) out.max_length = meta.maxLength;
  return out;
}

/** Toutes les clés : registre ∪ base, décrites. */
async function loadAll(ctx, staff) {
  const { GL_SETTINGS_REGISTRY } = require('../../../glSettings');
  const res = await callGlApi(ctx, 'GET', '/api/gl/admin/settings', undefined, {
    tool: TOOL,
    staff,
  });
  const stored = res?.settings && typeof res.settings === 'object' ? res.settings : {};
  const keys = [...new Set([...Object.keys(GL_SETTINGS_REGISTRY), ...Object.keys(stored)])].sort();
  return keys.map((key) => describe(key, stored[key], metaOf(key)));
}

const tool = defineDomainTool({
  name: TOOL,
  domain: 'gl',
  title: 'G&L : réglages du jeu (lire, modifier)',
  intro:
    'Réglages Gnomes & Licornes (gl_settings, table que foretmap_sql_select refuse) : liste filtrable avec groupe (gameplay, modules, gating, platform), type, bornes, valeurs admises, défaut, valeur effective et source (défaut, base, hors_registre) ; lecture d’une clé ; modification par la route d’administration du jeu (validation du registre, caches invalidés). Réservé au staff G&L (permission gl.settings.manage).',
  actions: {
    list: {
      summary: 'toutes les clés (filtres : group, prefix, q, source)',
      params: {
        group: z
          .string()
          .max(40)
          .describe('Groupe du registre (gameplay, modules, gating, platform)'),
        prefix: z.string().max(80).describe('Préfixe de clé (ex. gameplay.tenir_)'),
        q: z.string().max(80).describe('Texte cherché dans la clé'),
        source: z.enum(['base', 'défaut', 'hors_registre']).describe('Source de la valeur'),
        ...pageParams,
      },
      run: async (args, ctx) => {
        const q = args.q ? args.q.toLowerCase() : null;
        const rows = (await loadAll(ctx)).filter((r) => {
          if (args.group && String(r.group || '').toLowerCase() !== args.group.toLowerCase()) {
            return false;
          }
          if (args.prefix && !r.key.startsWith(args.prefix)) return false;
          if (q && !r.key.toLowerCase().includes(q)) return false;
          if (args.source && r.source !== args.source) return false;
          return true;
        });
        const p = pageOf(args, ctx, 500);
        return paged(rows.slice(p.offset, p.offset + p.limit), p, { total: rows.length });
      },
    },
    get: {
      summary: 'une clé : valeur effective, source, métadonnées du registre',
      params: { key: req(keyParam) },
      run: async (args, ctx) => {
        const row = (await loadAll(ctx)).find((r) => r.key === args.key);
        if (!row) throw new McpToolError(`Réglage inconnu : ${args.key}`, 'MCP_NOT_FOUND');
        return row;
      },
    },
    set: {
      summary: 'modifier une clé par la route d’administration du jeu (validation du registre)',
      write: true,
      params: {
        key: req(keyParam),
        value: req(
          z
            .union([
              z.string().max(20000),
              z.number(),
              z.boolean(),
              z.null(),
              z.record(z.string(), z.unknown()),
              z.array(z.unknown()).max(500),
            ])
            .describe('Nouvelle valeur (type du registre : booléen, nombre, texte, objet JSON)'),
        ),
      },
      run: async (args, ctx) => {
        const before = (await loadAll(ctx)).find((r) => r.key === args.key) || null;
        await callGlApi(
          ctx,
          'PUT',
          `/api/gl/admin/settings/${seg(args.key)}`,
          { value: args.value },
          { tool: TOOL },
        );
        const after = (await loadAll(ctx)).find((r) => r.key === args.key) || null;
        return { ok: true, key: args.key, before, after };
      },
    },
  },
});

module.exports = { buildGlSettingsTool: () => tool, describeGlSetting: describe };
