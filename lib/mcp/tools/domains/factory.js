'use strict';

/**
 * Fabrique des outils de domaine du connecteur (lot D) : un outil par domaine, un paramètre
 * `action` (énumération fermée), un schéma zod **strict par action**.
 *
 * Schéma publié : le SDK MCP ne sait pas exposer une union discriminée (Claude recevrait un
 * schéma vide). On publie donc un objet plat — `action` + l'union des paramètres, tous
 * facultatifs, chacun décrit avec les actions qui l'emploient — puis on valide **à l'appel**
 * avec le schéma strict de l'action (`z.strictObject`), qui refuse tout paramètre inattendu.
 *
 * Règles communes, appliquées ici et non dans chaque domaine :
 * - **écriture** (`write: true`) : portée `foretmap.write`, pont API actif
 *   (`mcp.api_bridge_enabled`), confirmation selon `mcp.confirm_mode` (`all_writes`) ;
 *   l'écriture passe par `ctx.api` (pont interne, logique métier de la route) — jamais en SQL ;
 * - **nominatif** (`nominative: true`) : bypass RGPD actif et permission `mcp.privacy_bypass` ;
 *   chaque appel est journalisé (`mcp.privacy_bypass.read`) ;
 * - **lecture SQL** (`permission`) : une lecture agrégée qui ne passe pas par une route exige la
 *   permission applicative équivalente (le SQL ne contourne pas le RBAC) ;
 * - domaine retiré par `mcp.domains_disabled` : outil absent (`registry.checkToolAccess`).
 *
 * Ces modules ne sont chargés que par `buildServerTools` (serveur), jamais par le stdio Cursor.
 */

const { z } = require('zod');
const { SCOPES, getMcpConfig } = require('../../config');
const { McpToolError } = require('../../registry');
const { confirmationFields, ensureConfirmed } = require('../../confirm');

/** Pagination standard des outils de domaine (plafond : `mcp.max_rows`). */
const pageParams = Object.freeze({
  limit: z.number().int().min(1).max(5000).describe('Nombre maximal de résultats'),
  offset: z.number().int().min(0).max(10_000_000).describe('Décalage de pagination'),
});

function pageOf(args, ctx, defLimit = 100) {
  const max = Math.max(1, (ctx?.cfg || getMcpConfig()).maxRows || 2000);
  return {
    limit: Math.min(max, Math.max(1, args?.limit ?? defLimit)),
    offset: Math.max(0, args?.offset ?? 0),
  };
}

function paged(items, { limit, offset }, extra = {}) {
  const out = { ...extra, items, count: items.length, offset };
  if (items.length === limit) out.next_offset = offset + limit;
  return out;
}

function optionalOf(schema) {
  return typeof schema.optional === 'function' ? schema.optional() : schema;
}

/** Marque un paramètre **obligatoire** pour une action (les autres sont facultatifs). */
function req(schema) {
  return { __mcpRequired: true, schema };
}

function unwrap(p) {
  return p && p.__mcpRequired
    ? { schema: p.schema, required: true }
    : { schema: p, required: false };
}

/** Forme stricte d'une action : obligatoires tels quels, le reste facultatif. */
function strictShape(params = {}) {
  const shape = {};
  for (const [key, raw] of Object.entries(params)) {
    const { schema, required } = unwrap(raw);
    shape[key] = required ? schema : optionalOf(schema);
  }
  return shape;
}

function formatZodError(err) {
  const issues = err?.issues || [];
  if (!issues.length) return 'Paramètres invalides';
  return issues
    .slice(0, 6)
    .map((i) => `${(i.path || []).join('.') || 'paramètres'} : ${i.message}`)
    .join(' ; ');
}

function hasPermission(ctx, perm) {
  const perms = new Set(ctx?.access?.permissions || []);
  return perms.has(perm);
}

async function auditNominative(ctx, tool, action, args) {
  const cfg = ctx?.cfg || getMcpConfig();
  const { logAudit } = require('../../../auditLog');
  const payload = { via: 'mcp', tool, action, privacy_bypass: true };
  if (cfg.privacyReadsAuditDetails === 'full') {
    const { confirmation_code: _c, confirmation_id: _i, ...rest } = args || {};
    payload.args = rest;
  }
  await logAudit('mcp.privacy_bypass.read', 'mcp_tool', tool, action, {
    actorUserType: ctx?.user?.userType || 'teacher',
    actorUserId: String(ctx?.user?.userId || ''),
    payload,
  });
}

/**
 * @param {{
 *   name: string, domain: string, title: string, intro: string,
 *   profile?: 'essentiel',
 *   requires?: object,
 *   actions: Record<string, {
 *     summary: string, write?: boolean, nominative?: boolean, permission?: string|string[],
 *     params?: Record<string, import('zod').ZodTypeAny>,
 *     run: (args: object, ctx: object) => Promise<unknown>,
 *   }>,
 * }} spec
 */
function defineDomainTool(spec) {
  const names = Object.keys(spec.actions);
  if (!names.length) throw new Error(`Outil ${spec.name} sans action`);
  const anyWrite = names.some((n) => spec.actions[n].write);

  // Schéma plat publié : union des paramètres, avec les actions qui les emploient.
  const usage = new Map();
  for (const n of names) {
    for (const [key, raw] of Object.entries(spec.actions[n].params || {})) {
      const { schema, required } = unwrap(raw);
      if (!usage.has(key)) usage.set(key, { schema, actions: [] });
      usage.get(key).actions.push(required ? `${n} (requis)` : n);
    }
  }
  const shape = {
    action: z.enum(names).describe(
      names
        .map((n) => {
          const a = spec.actions[n];
          const flags = [a.write ? 'écrit' : 'lit', a.nominative ? 'nominatif*' : null]
            .filter(Boolean)
            .join(', ');
          return `${n} (${flags}) : ${a.summary}`;
        })
        .join(' | '),
    ),
  };
  for (const [key, { schema, actions }] of usage) {
    const base = schema.description ? `${schema.description} ` : '';
    shape[key] = optionalOf(schema).describe(`${base}[${actions.join(', ')}]`);
  }
  if (anyWrite) Object.assign(shape, confirmationFields);

  const strictByAction = {};
  for (const n of names) {
    strictByAction[n] = z.strictObject({
      action: z.literal(n),
      ...strictShape(spec.actions[n].params),
      ...(spec.actions[n].write ? confirmationFields : {}),
    });
  }

  const writeList = names.filter((n) => spec.actions[n].write);
  const nominativeList = names.filter((n) => spec.actions[n].nominative);
  const description = [
    spec.intro,
    writeList.length ? `Actions qui écrivent : ${writeList.join(', ')}.` : 'Lecture seule.',
    nominativeList.length
      ? `Actions nominatives (*) : ${nominativeList.join(', ')} — exigent le bypass RGPD (réglage mcp.privacy_bypass et permission mcp.privacy_bypass), chaque appel est journalisé.`
      : null,
    writeList.length
      ? 'Les écritures passent par l’API du site avec VOS droits applicatifs (logique métier comprise).'
      : null,
  ]
    .filter(Boolean)
    .join(' ');

  async function handler(rawArgs, ctx) {
    const action = rawArgs?.action;
    const act = Object.hasOwn(spec.actions, action) ? spec.actions[action] : null;
    if (!act) throw new McpToolError(`Action inconnue : ${action}`, 'MCP_ACTION');
    const parsed = strictByAction[action].safeParse(rawArgs);
    if (!parsed.success) {
      throw new McpToolError(`${action} — ${formatZodError(parsed.error)}`, 'MCP_INVALID_ARGS');
    }
    const args = parsed.data;
    const cfg = ctx?.cfg || getMcpConfig();
    if (act.permission) {
      const needed = Array.isArray(act.permission) ? act.permission : [act.permission];
      // Au moins une des permissions listées.
      if (!needed.some((p) => hasPermission(ctx, p))) {
        throw new McpToolError(
          `${action} : permission applicative « ${needed.join(' » ou « ')} » requise`,
          'MCP_FORBIDDEN',
        );
      }
    }
    if (act.nominative) {
      if (!cfg.privacyBypassActive || !hasPermission(ctx, 'mcp.privacy_bypass')) {
        throw new McpToolError(
          `${action} : action nominative — exige le bypass RGPD actif (réglage mcp.privacy_bypass) et la permission mcp.privacy_bypass`,
          'MCP_PRIVACY',
        );
      }
    }
    if (act.write) {
      const scopes = new Set(ctx?.access?.scopes || []);
      if (!scopes.has(SCOPES.WRITE)) {
        throw new McpToolError('Portée OAuth « foretmap.write » requise', 'MCP_FORBIDDEN');
      }
      if (!cfg.apiBridgeEnabled) {
        throw new McpToolError(
          'Écritures des outils de domaine coupées (réglage mcp.api_bridge_enabled)',
          'MCP_BRIDGE_OFF',
        );
      }
      const gate = await ensureConfirmed({
        tool: spec.name,
        args,
        user: ctx.user,
        summary: `${spec.name} · ${action}`,
        needsConfirm: false,
      });
      if (!gate.proceed) return gate.response;
    }
    if (act.nominative) await auditNominative(ctx, spec.name, action, args);
    return act.run(args, ctx);
  }

  return {
    name: spec.name,
    title: spec.title,
    description,
    domain: spec.domain,
    profile: spec.profile,
    inputSchema: z.strictObject(shape),
    annotations: anyWrite
      ? { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
      : { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    requires: { scope: SCOPES.READ, permission: 'mcp.use', ...(spec.requires || {}) },
    scrub: (ctx) => (ctx.privacyBypass ? 'secrets' : 'full'),
    handler,
    actions: names,
  };
}

/** Appel du pont API depuis un outil de domaine (écritures et lectures par route). */
function api(ctx, method, path, body, opts = {}) {
  const { callApi } = require('../../apiBridge');
  return callApi(ctx, method, path, body, opts.files, { tool: opts.tool, query: opts.query });
}

/** Lecture SQL en lecture seule (`withReadOnly`) pour les agrégats sans route. */
function readOnly(work, opts) {
  const { withReadOnly } = require('../../readDb');
  return withReadOnly(work, opts);
}

/** Encode un segment de chemin. */
function seg(v) {
  return encodeURIComponent(String(v));
}

/** Construit une chaîne de requête à partir d'un objet (valeurs vides ignorées). */
function qs(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null || v === '') continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

module.exports = {
  req,
  api,
  defineDomainTool,
  formatZodError,
  hasPermission,
  pageOf,
  pageParams,
  paged,
  qs,
  readOnly,
  seg,
};
