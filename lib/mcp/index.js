'use strict';

/**
 * Montage du connecteur MCP distant dans l'application Express.
 *
 * `mountMcp(app)` est appelé par `server.js` **avant** le fallback SPA et hors du limiteur
 * général `/api/` :
 * - `/mcp` (POST JSON-RPC) avec son limiteur dédié (`MCP_RATE_LIMIT_PER_MIN`, clé = jeton
 *   haché ou IP) et un parseur JSON propre (1 Mo) ;
 * - `/.well-known/oauth-*` et `/oauth/*` (serveur d'autorisation).
 *
 * Hôte : le connecteur n'est servi que sur l'hôte du produit ForetMap principal (`foret`).
 * Sur `gl.*`, `plan.*`… ces chemins répondent 404 : un seul `resource`, un seul `issuer`.
 * Les outils G&L lisent directement la base, ils n'ont pas besoin de l'hôte GL.
 *
 * Désactivé (`MCP_ENABLED` absent ou faux) : tout répond 404, rien n'est chargé du SDK.
 */

const crypto = require('node:crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { getMcpConfig } = require('./config');
const { parseBearerToken } = require('../auth/jwtPipeline');
const { shouldSkipRateLimit } = require('../rateLimit');

const MCP_PRODUCT = 'foret';

function createMcpLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: () => getMcpConfig().rateLimitPerMin,
    skip: (req) => shouldSkipRateLimit(req),
    keyGenerator: (req) => {
      const token = parseBearerToken(req);
      if (token) {
        return `mcp:${crypto.createHash('sha256').update(token).digest('hex').slice(0, 32)}`;
      }
      return `mcp-ip:${req.ip || 'unknown'}`;
    },
    validate: { keyGeneratorIpFallback: false },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Trop de requêtes MCP, réessayez dans une minute.' },
        id: null,
      }),
  });
}

/** `/oauth/token` et `/oauth/revoke` : 120 requêtes / min par client (sinon par IP). */
function createTokenLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    skip: (req) => shouldSkipRateLimit(req),
    keyGenerator: (req) => {
      const clientId = String(req.body?.client_id || '').slice(0, 512);
      if (clientId) {
        return `mcp-token:${crypto.createHash('sha256').update(clientId).digest('hex').slice(0, 32)}`;
      }
      return `mcp-token-ip:${req.ip || 'unknown'}`;
    },
    validate: { keyGeneratorIpFallback: false },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).json({ error: 'slow_down', error_description: 'Trop de requêtes' }),
  });
}

function createRegisterLimiter() {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 60,
    skip: (req) => shouldSkipRateLimit(req),
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).json({ error: 'slow_down', error_description: 'Trop d’enregistrements' }),
  });
}

/**
 * @param {import('express').Express} app
 * @param {{ resolveProductId: (req: object) => string }} deps
 */
function mountMcp(app, { resolveProductId }) {
  const MCP_PATH_RE = /^\/(?:mcp\/?$|oauth\/|\.well-known\/(?:oauth-|openid-configuration))/;
  // Garde commune : connecteur coupé ou hôte d'un autre produit → 404, sans rien charger.
  app.use((req, res, next) => {
    if (!MCP_PATH_RE.test(req.path)) return next();
    if (!getMcpConfig().enabled || resolveProductId(req) !== MCP_PRODUCT) {
      return res.status(404).json({ error: 'not_found' });
    }
    return next();
  });

  let oauthRouter = null;
  let endpointRouter = null;
  // Les limiteurs sont créés au démarrage (express-rate-limit refuse d'être instancié pendant
  // une requête) ; seul le routeur, et donc le SDK, est chargé à la première requête.
  const registerLimiter = createRegisterLimiter();
  const tokenLimiter = createTokenLimiter();
  const mcpLimiter = createMcpLimiter();
  const lazyOAuth = (req, res, next) => {
    if (!oauthRouter) {
      oauthRouter = require('./oauth/router').createOAuthRouter({ registerLimiter, tokenLimiter });
    }
    return oauthRouter(req, res, next);
  };
  const lazyEndpoint = (req, res, next) => {
    if (!endpointRouter) endpointRouter = require('./server').createMcpEndpointRouter();
    return endpointRouter(req, res, next);
  };

  // Routeur OAuth (chemins absolus `/.well-known/…` et `/oauth/…`), chargé à la première
  // requête concernée seulement.
  app.use((req, res, next) => {
    if (!/^\/(?:oauth\/|\.well-known\/)/.test(req.path)) return next();
    return lazyOAuth(req, res, next);
  });
  // CORS ouvert : MCP Inspector (navigateur) appelle `/mcp` depuis une autre origine.
  // L'authentification se fait par jeton Bearer seulement (aucun cookie lu).
  app.use('/mcp', (req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id',
    );
    res.set('Access-Control-Expose-Headers', 'WWW-Authenticate, Mcp-Session-Id');
    res.set('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  });
  // Corps borné (256 ko) : un message JSON-RPC d'outil reste petit, et la limite protège la
  // validation du SDK contre un corps géant (cf. GHSA-46jr-4wx8-v453).
  app.use('/mcp', mcpLimiter, express.json({ limit: '256kb' }), lazyEndpoint);
}

module.exports = { MCP_PRODUCT, mountMcp };
