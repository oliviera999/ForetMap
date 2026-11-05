'use strict';

/**
 * Enregistrement et résolution des clients OAuth du connecteur MCP.
 *
 * Deux voies, toutes deux pour des **clients publics** (PKCE seul, aucun secret émis) :
 *
 * 1. **CIMD** (Client ID Metadata Document, draft-ietf-oauth-client-id-metadata-document,
 *    adopté par la spec MCP 2025-11-25) : `client_id` est l'URL https d'un document JSON. Le
 *    document est lu avec un délai court, une taille plafonnée, sans redirection, vers une
 *    adresse publique seulement (`lib/remoteMediaSsrf.js`), mis en cache, et doit déclarer
 *    `client_id` = son URL. Voie préférée de claude.ai, ChatGPT et certains clients MCP.
 * 2. **DCR** (RFC 7591) : `POST /oauth/register` en JSON ; on crée un identifiant opaque.
 *
 * Les `redirect_uri` doivent appartenir à la liste autorisée
 * (`MCP_OAUTH_ALLOWED_REDIRECTS`, défaut multi-clients : Claude, Cursor, ChatGPT, Gemini CLI).
 * Comparaison loopback : port ignoré (RFC 8252 §7.3). Entrées finissant par `/*` = préfixe
 * https (ex. ChatGPT `…/connector/oauth/{id}`). DCR et CIMD **filtrent** les URIs non
 * autorisées plutôt que de rejeter tout l'enregistrement (Cursor envoie souvent un mix).
 *
 * Inspiration : `redirectUriMatches` de `@modelcontextprotocol/sdk`
 * (`server/auth/handlers/authorize.ts`, MIT) — réécrit ici pour accepter aussi la
 * correspondance localhost ↔ localhost sans port, et pour la liste blanche serveur.
 */

const crypto = require('node:crypto');
const { getMcpConfig } = require('../config');
const store = require('./store');
const logger = require('../../logger');

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const CIMD_MAX_BYTES = 16 * 1024;
const CIMD_TIMEOUT_MS = 3000;
const CIMD_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_REDIRECT_URIS = 10;

class OAuthError extends Error {
  constructor(error, description, status = 400) {
    super(description || error);
    this.oauthError = error;
    this.description = description || null;
    this.status = status;
  }
}

function parseUrl(value) {
  try {
    return new URL(String(value));
  } catch {
    return null;
  }
}

/**
 * Correspondance d'une redirect_uri demandée avec une entrée allowlist / enregistrée.
 * - égalité exacte ;
 * - loopback http : port ignoré (RFC 8252) ;
 * - motif préfixe https `…/*` (chemin sous le préfixe, même origine, pas de `..`).
 */
function redirectUriMatches(requested, registered) {
  if (requested === registered) return true;
  const req = parseUrl(requested);
  if (!req) return false;

  const pattern = String(registered || '');
  if (pattern.endsWith('/*')) {
    if (req.protocol !== 'https:') return false;
    if (req.hash || req.username || req.password) return false;
    if (req.pathname.includes('..')) return false;
    const base = pattern.slice(0, -1); // garde le `/` final du préfixe
    const baseUrl = parseUrl(base);
    if (!baseUrl || baseUrl.protocol !== 'https:') return false;
    if (req.origin !== baseUrl.origin) return false;
    const prefixPath = baseUrl.pathname.endsWith('/') ? baseUrl.pathname : `${baseUrl.pathname}/`;
    // Exige au moins un segment après le préfixe (ex. /connector/oauth/{id}).
    return req.pathname.startsWith(prefixPath) && req.pathname.length > prefixPath.length;
  }

  const reg = parseUrl(registered);
  if (!reg) return false;
  if (!LOOPBACK_HOSTS.has(req.hostname) || !LOOPBACK_HOSTS.has(reg.hostname)) return false;
  // RFC 8252 : seul le port est relâché ; schéma, hôte, chemin et requête restent exacts.
  return (
    req.protocol === 'http:' &&
    req.protocol === reg.protocol &&
    req.hostname === reg.hostname &&
    req.pathname === reg.pathname &&
    req.search === reg.search &&
    !req.hash
  );
}

/** Vrai si l'URI figure dans la liste autorisée par le serveur. */
function isRedirectAllowedByServer(uri) {
  const allowed = getMcpConfig().allowedRedirects;
  return allowed.some((a) => redirectUriMatches(uri, a));
}

/**
 * Filtre une liste de redirect_uris : forme valide + allowlist serveur.
 * @returns {string[]} URIs utilisables (peut être vide)
 */
function filterAllowedRedirectUris(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const uri of list) {
    if (typeof uri !== 'string' || uri.length === 0 || uri.length > 1024) continue;
    if (validateRedirectUriShape(uri)) continue;
    if (!isRedirectAllowedByServer(uri)) continue;
    out.push(uri);
  }
  return out;
}

function isLoopbackRedirect(uri) {
  const u = parseUrl(uri);
  return !!u && LOOPBACK_HOSTS.has(u.hostname);
}

/**
 * Contrôle syntaxique strict d'une redirect_uri (RFC 6749 §3.1.2, OAuth 2.1).
 * Exception contrôlée : schéma `cursor://` (callback MCP de l'IDE Cursor) — l'URI
 * doit quand même figurer dans l'allowlist serveur.
 */
function validateRedirectUriShape(uri) {
  const u = parseUrl(uri);
  if (!u) return 'redirect_uri invalide';
  if (u.hash) return 'redirect_uri ne doit pas contenir de fragment';
  if (u.username || u.password) return 'redirect_uri ne doit pas contenir d’identifiants';
  if (u.protocol === 'https:') return null;
  if (u.protocol === 'http:' && LOOPBACK_HOSTS.has(u.hostname)) return null;
  if (u.protocol === 'cursor:' && u.hostname) return null;
  return 'redirect_uri doit être en https (ou http sur une adresse de bouclage)';
}

/**
 * Valide et filtre les redirect_uris (DCR). Comme CIMD : on garde seulement les URIs
 * serveur-autorisées ; erreur si aucune ne reste.
 */
function validateRedirectUris(list) {
  if (!Array.isArray(list) || list.length === 0) {
    throw new OAuthError('invalid_redirect_uri', 'redirect_uris requis');
  }
  if (list.length > MAX_REDIRECT_URIS) {
    throw new OAuthError('invalid_redirect_uri', 'Trop de redirect_uris');
  }
  const usable = filterAllowedRedirectUris(list);
  if (usable.length === 0) {
    throw new OAuthError(
      'invalid_redirect_uri',
      'Aucune redirect_uri n’est autorisée par le serveur',
    );
  }
  return usable;
}

/* --------------------------------------------------------------------- DCR */

/**
 * Enregistrement dynamique (RFC 7591). Seuls les clients publics sont admis
 * (`token_endpoint_auth_method` absent ou `none`).
 */
async function registerDynamicClient(body) {
  const cfg = getMcpConfig();
  if (!cfg.dcrEnabled) {
    throw new OAuthError('invalid_client_metadata', 'Enregistrement dynamique désactivé');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new OAuthError('invalid_client_metadata', 'Corps JSON attendu');
  }
  const method = body.token_endpoint_auth_method ?? 'none';
  if (method !== 'none') {
    throw new OAuthError(
      'invalid_client_metadata',
      'Seuls les clients publics (token_endpoint_auth_method=none) sont acceptés',
    );
  }
  const grantTypes = body.grant_types ?? ['authorization_code', 'refresh_token'];
  if (
    !Array.isArray(grantTypes) ||
    grantTypes.some((g) => !['authorization_code', 'refresh_token'].includes(g))
  ) {
    throw new OAuthError('invalid_client_metadata', 'grant_types non pris en charge');
  }
  const responseTypes = body.response_types ?? ['code'];
  if (!Array.isArray(responseTypes) || responseTypes.some((r) => r !== 'code')) {
    throw new OAuthError('invalid_client_metadata', 'response_types non pris en charge');
  }
  const redirectUris = validateRedirectUris(body.redirect_uris);
  const clientName =
    typeof body.client_name === 'string' ? body.client_name.trim().slice(0, 255) : null;
  const clientUri = typeof body.client_uri === 'string' ? body.client_uri.slice(0, 512) : null;
  const clientId = `fmcp_dcr_${crypto.randomBytes(18).toString('base64url')}`;
  const saved = await store.saveClient({
    client_id: clientId,
    kind: 'dcr',
    client_name: clientName,
    client_uri: clientUri,
    redirect_uris: redirectUris,
    scope: typeof body.scope === 'string' ? body.scope : null,
  });
  return {
    client_id: saved.client_id,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: saved.client_name || undefined,
    client_uri: saved.client_uri || undefined,
    redirect_uris: saved.redirect_uris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  };
}

/* -------------------------------------------------------------------- CIMD */

/** URL https sans fragment, avec chemin : forme exigée d'un client_id CIMD. */
function isCimdClientId(clientId) {
  const u = parseUrl(clientId);
  return !!u && u.protocol === 'https:' && !u.hash && u.pathname && u.pathname !== '/';
}

/** Lecteur réseau injectable (tests). Renvoie `{ status, body: Buffer, contentType }`. */
let cimdFetcher = async function defaultCimdFetcher(url) {
  const { httpsGetPinned } = require('../../remoteMediaSsrf');
  const res = await httpsGetPinned(url, {
    timeoutMs: CIMD_TIMEOUT_MS,
    maxBytes: CIMD_MAX_BYTES,
    headers: { Accept: 'application/json', 'User-Agent': 'ForetMap-MCP/1.0 (cimd)' },
  });
  return { status: res.status, body: res.body, contentType: res.headers.get('content-type') };
};

const cimdCache = new Map();

function setCimdFetcherForTests(fn) {
  cimdFetcher = fn;
  cimdCache.clear();
}

/**
 * Lit, valide et mémorise un document CIMD.
 * @returns {Promise<object>} client normalisé
 */
async function resolveCimdClient(clientId) {
  const cfg = getMcpConfig();
  if (!cfg.cimdEnabled) throw new OAuthError('invalid_client', 'CIMD désactivé');
  const cached = cimdCache.get(clientId);
  if (cached && cached.expiresAt > Date.now()) return cached.client;

  let res;
  try {
    res = await cimdFetcher(clientId);
  } catch (err) {
    logger.warn({ err: err?.message, msg: 'mcp_cimd_fetch_failed' }, 'Document CIMD illisible');
    throw new OAuthError('invalid_client', 'Document de métadonnées client injoignable');
  }
  if (!res || res.status !== 200) {
    throw new OAuthError('invalid_client', 'Document de métadonnées client introuvable');
  }
  if (res.body && res.body.length > CIMD_MAX_BYTES) {
    throw new OAuthError('invalid_client', 'Document de métadonnées client trop volumineux');
  }
  let doc;
  try {
    doc = JSON.parse(Buffer.isBuffer(res.body) ? res.body.toString('utf8') : String(res.body));
  } catch {
    throw new OAuthError('invalid_client', 'Document de métadonnées client invalide');
  }
  if (!doc || typeof doc !== 'object' || doc.client_id !== clientId) {
    throw new OAuthError('invalid_client', 'client_id du document différent de son URL');
  }
  const method = doc.token_endpoint_auth_method ?? 'none';
  if (method !== 'none') {
    throw new OAuthError('invalid_client', 'Client CIMD confidentiel non pris en charge');
  }
  const redirects = Array.isArray(doc.redirect_uris) ? doc.redirect_uris.map(String) : [];
  const usable = filterAllowedRedirectUris(redirects);
  if (usable.length === 0) {
    throw new OAuthError('invalid_client', 'Aucune redirect_uri du document n’est autorisée');
  }
  const client = await store.saveClient({
    client_id: clientId,
    kind: 'cimd',
    client_name: typeof doc.client_name === 'string' ? doc.client_name : null,
    client_uri: typeof doc.client_uri === 'string' ? doc.client_uri : null,
    redirect_uris: usable,
    scope: typeof doc.scope === 'string' ? doc.scope : null,
  });
  cimdCache.set(clientId, { client, expiresAt: Date.now() + CIMD_CACHE_TTL_MS });
  if (cimdCache.size > 200) cimdCache.delete(cimdCache.keys().next().value);
  return client;
}

/** Client par `client_id` : CIMD (URL https) ou DCR (identifiant enregistré). */
async function resolveClient(clientId) {
  const id = String(clientId || '').trim();
  if (!id || id.length > 512) throw new OAuthError('invalid_client', 'client_id requis');
  if (isCimdClientId(id)) return resolveCimdClient(id);
  const client = await store.getClient(id);
  if (!client || client.kind !== 'dcr') throw new OAuthError('invalid_client', 'Client inconnu');
  return client;
}

/**
 * Client **déjà enregistré** en base (point de jeton) : DCR, ou CIMD mémorisé lors de
 * `/oauth/authorize`. Repli sur la lecture du document CIMD seulement s'il est inconnu.
 */
async function resolveRegisteredClient(clientId) {
  const id = String(clientId || '').trim();
  if (!id || id.length > 512) throw new OAuthError('invalid_client', 'client_id requis');
  const stored = await store.getClient(id);
  if (stored) {
    if (stored.kind === 'cimd' && !getMcpConfig().cimdEnabled) {
      throw new OAuthError('invalid_client', 'CIMD désactivé');
    }
    return stored;
  }
  return resolveClient(id);
}

/** redirect_uri admise pour ce client (enregistrée ET autorisée par le serveur). */
function assertRedirectForClient(client, redirectUri) {
  if (!redirectUri || validateRedirectUriShape(redirectUri)) return false;
  if (!isRedirectAllowedByServer(redirectUri)) return false;
  return client.redirect_uris.some((reg) => redirectUriMatches(redirectUri, reg));
}

/** Hôte affiché à l'écran de consentement (celui de la redirection, pas le nom déclaré). */
function displayHostOf(uri) {
  const u = parseUrl(uri);
  return u ? u.host : String(uri || '');
}

module.exports = {
  OAuthError,
  assertRedirectForClient,
  displayHostOf,
  filterAllowedRedirectUris,
  isCimdClientId,
  isLoopbackRedirect,
  isRedirectAllowedByServer,
  redirectUriMatches,
  registerDynamicClient,
  resolveClient,
  resolveRegisteredClient,
  setCimdFetcherForTests,
  validateRedirectUriShape,
};
