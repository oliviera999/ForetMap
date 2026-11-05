'use strict';

/**
 * Serveur d'autorisation OAuth 2.1 intégré du connecteur MCP.
 *
 * Routes (montées à la racine par `lib/mcp/index.js`) :
 * - `GET /.well-known/oauth-protected-resource[/mcp]` — RFC 9728 ;
 * - `GET /.well-known/oauth-authorization-server` (+ alias `/.well-known/openid-configuration`)
 *   — RFC 8414, avec `client_id_metadata_document_supported: true` et `none` (CIMD Claude) ;
 * - `POST /oauth/register` — DCR RFC 7591 (clients publics) ;
 * - `GET|POST /oauth/authorize` — PKCE S256 obligatoire, écran de connexion (identifiants
 *   ForetMap + TOTP s'il est activé), consentement, CSRF ;
 * - `POST /oauth/token` — `authorization_code` et `refresh_token` (rotation, détection de
 *   réutilisation), corps `application/x-www-form-urlencoded` (et JSON par tolérance) ;
 * - `POST /oauth/revoke` — RFC 7009.
 *
 * Pourquoi pas `mcpAuthRouter` du SDK (`@modelcontextprotocol/sdk/server/auth`) : il gère DCR
 * et PKCE mais ni CIMD, ni la correspondance loopback `localhost` sans port exigée par Claude
 * Code, ni un écran de consentement rendu côté serveur avec notre authentification, et son
 * limiteur interne double celui du site. La structure (métadonnées, erreurs RFC 6749, PKCE)
 * s'en inspire (MIT, https://github.com/modelcontextprotocol/typescript-sdk).
 */

const crypto = require('node:crypto');
const express = require('express');
const logger = require('../../logger');
const {
  getMcpConfig,
  resolveMcpSettings,
  productionBaseUrlMissing,
  resolvePublicBaseUrl,
  SCOPES,
} = require('../config');
const store = require('./store');
const clients = require('./clients');
const { OAuthError } = clients;
const pages = require('./pages');
const signed = require('./signedState');
const { grantableScopes, mcpResourceUrl, resolveAccountAuthz } = require('./bearer');
const { authLimiter } = require('../../rateLimit');
const { loginThrottle } = require('../../loginThrottle');
const { resolveLoginAccountByIdentifier } = require('../../identity');
const { comparePasswordConstantTime } = require('../../auth/timingEqualizer');
const { getMfaEnforcement, decideLoginMfa } = require('../../auth/mfaPolicy');
const { isTotpEnabled, verifySecondFactor } = require('../../auth/totpStore');
const { logSecurityEvent } = require('../../auditLog');
const { parseCookies } = require('../../accessGate');

const SUPPORTED_SCOPES = [SCOPES.READ, SCOPES.WRITE, SCOPES.OFFLINE];
const REQUEST_TTL = 10 * 60;
const MFA_TTL = 5 * 60;
const CONSENT_TTL = 5 * 60;
const CSRF_COOKIE = 'fmcp_csrf';
const PKCE_CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;
const PKCE_VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;

/* --------------------------------------------------------------- métadonnées */

function protectedResourceMetadata(req) {
  const base = resolvePublicBaseUrl(req);
  return {
    resource: `${base}/mcp`,
    authorization_servers: [base],
    scopes_supported: [SCOPES.READ, SCOPES.WRITE],
    bearer_methods_supported: ['header'],
    resource_name: 'ForetMap — connecteur MCP',
  };
}

function authorizationServerMetadata(req) {
  const base = resolvePublicBaseUrl(req);
  const cfg = getMcpConfig();
  const md = {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    revocation_endpoint: `${base}/oauth/revoke`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    scopes_supported: SUPPORTED_SCOPES,
    client_id_metadata_document_supported: cfg.cimdEnabled,
    authorization_response_iss_parameter_supported: true,
  };
  if (cfg.dcrEnabled) md.registration_endpoint = `${base}/oauth/register`;
  return md;
}

/* ------------------------------------------------------------------- outils */

function sendOAuthError(res, err) {
  const status = err.status || 400;
  if (status === 401) res.set('WWW-Authenticate', 'Bearer');
  res.set('Cache-Control', 'no-store');
  return res.status(status).json({
    error: err.oauthError || 'invalid_request',
    ...(err.description ? { error_description: err.description } : {}),
  });
}

function htmlResponse(res, status, html, redirectUri) {
  res.set('Content-Security-Policy', pages.consentPageCsp(redirectUri));
  res.set('Cache-Control', 'no-store');
  res.set('X-Frame-Options', 'DENY');
  return res.status(status).type('html').send(html);
}

/**
 * Retour navigateur vers le client OAuth. Pas de 302 : Chrome bloque les redirections
 * HTTP après un POST de formulaire si la cible n’est pas dans `form-action` (et affiche
 * à tort l’URL du formulaire). Page 200 + meta refresh — cf. `pages.redirectPage`.
 */
function redirectWith(res, redirectUri, params) {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
  const target = u.toString();
  res.set('Cache-Control', 'no-store');
  res.set('Content-Security-Policy', pages.redirectPageCsp());
  res.set('X-Frame-Options', 'DENY');
  return res.status(200).type('html').send(pages.redirectPage(target));
}

function parseScopes(raw) {
  return [
    ...new Set(
      String(raw || '')
        .split(/\s+/)
        .filter(Boolean),
    ),
  ];
}

function bodyOrQuery(req) {
  return req.method === 'POST' ? req.body || {} : req.query || {};
}

function ensureCsrf(req, res) {
  const existing = parseCookies(req)[CSRF_COOKIE];
  if (existing && /^[A-Za-z0-9_-]{20,64}$/.test(existing)) return existing;
  const value = signed.randomToken(24);
  const secure = req.secure || resolvePublicBaseUrl(req).startsWith('https://');
  res.append(
    'Set-Cookie',
    `${CSRF_COOKIE}=${value}; Path=/oauth; HttpOnly; SameSite=Strict; Max-Age=1800${secure ? '; Secure' : ''}`,
  );
  return value;
}

function checkCsrf(req) {
  const cookie = parseCookies(req)[CSRF_COOKIE];
  const field = String(req.body?.csrf || '');
  if (!cookie || !field || cookie.length !== field.length) return false;
  return crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(field));
}

/* ------------------------------------------------------- validation demande */

/**
 * Empreinte complète d'une demande d'autorisation (relecture de sécurité, M3) : les jetons
 * d'étape MFA et consentement y sont liés, pas seulement au `client_id` — un jeton d'étape
 * obtenu pour une demande ne peut pas finir une autre demande du même client (autre
 * redirection, autre défi PKCE, autres portées, autre `state`).
 */
function requestFingerprint(request) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify([
        request.client_id,
        request.redirect_uri,
        request.code_challenge,
        [...(request.scopes || [])].sort().join(' '),
        request.state || '',
        request.resource || '',
      ]),
    )
    .digest('base64url');
}

/**
 * Valide la demande d'autorisation. Les erreurs sur `client_id` / `redirect_uri` sont
 * affichées (jamais de redirection vers une URI non vérifiée, RFC 6749 §4.1.2.1) ; les
 * autres sont renvoyées au client par redirection.
 */
async function validateAuthorizeRequest(req, params) {
  const client = await clients.resolveClient(params.client_id);
  const redirectUri = String(params.redirect_uri || '');
  if (!clients.assertRedirectForClient(client, redirectUri)) {
    throw new OAuthError('invalid_request', 'redirect_uri non autorisée pour ce client');
  }
  const redirectErr = (error, description) =>
    Object.assign(new OAuthError(error, description), {
      redirectUri,
      state: params.state,
    });
  if (params.response_type !== 'code') {
    throw redirectErr('unsupported_response_type', 'response_type=code attendu');
  }
  if (params.code_challenge_method !== 'S256') {
    throw redirectErr('invalid_request', 'PKCE S256 obligatoire');
  }
  if (!PKCE_CHALLENGE_RE.test(String(params.code_challenge || ''))) {
    throw redirectErr('invalid_request', 'code_challenge invalide');
  }
  const expectedResource = mcpResourceUrl(req);
  if (params.resource && params.resource !== expectedResource) {
    throw redirectErr('invalid_target', 'Ressource inconnue');
  }
  let scopes = parseScopes(params.scope);
  if (scopes.length === 0) scopes = [SCOPES.READ, SCOPES.WRITE];
  if (scopes.some((s) => !SUPPORTED_SCOPES.includes(s))) {
    throw redirectErr('invalid_scope', 'Portée inconnue');
  }
  if (!scopes.includes(SCOPES.READ)) scopes.unshift(SCOPES.READ);
  return {
    client,
    request: {
      client_id: client.client_id,
      redirect_uri: redirectUri,
      code_challenge: params.code_challenge,
      scopes,
      state: params.state ? String(params.state).slice(0, 512) : null,
      resource: expectedResource,
    },
  };
}

function viewContext(client, request) {
  const clientHost = clients.isCimdClientId(client.client_id)
    ? new URL(client.client_id).host
    : clients.displayHostOf(client.client_uri || request.redirect_uri);
  return {
    clientName: client.client_name,
    clientHost,
    redirectHost: clients.displayHostOf(request.redirect_uri),
    loopback: clients.isLoopbackRedirect(request.redirect_uri),
    scopes: request.scopes,
  };
}

/* -------------------------------------------------------- étapes du parcours */

async function finishWithCode(res, request, account, grantedScopes) {
  const code = await store.createAuthCode({
    clientId: request.client_id,
    userId: account.userId,
    redirectUri: request.redirect_uri,
    codeChallenge: request.code_challenge,
    scope: grantedScopes.join(' '),
    resource: request.resource,
  });
  return redirectWith(res, request.redirect_uri, {
    code,
    state: request.state,
    iss: request._issuer,
  });
}

/** Portées accordées = demandées ∩ autorisées par les permissions actuelles du compte. */
function grantScopes(requested, permissions) {
  const grantable = grantableScopes(permissions);
  grantable.add(SCOPES.OFFLINE);
  return requested.filter((s) => grantable.has(s));
}

async function renderConsent(req, res, client, request, account) {
  const scopes = grantScopes(request.scopes, account.permissions);
  const consentToken = signed.sign(
    'consent',
    { userId: account.userId, scopes, fp: requestFingerprint(request) },
    CONSENT_TTL,
  );
  return htmlResponse(
    res,
    200,
    pages.consentPage({
      ...viewContext(client, { ...request, scopes }),
      requestToken: signed.sign('request', request, REQUEST_TTL),
      csrf: ensureCsrf(req, res),
      consentToken,
      accountLabel: account.label,
    }),
    request.redirect_uri,
  );
}

async function handleLogin(req, res, client, request) {
  const ctx = {
    ...viewContext(client, request),
    requestToken: signed.sign('request', request, REQUEST_TTL),
    csrf: ensureCsrf(req, res),
    identifier: String(req.body?.identifier || '').slice(0, 255),
  };
  const fail = (message, status = 401) =>
    htmlResponse(res, status, pages.loginPage({ ...ctx, error: message }), request.redirect_uri);
  const identifier = String(req.body?.identifier || '').trim();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!identifier || !password) return fail('Identifiant et mot de passe requis', 400);

  const found = await resolveLoginAccountByIdentifier(identifier);
  const throttleKey = found ? `user:${found.id}` : identifier;
  const throttled = loginThrottle.check('login', throttleKey);
  if (throttled.blocked) {
    return fail(`Trop d’essais. Réessayez dans ${throttled.retryAfterSeconds} s.`, 429);
  }
  // bcrypt dans tous les cas : le temps de réponse ne révèle pas l'existence du compte.
  const ok = await comparePasswordConstantTime(password, found?.password_hash);
  if (!found || !found.password_hash || !ok) {
    loginThrottle.recordFailure('login', throttleKey);
    await logSecurityEvent('mcp.oauth.login', {
      req,
      actorUserType: found?.user_type,
      actorUserId: found?.id,
      result: 'failure',
      reason: 'credentials',
    });
    return fail('Identifiant ou mot de passe incorrect');
  }
  loginThrottle.clear('login', throttleKey);
  if (found.is_active != null && !Number(found.is_active)) return fail('Compte inactif', 403);
  if (Number(found.password_must_reset)) {
    return fail('Changez d’abord votre mot de passe sur le site, puis recommencez.', 403);
  }
  const authz = await resolveAccountAuthz(found.id);
  if (!authz || !authz.permissions.includes('mcp.use')) {
    await logSecurityEvent('mcp.oauth.login', {
      req,
      actorUserType: found.user_type,
      actorUserId: found.id,
      result: 'failure',
      reason: 'permission',
    });
    return fail('Ce compte n’a pas accès au connecteur MCP (permission « Connecteur MCP »).', 403);
  }
  const account = {
    userId: String(found.id),
    userType: authz.userType,
    permissions: authz.permissions,
    label: found.display_name || found.pseudo || 'compte',
  };
  // Second facteur : exigé dès que le compte l'a activé (quel que soit le réglage), et
  // enrôlement préalable exigé si le réglage l'impose à ce profil.
  const enrolled = await isTotpEnabled(found.id);
  const decision = decideLoginMfa({
    authz: authz.authz,
    enrolled,
    enforcement: await getMfaEnforcement(),
  });
  if (decision.action === 'enroll') {
    return fail(
      'La double authentification est obligatoire pour ce compte : activez-la d’abord sur le site.',
      403,
    );
  }
  if (enrolled) {
    const mfaToken = signed.sign(
      'mfa',
      { account, fp: requestFingerprint(request), clientId: request.client_id },
      MFA_TTL,
    );
    return htmlResponse(res, 200, pages.totpPage({ ...ctx, mfaToken }), request.redirect_uri);
  }
  return renderConsent(req, res, client, request, account);
}

async function handleTotp(req, res, client, request) {
  const pending = signed.verify('mfa', req.body?.mfa);
  if (!pending || pending.fp !== requestFingerprint(request)) {
    return htmlResponse(
      res,
      400,
      pages.errorPage('Étape expirée : recommencez la connexion depuis votre assistant.'),
      request.redirect_uri,
    );
  }
  const raw = String(req.body?.code || '').trim();
  const isBackup = /[a-z]/i.test(raw);
  const result = await verifySecondFactor(
    pending.account.userId,
    isBackup ? { backupCode: raw } : { code: raw },
  );
  if (!result.ok) {
    await logSecurityEvent('mcp.oauth.totp', {
      req,
      actorUserId: pending.account.userId,
      result: 'failure',
      reason: result.reason || 'invalid',
    });
    const message =
      result.reason === 'locked'
        ? `Trop d’essais. Réessayez dans ${result.retryAfterSeconds} s.`
        : 'Code incorrect';
    return htmlResponse(
      res,
      401,
      pages.totpPage({
        ...viewContext(client, request),
        requestToken: signed.sign('request', request, REQUEST_TTL),
        csrf: ensureCsrf(req, res),
        mfaToken: req.body.mfa,
        error: message,
      }),
      request.redirect_uri,
    );
  }
  return renderConsent(req, res, client, request, pending.account);
}

async function handleConsent(req, res, request) {
  const consent = signed.verify('consent', req.body?.consent);
  if (!consent || consent.fp !== requestFingerprint(request)) {
    return htmlResponse(
      res,
      400,
      pages.errorPage('Étape expirée : recommencez la connexion depuis votre assistant.'),
      request.redirect_uri,
    );
  }
  // Permissions relues au moment de l'accord : un retrait entre-temps est pris en compte.
  const authz = await resolveAccountAuthz(consent.userId);
  if (!authz || !authz.permissions.includes('mcp.use')) {
    return redirectWith(res, request.redirect_uri, {
      error: 'access_denied',
      state: request.state,
    });
  }
  const scopes = grantScopes(consent.scopes, authz.permissions);
  await logSecurityEvent('mcp.oauth.consent', {
    req,
    actorUserType: authz.userType,
    actorUserId: consent.userId,
    payload: { client: request.client_id, scopes },
  });
  return finishWithCode(res, request, { userId: consent.userId }, scopes);
}

async function authorize(req, res) {
  const cfg = getMcpConfig();
  const isPost = req.method === 'POST';
  let client;
  let request;
  try {
    if (isPost) {
      request = signed.verify('request', req.body?.request);
      if (!request) throw new OAuthError('invalid_request', 'Demande expirée ou altérée');
      client = await clients.resolveClient(request.client_id);
      if (!clients.assertRedirectForClient(client, request.redirect_uri)) {
        throw new OAuthError('invalid_request', 'redirect_uri non autorisée');
      }
    } else {
      ({ client, request } = await validateAuthorizeRequest(req, bodyOrQuery(req)));
    }
  } catch (err) {
    if (err instanceof OAuthError && err.redirectUri) {
      return redirectWith(res, err.redirectUri, {
        error: err.oauthError,
        error_description: err.description,
        state: err.state,
      });
    }
    if (err instanceof OAuthError) {
      return htmlResponse(res, 400, pages.errorPage(err.description || err.oauthError));
    }
    throw err;
  }
  request._issuer = resolvePublicBaseUrl(req);
  if (!cfg.enabled) return htmlResponse(res, 503, pages.errorPage('Connecteur désactivé'));

  if (!isPost) {
    return htmlResponse(
      res,
      200,
      pages.loginPage({
        ...viewContext(client, request),
        requestToken: signed.sign('request', request, REQUEST_TTL),
        csrf: ensureCsrf(req, res),
      }),
      request.redirect_uri,
    );
  }
  if (!checkCsrf(req)) {
    return htmlResponse(
      res,
      403,
      pages.errorPage('Session de formulaire invalide : rechargez la page depuis votre assistant.'),
      request.redirect_uri,
    );
  }
  if (req.body?.decision === 'deny') {
    return redirectWith(res, request.redirect_uri, {
      error: 'access_denied',
      error_description: 'Refusé par l’utilisateur',
      state: request.state,
    });
  }
  const step = String(req.body?.step || '');
  if (step === 'login') return handleLogin(req, res, client, request);
  if (step === 'totp') return handleTotp(req, res, client, request);
  if (step === 'consent' && req.body?.decision === 'approve') {
    return handleConsent(req, res, request);
  }
  return htmlResponse(res, 400, pages.errorPage('Étape inconnue'), request.redirect_uri);
}

/* ------------------------------------------------------------------- token */

function verifyPkce(verifier, challenge) {
  if (!PKCE_VERIFIER_RE.test(String(verifier || ''))) return false;
  const computed = crypto.createHash('sha256').update(String(verifier)).digest('base64url');
  const a = Buffer.from(computed);
  const b = Buffer.from(String(challenge));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function tokenEndpoint(req) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const grantType = String(body.grant_type || '');
  const clientId = String(body.client_id || '');
  if (!clientId) throw new OAuthError('invalid_client', 'client_id requis', 401);
  if (body.client_secret) {
    throw new OAuthError('invalid_client', 'Client public : aucun secret attendu', 401);
  }
  let client;
  try {
    // Client déjà enregistré en base (DCR, ou CIMD mémorisé lors de /authorize) : pas de
    // relecture réseau du document au point de jeton, que Claude attend 10 s au plus
    // (relecture de sécurité, M4). Le code d'autorisation, lié au client, prouve qu'il est
    // passé par /authorize.
    client = await clients.resolveRegisteredClient(clientId);
  } catch (err) {
    if (err instanceof OAuthError) throw new OAuthError('invalid_client', err.description, 401);
    throw err;
  }
  store.purgeExpiredOpportunistic().catch((err) => logger.warn({ err }, 'Purge OAuth MCP'));

  if (grantType === 'authorization_code') {
    if (!body.code || !body.code_verifier || !body.redirect_uri) {
      throw new OAuthError('invalid_request', 'code, code_verifier et redirect_uri requis');
    }
    const consumed = await store.consumeAuthCode(String(body.code));
    if (!consumed) throw new OAuthError('invalid_grant', 'Code invalide ou expiré');
    if (consumed.reused) {
      await store.revokeTokensForReplayedCode(consumed.row);
      throw new OAuthError('invalid_grant', 'Code déjà utilisé');
    }
    const row = consumed.row;
    if (row.client_id !== client.client_id) {
      throw new OAuthError('invalid_grant', 'Code émis pour un autre client');
    }
    if (row.redirect_uri !== String(body.redirect_uri)) {
      throw new OAuthError('invalid_grant', 'redirect_uri différente');
    }
    if (!verifyPkce(body.code_verifier, row.code_challenge)) {
      throw new OAuthError('invalid_grant', 'Vérification PKCE échouée');
    }
    if (body.resource && body.resource !== row.resource) {
      throw new OAuthError('invalid_target', 'Ressource différente');
    }
    const scopes = parseScopes(row.scope);
    const familyId = crypto.randomUUID();
    const pair = await store.issueTokenPair({
      familyId,
      clientId: client.client_id,
      userId: row.user_id,
      scope: scopes.filter((s) => s !== SCOPES.OFFLINE).join(' '),
      resource: row.resource,
      // Refresh toujours émis : Claude rafraîchit avant expiration et sur 401 ; `offline_access`
      // est annoncé pour que les clients stricts le demandent aussi.
      withRefresh: true,
    });
    await store.bindCodeFamily(String(body.code), familyId);
    await store.touchClient(client.client_id);
    return pair;
  }

  if (grantType === 'refresh_token') {
    if (!body.refresh_token) throw new OAuthError('invalid_request', 'refresh_token requis');
    const rotated = await store.rotateRefreshToken(String(body.refresh_token), client.client_id);
    if (!rotated.ok) {
      if (rotated.reason === 'reuse') {
        logger.warn(
          { msg: 'mcp_refresh_reuse', clientId: client.client_id },
          'Réutilisation d’un refresh MCP : famille révoquée',
        );
      }
      throw new OAuthError('invalid_grant', 'Jeton de rafraîchissement invalide');
    }
    const row = rotated.row;
    const authz = await resolveAccountAuthz(row.user_id);
    if (!authz || !authz.permissions.includes('mcp.use')) {
      await store.revokeFamily(row.family_id);
      throw new OAuthError('invalid_grant', 'Accès au connecteur retiré');
    }
    // Portée réduite si une permission a été retirée ; jamais élargie (RFC 6749 §6).
    let scopes = parseScopes(row.scope);
    const allowed = grantScopes(scopes, authz.permissions);
    if (body.scope) {
      const asked = parseScopes(body.scope).filter((s) => s !== SCOPES.OFFLINE);
      if (asked.some((s) => !scopes.includes(s))) {
        throw new OAuthError('invalid_scope', 'Portée plus large que l’accord initial');
      }
      scopes = asked;
    }
    scopes = scopes.filter((s) => allowed.includes(s));
    return store.issueTokenPair({
      familyId: row.family_id,
      clientId: client.client_id,
      userId: row.user_id,
      scope: scopes.join(' '),
      resource: row.resource,
      withRefresh: true,
    });
  }

  throw new OAuthError('unsupported_grant_type', 'grant_type non pris en charge');
}

/* ------------------------------------------------------------------ routeur */

/**
 * @param {{ registerLimiter?: Function, tokenLimiter?: Function }} [opts] limiteurs de
 *   `/oauth/register` et de `/oauth/token` / `/oauth/revoke` (les appels de Claude partent des
 *   adresses d'Anthropic, partagées : pas le limiteur strict de connexion, clé par client).
 */
function createOAuthRouter({
  registerLimiter = (req, res, next) => next(),
  tokenLimiter = (req, res, next) => next(),
} = {}) {
  const router = express.Router();
  const form = express.urlencoded({ extended: false, limit: '32kb' });
  const json = express.json({ limit: '32kb' });
  const noStore = (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    next();
  };
  // CORS ouvert sur les seules métadonnées et le point de jeton : MCP Inspector et les
  // clients navigateur les lisent depuis une autre origine. Aucune authentification par
  // cookie n'y est acceptée, l'ouverture ne donne donc rien de plus qu'un appel serveur.
  const openCors = (req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, MCP-Protocol-Version');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  };
  const disabled = async (req, res, next) => {
    if (!getMcpConfig().enabled) return res.status(404).json({ error: 'not_found' });
    // Instantané des réglages `mcp.*` (portée d'écriture accordée au consentement…).
    await resolveMcpSettings();
    if (productionBaseUrlMissing()) {
      return res.status(503).json({
        error: 'temporarily_unavailable',
        error_description: 'MCP_PUBLIC_BASE_URL absent',
      });
    }
    return next();
  };

  const prm = (req, res) => res.json(protectedResourceMetadata(req));
  router.all('/.well-known/oauth-protected-resource', disabled, openCors);
  router.get('/.well-known/oauth-protected-resource', prm);
  router.all('/.well-known/oauth-protected-resource/mcp', disabled, openCors);
  router.get('/.well-known/oauth-protected-resource/mcp', prm);
  const asm = (req, res) => res.json(authorizationServerMetadata(req));
  for (const p of [
    '/.well-known/oauth-authorization-server',
    '/.well-known/openid-configuration',
  ]) {
    router.all(p, disabled, openCors);
    router.get(p, asm);
  }

  const wrap = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res)).catch((err) => {
      if (err instanceof OAuthError) return sendOAuthError(res, err);
      return next(err);
    });

  router.all('/oauth/register', disabled, openCors);
  router.post(
    '/oauth/register',
    registerLimiter,
    noStore,
    json,
    wrap(async (req, res) => {
      const out = await clients.registerDynamicClient(req.body);
      res.status(201).json(out);
    }),
  );

  router.get('/oauth/authorize', disabled, authLimiter, wrap(authorize));
  router.post('/oauth/authorize', disabled, authLimiter, form, wrap(authorize));

  router.all('/oauth/token', disabled, openCors);
  router.post(
    '/oauth/token',
    noStore,
    form,
    json,
    tokenLimiter,
    wrap(async (req, res) => {
      res.json(await tokenEndpoint(req));
    }),
  );

  router.all('/oauth/revoke', disabled, openCors);
  router.post(
    '/oauth/revoke',
    noStore,
    form,
    json,
    tokenLimiter,
    wrap(async (req, res) => {
      const token = String(req.body?.token || '');
      if (!token) throw new OAuthError('invalid_request', 'token requis');
      await store.revokeToken(token, req.body?.client_id ? String(req.body.client_id) : null);
      // RFC 7009 §2.2 : 200 même si le jeton est inconnu.
      res.status(200).json({});
    }),
  );

  router.use(['/oauth', '/.well-known'], (err, req, res, next) => {
    if (err?.type === 'entity.parse.failed') {
      return sendOAuthError(res, new OAuthError('invalid_request', 'Corps illisible'));
    }
    return next(err);
  });

  return router;
}

module.exports = {
  authorizationServerMetadata,
  createOAuthRouter,
  protectedResourceMetadata,
  verifyPkce,
};
