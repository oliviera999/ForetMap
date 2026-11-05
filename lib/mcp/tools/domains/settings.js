'use strict';

/**
 * `foretmap_settings` — réglages du site (lot D4, profil essentiel).
 *
 * - `list` / `get` : toutes les clés de l'administration (`GET /api/settings/admin`, permission
 *   `admin.settings.read`) avec leurs métadonnées (domaine, type, bornes, défaut), la valeur
 *   effective et sa **source** : `env` (variable d'environnement, clé verrouillée), `base`
 *   (enregistrée dans `app_settings`) ou `défaut`. Pour les clés `mcp.*`, la source vient de la
 *   résolution du connecteur (`ctx.cfg.settings`, env > base > défaut).
 * - `set` : `PUT /api/settings/admin/:key` (permission `admin.settings.write`), donc avec la
 *   validation, la journalisation et les gardes de la route ; une clé `mcp.*` verrouillée par
 *   l'environnement est refusée par la route (409) et son message est relayé.
 *
 * Les codes d'accès et mots de passe des plans (empreintes) ne passent pas par `set` : la route
 * les refuse et indique la route dédiée.
 */

const { z } = require('zod');
const { defineDomainTool, req, api, pageOf, pageParams, paged, seg } = require('./factory');
const { McpToolError } = require('../../registry');

const TOOL = 'foretmap_settings';

const keyParam = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9_.-]+$/, 'clé invalide')
  .describe('Clé du réglage (ex. ui.map.default_map_student, mcp.write_mode)');

let domainByKey = null;

/** Domaine déclarant chaque clé (`lib/settings/domains.js`). */
function domainOf(key) {
  if (!domainByKey) {
    domainByKey = new Map();
    const { SETTINGS_DOMAINS } = require('../../../settings/domains');
    for (const { domain, settings } of SETTINGS_DOMAINS) {
      for (const k of Object.keys(settings)) domainByKey.set(k, domain);
    }
  }
  return domainByKey.get(key) || null;
}

/** Ligne de l'administration enrichie de la source effective. */
function describeSetting(row, ctx) {
  const out = {
    key: row.key,
    domain: domainOf(row.key),
    scope: row.scope,
    type: row.type,
    value: row.value,
    default_value: row.default_value,
    constraints: row.constraints,
    source: row.updated_at ? 'base' : 'défaut',
    locked: false,
    env: null,
    updated_at: row.updated_at || null,
  };
  if (String(row.key).startsWith('mcp.')) {
    const entry = ctx?.cfg?.settings?.[row.key];
    if (entry) {
      out.value = entry.value;
      out.source = entry.source;
      out.locked = !!entry.locked;
      out.env = entry.env || null;
    }
  }
  return out;
}

async function loadSettings(ctx) {
  const res = await api(ctx, 'GET', '/api/settings/admin', undefined, { tool: TOOL });
  return (res?.settings || []).map((row) => describeSetting(row, ctx));
}

const tool = defineDomainTool({
  name: TOOL,
  domain: 'settings',
  profile: 'essentiel',
  title: 'Réglages du site (lire, modifier)',
  intro:
    'Réglages de l’administration : liste filtrable de toutes les clés avec domaine, type, bornes, défaut, valeur effective et source (env = fixé par une variable d’environnement et verrouillé, base = enregistré, défaut), lecture d’une clé et modification (avec la validation de l’administration ; une clé fixée par l’environnement est refusée).',
  actions: {
    list: {
      summary: 'toutes les clés (filtres : domaine, préfixe, texte, source)',
      params: {
        domain: z.string().max(60).describe('Domaine (marque, tâches, connecteur Claude…)'),
        prefix: z.string().max(80).describe('Préfixe de clé (ex. ui.map.)'),
        q: z.string().max(80).describe('Texte cherché dans la clé'),
        source: z.enum(['env', 'base', 'défaut']).describe('Source de la valeur'),
        ...pageParams,
      },
      run: async (args, ctx) => {
        const q = args.q ? args.q.toLowerCase() : null;
        const rows = (await loadSettings(ctx)).filter((r) => {
          if (args.domain && String(r.domain || '').toLowerCase() !== args.domain.toLowerCase()) {
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
      summary: 'une clé : valeur effective, source, métadonnées',
      params: { key: req(keyParam) },
      run: async (args, ctx) => {
        const row = (await loadSettings(ctx)).find((r) => r.key === args.key);
        if (!row) throw new McpToolError(`Réglage inconnu : ${args.key}`, 'MCP_NOT_FOUND');
        return row;
      },
    },
    set: {
      summary: 'modifier une clé (validation de l’administration ; clé fixée par l’env refusée)',
      write: true,
      params: {
        key: req(keyParam),
        value: req(
          z
            .union([z.string().max(20000), z.number(), z.boolean(), z.null()])
            .describe('Nouvelle valeur (texte, nombre ou booléen selon le type)'),
        ),
      },
      run: async (args, ctx) => {
        const res = await api(
          ctx,
          'PUT',
          `/api/settings/admin/${seg(args.key)}`,
          { value: args.value },
          { tool: TOOL },
        );
        if (String(args.key).startsWith('mcp.')) {
          // L'instantané du connecteur se relit au prochain appel (cache ≤ 10 s, invalidé par
          // l'écriture) : on prévient que l'effet n'est pas forcément immédiat dans cet appel.
          return { ...res, note: 'Réglage du connecteur : pris en compte au prochain appel.' };
        }
        return res;
      },
    },
  },
});

function buildSettingsTool() {
  return tool;
}

module.exports = { buildSettingsTool, describeSetting };
