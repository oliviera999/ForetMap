'use strict';

/**
 * `foretmap_plans` — les trois plans de l'établissement : plan public, plan des personnels
 * et plan e-nov (lot D3).
 *
 * - Lectures : la charge que sert chaque plan (`/api/plan/content`, `/api/staff-plan/content`,
 *   `/api/enov/content`), donc ce que voit réellement le lecteur (surface, audience, lieux
 *   masqués) ; les réglages `ui.plan.*`, `ui.staff_plan.*`, `ui.enov_plan.*` par
 *   `GET /api/settings/admin`.
 * - Écritures : réglages par `PUT /api/settings/admin/:key` (validation et cohérence croisée de
 *   la route) ; champs « plan » d'un lieu (alias de recherche, description et type d'espace
 *   e-nov, masquage par surface) par le `PUT` de la zone ou du repère.
 * - `rotate_code` : un nouveau code d'accès est tiré ici (aléa cryptographique, alphabet sans
 *   caractères ambigus), envoyé à la route dédiée — qui n'en garde que l'empreinte bcrypt — et
 *   renvoyé **une seule fois** dans `nouveau_code`. Il n'est ni journalisé ni conservé.
 *   Longueur : le minimum imposé par la route (`ACCESS_SECRET_MIN_LENGTH`, 12 caractères).
 */

const crypto = require('node:crypto');
const { z } = require('zod');
const { defineDomainTool, req, api, qs, seg } = require('./factory');
const { McpToolError } = require('../../registry');
const { ACCESS_SECRET_MIN_LENGTH } = require('../../../accessSecret');

const TOOL = 'foretmap_plans';

const SURFACES = Object.freeze({
  plan: {
    content: '/api/plan/content',
    prefix: 'ui.plan.',
    codeRoute: '/api/settings/admin/plan-access-code',
  },
  staff: {
    content: '/api/staff-plan/content',
    prefix: 'ui.staff_plan.',
    codeRoute: '/api/settings/admin/staff-plan-access-code',
  },
  enov: {
    content: '/api/enov/content',
    prefix: 'ui.enov_plan.',
    codeRoute: '/api/settings/admin/enov-plan-access-code',
  },
});

/** Alphabet lisible : sans 0/O, 1/I/L, ni minuscules (dictée, affiche, QR). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Code d'accès tiré sans biais (`crypto.randomInt`). */
function generateAccessCode(length = ACCESS_SECRET_MIN_LENGTH) {
  let out = '';
  for (let i = 0; i < length; i += 1) out += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return out;
}

const surface = z
  .enum(['plan', 'staff', 'enov'])
  .describe('plan (public), staff (personnels), enov');
const kind = z.enum(['zone', 'marker']).describe('zone ou marker (repère)');

async function loadContent(ctx, s, map) {
  return api(ctx, 'GET', `${SURFACES[s].content}${qs({ map_id: map })}`, undefined, {
    tool: TOOL,
  });
}

function compactPlace(p, k) {
  return {
    kind: k,
    id: p.id,
    name: k === 'zone' ? p.name : p.label,
    emoji: p.emoji || null,
    category_ids: p.category_ids || [],
    search_aliases: p.search_aliases || [],
    enov_tier: p.enov_tier ?? undefined,
    enov_description: p.enov_description || undefined,
    enov_space_type: p.enov_space_type || undefined,
  };
}

const tool = defineDomainTool({
  name: TOOL,
  domain: 'plans',
  title: 'Plans de l’établissement (public, personnels, e-nov)',
  intro:
    'Les trois plans (public, personnels, e-nov) : charge servie au lecteur, lieux et espaces (alias de recherche, description et type d’espace e-nov), réglages ui.plan.* / ui.staff_plan.* / ui.enov_plan.*, et rotation du code d’accès (le nouveau code n’est montré qu’une fois).',
  actions: {
    content: {
      summary:
        'charge d’un plan (carte, réglages publics, catégories, nombre de lieux et parcours ; full=true pour tout)',
      params: {
        surface: req(surface),
        map_id: z.string().max(32).describe('Carte (sinon celle du plan)'),
        full: z.boolean().describe('Charge complète de l’API'),
      },
      run: async (args, ctx) => {
        const c = await loadContent(ctx, args.surface, args.map_id);
        if (args.full) return c;
        return {
          surface: args.surface,
          map: c?.map ?? null,
          maps: c?.maps ?? [],
          settings: c?.settings ?? null,
          categories: (c?.categories || []).map((x) => ({ id: x.id, label: x.label })),
          zones: (c?.zones || []).length,
          markers: (c?.markers || []).length,
          routes: (c?.routes || []).map((r) => ({ id: r.id, title: r.title })),
        };
      },
    },
    places: {
      summary: 'lieux et espaces publiés sur un plan (texte cherché facultatif)',
      params: {
        surface: req(surface),
        map_id: z.string().max(32).describe('Carte (sinon celle du plan)'),
        q: z.string().max(200).describe('Texte cherché (nom, alias)'),
      },
      run: async (args, ctx) => {
        const c = await loadContent(ctx, args.surface, args.map_id);
        const all = [
          ...(c?.zones || []).map((p) => compactPlace(p, 'zone')),
          ...(c?.markers || []).map((p) => compactPlace(p, 'marker')),
        ];
        const q = args.q ? args.q.toLowerCase() : null;
        const items = q
          ? all.filter((p) => `${p.name} ${p.search_aliases.join(' ')}`.toLowerCase().includes(q))
          : all;
        return { surface: args.surface, map_id: c?.map?.id ?? null, total: items.length, items };
      },
    },
    place_update: {
      summary:
        'champs « plan » d’un lieu : alias de recherche, description et type d’espace e-nov, surfaces où il est masqué',
      write: true,
      params: {
        kind: req(kind),
        place_id: req(z.string().min(1).max(64)),
        search_aliases: z.union([
          z.array(z.string().max(120)).max(30),
          z.string().max(2000),
          z.null(),
        ]),
        enov_description: z.union([z.string().max(5000), z.null()]),
        enov_space_type: z.union([z.string().max(64), z.null()]),
        hidden_surfaces: z.array(z.string().max(32)).max(10),
      },
      run: (args, ctx) => {
        const body = {};
        for (const k of [
          'search_aliases',
          'enov_description',
          'enov_space_type',
          'hidden_surfaces',
        ]) {
          if (args[k] !== undefined) body[k] = args[k];
        }
        if (!Object.keys(body).length)
          throw new McpToolError('Aucun champ à modifier', 'MCP_INVALID_ARGS');
        const base = args.kind === 'zone' ? '/api/zones' : '/api/map/markers';
        return api(ctx, 'PUT', `${base}/${seg(args.place_id)}`, body, { tool: TOOL });
      },
    },
    settings: {
      summary:
        'réglages des plans (ui.plan.*, ui.staff_plan.*, ui.enov_plan.*) avec valeurs par défaut',
      permission: 'admin.settings.read',
      params: { surface },
      run: async (args, ctx) => {
        const res = await api(ctx, 'GET', '/api/settings/admin', undefined, { tool: TOOL });
        const prefixes = args.surface
          ? [SURFACES[args.surface].prefix]
          : Object.values(SURFACES).map((s) => s.prefix);
        const rows = (res?.settings || []).filter((r) =>
          prefixes.some((p) => String(r.key).startsWith(p)),
        );
        return {
          items: rows.map((r) => ({
            key: r.key,
            type: r.type,
            value: r.value,
            default_value: r.default_value,
            constraints: r.constraints,
          })),
        };
      },
    },
    set_setting: {
      summary: 'modifier un réglage de plan (clé ui.plan.*, ui.staff_plan.* ou ui.enov_plan.*)',
      write: true,
      params: {
        key: req(z.string().min(4).max(120)),
        value: req(z.unknown().describe('Nouvelle valeur (type du réglage)')),
      },
      run: (args, ctx) => {
        const key = String(args.key);
        if (!Object.values(SURFACES).some((s) => key.startsWith(s.prefix))) {
          throw new McpToolError(
            'Clé hors des réglages de plans (ui.plan.*, ui.staff_plan.*, ui.enov_plan.*)',
            'MCP_INVALID_ARGS',
          );
        }
        return api(
          ctx,
          'PUT',
          `/api/settings/admin/${seg(key)}`,
          { value: args.value },
          {
            tool: TOOL,
          },
        );
      },
    },
    rotate_code: {
      summary:
        'générer et enregistrer un nouveau code d’accès du plan (renvoyé une seule fois dans nouveau_code ; l’ancien cesse de fonctionner)',
      write: true,
      params: { surface: req(surface) },
      run: async (args, ctx) => {
        const code = generateAccessCode();
        const res = await api(
          ctx,
          'POST',
          SURFACES[args.surface].codeRoute,
          { code },
          {
            tool: TOOL,
          },
        );
        return {
          surface: args.surface,
          ok: !!res?.ok,
          has_code: !!res?.hasCode,
          nouveau_code: code,
          avertissement:
            'Ce code n’est montré qu’une fois et n’est pas conservé en clair. Le mode d’accès du plan (réglage access_mode) n’est pas modifié.',
        };
      },
    },
  },
});

module.exports = { buildPlansTool: () => tool, generateAccessCode, CODE_ALPHABET };
