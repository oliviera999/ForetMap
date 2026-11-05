'use strict';

/**
 * Contexte d'un appel d'outil MCP (`via: 'mcp'`) — module **sans dépendance**, chargeable par
 * `lib/auditLog.js`, `lib/rateLimit.js` et `lib/routeLog.js` sans tirer le connecteur.
 *
 * Deux canaux, tous deux impossibles à falsifier depuis l'extérieur :
 * - un `Symbol` **non global** posé sur `req` par l'injecteur du pont (`lib/mcp/apiBridge.js`)
 *   avant qu'Express ne voie la requête — aucun en-tête HTTP ne peut le produire ;
 * - un `AsyncLocalStorage` ouvert autour de chaque appel d'outil (`registry.js`), pour les
 *   écritures d'audit faites sans `req` (`fireAndForget`, services, réglages).
 *
 * Contenu : `{ tool, clientId, userId, requestId }` — jamais de jeton.
 */

const { AsyncLocalStorage } = require('node:async_hooks');

const MCP_INTERNAL_REQUEST = Symbol('foretmap.mcp.internalRequest');
const storage = new AsyncLocalStorage();

/** Exécute `fn` dans le contexte d'un appel d'outil MCP. */
function runWithMcpContext(context, fn) {
  return storage.run(Object.freeze({ ...context }), fn);
}

/** Contexte de l'appel d'outil en cours (`null` hors appel MCP). */
function currentMcpContext() {
  return storage.getStore() || null;
}

/** Marque une requête interne du pont (appelé par l'injecteur seulement). */
function markMcpInternalRequest(req, context) {
  Object.defineProperty(req, MCP_INTERNAL_REQUEST, {
    value: Object.freeze({ ...context }),
    enumerable: false,
    configurable: false,
    writable: false,
  });
}

/** Contexte MCP d'une requête Express (`null` pour toute requête venue du réseau). */
function mcpContextOfRequest(req) {
  return (req && req[MCP_INTERNAL_REQUEST]) || null;
}

/** Champs à ajouter à une charge d'audit ou à un journal (`{}` hors MCP). */
function mcpAuditFields(req) {
  const ctx = mcpContextOfRequest(req) || currentMcpContext();
  if (!ctx) return {};
  return {
    via: 'mcp',
    mcp_tool: ctx.tool || null,
    mcp_client_id: ctx.clientId || null,
  };
}

module.exports = {
  currentMcpContext,
  markMcpInternalRequest,
  mcpAuditFields,
  mcpContextOfRequest,
  runWithMcpContext,
};
