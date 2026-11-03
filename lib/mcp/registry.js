'use strict';

/**
 * Registre d'outils MCP partagé par le serveur distant (`/mcp`) et le script stdio Cursor
 * (`scripts/mcp-foretmap-diagnostics.mjs`).
 *
 * **Aucune dépendance aux modules serveur** (base, logger Pino) au chargement : le script stdio
 * parle MCP sur sa sortie standard, et un journal Pino qui y écrirait corromprait le protocole.
 * Le journal passe donc par `ctx.log`, fourni par l'appelant.
 *
 * Une définition d'outil :
 * ```js
 * {
 *   name, title, description,          // nom stable préfixé, description FR pour un modèle
 *   inputSchema,                       // objet zod strict (z.strictObject)
 *   annotations,                       // readOnlyHint, destructiveHint, idempotentHint…
 *   requires: { scope, permission, flag }, // contrôlés à la liste ET à l'appel
 *   handler: async (args, ctx) => objet sérialisable
 * }
 * ```
 * Les réponses sont nettoyées (`scrubValue` : clés interdites retirées, e-mails / hachages /
 * jetons masqués), sérialisées en JSON **compact** et tronquées au-delà de `MAX_OUTPUT_CHARS`.
 */

const { scrubValue } = require('./sqlGuard');

const MAX_OUTPUT_CHARS = 120_000;

class McpToolError extends Error {
  constructor(message, code = 'MCP_TOOL_ERROR') {
    super(message);
    this.name = 'McpToolError';
    this.code = code;
  }
}

/**
 * L'appelant a-t-il le droit d'utiliser cet outil ?
 * @param {object} def définition
 * @param {{ scopes?: Set<string>|string[], permissions?: Set<string>|string[], flags?: object }} access
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function checkToolAccess(def, access = {}) {
  const req = def.requires || {};
  const scopes = new Set(access.scopes || []);
  const perms = new Set(access.permissions || []);
  const flags = access.flags || {};
  if (req.flag && !flags[req.flag]) {
    return { ok: false, reason: `Outil désactivé sur ce serveur (${req.flag})` };
  }
  // Prérequis d'exploitation évalué à chaque contrôle (ex. compte MySQL lecture seule).
  if (typeof req.available === 'function' && !req.available()) {
    return { ok: false, reason: 'Outil indisponible sur ce serveur (prérequis non configuré)' };
  }
  if (req.scope && !scopes.has(req.scope)) {
    return { ok: false, reason: `Portée OAuth « ${req.scope} » requise` };
  }
  const needed = Array.isArray(req.permission)
    ? req.permission
    : req.permission
      ? [req.permission]
      : [];
  for (const p of needed) {
    if (!perms.has(p)) return { ok: false, reason: `Permission « ${p} » requise` };
  }
  return { ok: true };
}

function serializeResult(value) {
  let text = JSON.stringify(scrubValue(value));
  if (text === undefined) text = 'null';
  if (text.length > MAX_OUTPUT_CHARS) {
    text = JSON.stringify({
      truncated: true,
      note: 'Réponse tronquée : réduisez `limit` ou paginez avec `offset`.',
      preview: text.slice(0, MAX_OUTPUT_CHARS - 200),
    });
  }
  return text;
}

function errorResult(message, code) {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ error: message, code: code || null }) }],
  };
}

/**
 * Inscrit sur `server` (McpServer du SDK) les outils autorisés pour `access`.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {object[]} defs
 * @param {{ access?: object, ctx?: object, log?: (entry: object) => void }} options
 * @returns {string[]} noms inscrits
 */
function registerTools(server, defs, { access = {}, ctx = {}, log = () => {} } = {}) {
  const registered = [];
  for (const def of defs) {
    if (!checkToolAccess(def, access).ok) continue;
    server.registerTool(
      def.name,
      {
        title: def.title,
        description: def.description,
        inputSchema: def.inputSchema,
        annotations: { title: def.title, ...(def.annotations || {}) },
      },
      async (args) => {
        const started = Date.now();
        // Revérifié à l'appel : la liste a pu être obtenue avec d'autres droits.
        const allowed = checkToolAccess(def, access);
        if (!allowed.ok) {
          log({ tool: def.name, status: 'denied', durationMs: 0 });
          return errorResult(allowed.reason, 'MCP_FORBIDDEN');
        }
        try {
          const value = await def.handler(args || {}, ctx);
          const text = serializeResult(value);
          log({ tool: def.name, status: 'ok', durationMs: Date.now() - started });
          return { content: [{ type: 'text', text }] };
        } catch (err) {
          const code = err?.code || null;
          const expected =
            err?.name === 'McpToolError' ||
            err?.name === 'McpDataAccessError' ||
            code === 'MCP_TOOL_TIMEOUT';
          log({
            tool: def.name,
            status: expected ? 'error' : 'failure',
            durationMs: Date.now() - started,
            code,
            err: expected ? undefined : err,
          });
          return errorResult(expected ? err.message : 'Erreur interne de l’outil', code);
        }
      },
    );
    registered.push(def.name);
  }
  return registered;
}

module.exports = {
  MAX_OUTPUT_CHARS,
  McpToolError,
  checkToolAccess,
  errorResult,
  registerTools,
  serializeResult,
};
