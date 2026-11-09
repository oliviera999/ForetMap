'use strict';

/**
 * Pont API interne du connecteur Claude : appelle **en processus** n'importe quelle route
 * `/api/*` ForêtMap, en tant que l'utilisateur connecté au connecteur, sans passer par le
 * réseau. Tout ce que l'application sait faire devient faisable depuis Claude, avec **sa**
 * logique métier (recalculs, notifications, journal d'audit, temps réel) : le connecteur ne
 * réimplémente aucune règle.
 *
 * Injection : `light-my-request` (BSD-3-Clause, équipe Fastify —
 * https://github.com/fastify/light-my-request), qui fabrique un couple requête / réponse Node
 * et le passe à l'application Express comme le ferait le serveur HTTP. Multer, flux et en-têtes
 * se comportent comme en production.
 *
 * Identité : un JWT applicatif **éphémère** (120 s) est signé pour chaque appel, avec la même
 * charge qu'une connexion (rôle effectif, époque de jeton, droits), `via: 'mcp'` et le marqueur
 * de second facteur si le compte a la double authentification (la session OAuth l'a alors
 * exigée). Il n'est ni renvoyé ni journalisé. `rejectMcpTokensOnApi` reste en place : c'est un
 * JWT applicatif, pas un `fmcp_…`.
 *
 * Marquage : la requête porte un `Symbol` posé par l'injecteur (`callContext.js`), impossible à
 * produire par un en-tête HTTP. Il ajoute `via: 'mcp'` à l'audit et aux journaux, et lève le
 * limiteur général et ceux d'authentification (le limiteur `/mcp` reste la garde).
 */

const crypto = require('node:crypto');
const { McpToolError } = require('./registry');
const { markMcpInternalRequest, currentMcpContext } = require('./callContext');

const BRIDGE_TOKEN_TTL_SECONDS = 120;
const MAX_FILES_BYTES = 15 * 1024 * 1024;
const MAX_TEXT_CHARS = 200_000;

/** En-têtes de réponse renvoyés à Claude (liste blanche). */
const RESPONSE_HEADER_ALLOWLIST = Object.freeze([
  'content-type',
  'content-length',
  'location',
  'content-disposition',
  'x-request-id',
  'retry-after',
]);

let bridgeApp = null;

/** Injecté par `mountMcp(app)` : aucune dépendance circulaire avec `server.js`. */
function setBridgeApp(app) {
  bridgeApp = app;
}

function getBridgeApp() {
  return bridgeApp;
}

/** Préfixe de l'API Gnomes & Licornes (seule ouverture : le pont G&L des outils de domaine). */
const GL_API_RE = /^\/api\/gl\/[^/]/i;

/** Chemins jamais accessibles par le pont, quel que soit le réglage. */
const ALWAYS_DENIED = Object.freeze([
  { re: /^\/api\/gl(?:\/|$)/i, why: 'API Gnomes & Licornes hors périmètre du connecteur' },
  { re: /^\/api\/auth\/login(?:\/|$)/i, why: 'connexion interactive' },
  { re: /^\/api\/auth\/logout(?:\/|$)/i, why: 'déconnexion interactive' },
]);

/**
 * Routes d'authentification sensibles : elles émettent un jeton ou un secret (prise de
 * contrôle, renouvellement, enrôlement TOTP, réinitialisation) ou ouvrent une session tierce.
 * Refusées sauf `mcp.api_bridge_sensitive_auth=true` ; même alors, la sortie reste nettoyée
 * des jetons et secrets.
 */
const SENSITIVE_PATHS = Object.freeze([
  /^\/api\/auth\/(?:register|google|forgot-password|reset-password|teacher\/|admin\/impersonate)/i,
  /^\/api\/auth\/me\/password(?:\/|$)/i,
  /^\/api\/auth\/totp\/(?:verify|enroll|backup-codes)/i,
  /^\/api\/lti(?:\/|$)/i,
  /^\/api\/(?:plan|staff-plan|enov)\/(?:access|logout)(?:\/|$)/i,
]);

/**
 * Normalise et contrôle un chemin. Lève `McpToolError` si refusé.
 *
 * `glAllowed` : réservé aux outils de domaine Gnomes & Licornes (`lib/mcp/glBridge.js`), qui
 * appellent `/api/gl/*` avec un jeton de **staff G&L** signé pour la personne connectée ; le
 * chemin doit alors être sous `/api/gl/`. `foretmap_api` ne passe jamais ce drapeau : pour lui,
 * l'API G&L reste refusée (isolement des produits).
 * @param {string} rawPath
 * @param {{ sensitiveAllowed?: boolean, glAllowed?: boolean }} [opts]
 * @returns {string} chemin sans requête
 */
function assertBridgePath(rawPath, { sensitiveAllowed = false, glAllowed = false } = {}) {
  const raw = String(rawPath || '').trim();
  if (!raw.startsWith('/api/')) {
    throw new McpToolError(
      'Le chemin doit commencer par /api/ (ex. /api/tasks)',
      'MCP_BRIDGE_PATH',
    );
  }
  if (/[\s#\\]/.test(raw) || raw.includes('..') || /%2e%2e|%2f|%5c/i.test(raw)) {
    throw new McpToolError('Chemin invalide', 'MCP_BRIDGE_PATH');
  }
  const pathOnly = raw.split('?')[0].replace(/\/{2,}/g, '/');
  if (glAllowed) {
    if (!GL_API_RE.test(pathOnly)) {
      throw new McpToolError('Le pont G&L ne sert que /api/gl/…', 'MCP_BRIDGE_PATH');
    }
    return pathOnly;
  }
  for (const rule of ALWAYS_DENIED) {
    if (rule.re.test(pathOnly)) {
      throw new McpToolError(`Chemin refusé par le pont : ${rule.why}`, 'MCP_BRIDGE_DENIED');
    }
  }
  if (!sensitiveAllowed && SENSITIVE_PATHS.some((re) => re.test(pathOnly))) {
    throw new McpToolError(
      'Route d’authentification sensible refusée par le pont (réglage mcp.api_bridge_sensitive_auth)',
      'MCP_BRIDGE_SENSITIVE',
    );
  }
  return pathOnly;
}

/** Hôte public ForêtMap pour l'en-tête `Host` (résolution du produit `foret`). */
function bridgeHost(ctx) {
  const base = String(ctx?.baseUrl || '').trim();
  try {
    if (base) return new URL(base).host;
  } catch (_) {
    // repli ci-dessous
  }
  return 'localhost';
}

/**
 * JWT applicatif éphémère pour l'utilisateur MCP (même charge qu'une connexion).
 * @param {{ userId: string, userType?: string }} user
 */
async function signBridgeToken(user) {
  const { buildSessionPayload } = require('../auth/sessionPayload');
  const { markSessionMfa } = require('../auth/mfaClaims');
  const { isTotpEnabled } = require('../auth/totpStore');
  const { signJwtToken } = require('../auth/jwtPipeline');
  const { JWT_SECRET } = require('../../middleware/requireTeacher');
  if (!JWT_SECRET) throw new McpToolError('JWT_SECRET absent : pont indisponible', 'MCP_BRIDGE');
  const userType = user?.userType === 'student' ? 'student' : 'teacher';
  const session = await buildSessionPayload(userType, String(user.userId));
  if (!session) {
    throw new McpToolError('Compte sans profil applicatif : pont indisponible', 'MCP_FORBIDDEN');
  }
  let payload = { ...session.tokenPayload, via: 'mcp' };
  // Second facteur : exigé par le consentement OAuth dès que le compte l'a activé.
  if (await isTotpEnabled(String(user.userId))) payload = markSessionMfa(payload, 'totp');
  payload.sessionStartedAt = Math.floor(Date.now() / 1000);
  return signJwtToken(payload, JWT_SECRET, { expiresIn: BRIDGE_TOKEN_TTL_SECONDS });
}

/** Corps multipart (`files` en base64 + champs texte de `body`). */
function buildMultipart(body, files) {
  const boundary = `----foretmapMcp${crypto.randomBytes(12).toString('hex')}`;
  const chunks = [];
  const push = (s) => chunks.push(Buffer.from(s, 'utf8'));
  for (const [k, v] of Object.entries(body || {})) {
    if (v === undefined || v === null) continue;
    const value = typeof v === 'object' ? JSON.stringify(v) : String(v);
    push(`--${boundary}\r\nContent-Disposition: form-data; name="${k.replace(/"/g, '')}"\r\n\r\n`);
    push(`${value}\r\n`);
  }
  let total = 0;
  for (const f of files) {
    const buf = Buffer.from(String(f.content_base64 || ''), 'base64');
    total += buf.length;
    if (total > MAX_FILES_BYTES) {
      throw new McpToolError('Fichiers trop volumineux (15 Mo au total)', 'MCP_BRIDGE_FILES');
    }
    const field = String(f.field || 'file').replace(/["\r\n]/g, '');
    const filename = String(f.filename || 'fichier').replace(/["\r\n]/g, '');
    const mime = String(f.mime || 'application/octet-stream').replace(/[\r\n]/g, '');
    push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\n` +
        `Content-Type: ${mime}\r\n\r\n`,
    );
    chunks.push(buf);
    push('\r\n');
  }
  push(`--${boundary}--\r\n`);
  return {
    payload: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/**
 * Express 5 remplace le prototype de `req` / `res` par `app.request` / `app.response`
 * (`Object.setPrototypeOf`) : les méthodes que `light-my-request` définit sur ses propres
 * prototypes (`write`, `end`, `writeHead`, `destroy`…) seraient perdues — réponse vide, flux
 * de requête illisible. On les fige en propriétés propres avant de passer la main à Express.
 */
function pinPrototypeMethods(obj) {
  const proto = Object.getPrototypeOf(obj);
  if (!proto) return;
  for (const name of Object.getOwnPropertyNames(proto)) {
    if (name === 'constructor' || Object.prototype.hasOwnProperty.call(obj, name)) continue;
    const desc = Object.getOwnPropertyDescriptor(proto, name);
    if (desc && typeof desc.value === 'function') {
      Object.defineProperty(obj, name, { value: desc.value, writable: true, configurable: true });
    }
  }
}

function pickHeaders(headers) {
  const out = {};
  for (const name of RESPONSE_HEADER_ALLOWLIST) {
    if (headers[name] !== undefined) out[name] = headers[name];
  }
  return out;
}

/**
 * Appel brut de l'API. Ne lève que sur un refus de pont ; une réponse 4xx/5xx est renvoyée.
 * @param {object} ctx contexte d'outil (`user`, `baseUrl`, `cfg`, `clientId`…)
 * @param {{ method: string, path: string, query?: object, body?: unknown,
 *   files?: Array<{ field: string, filename: string, mime: string, content_base64: string }>,
 *   tool?: string }} request
 * @returns {Promise<{ status: number, headers: object, json?: unknown, text?: string,
 *   location?: string, request_id: string|null }>}
 */
async function bridgeRequest(ctx, { method, path, query, body, files, tool, gl }) {
  const app = getBridgeApp();
  if (!app) throw new McpToolError('Pont API non initialisé', 'MCP_BRIDGE');
  const cfg = ctx?.cfg || require('./config').getMcpConfig();
  const verb = String(method || 'GET').toUpperCase();
  if (!cfg.apiBridgeEnabled) {
    throw new McpToolError('Pont API désactivé (réglage mcp.api_bridge_enabled)', 'MCP_BRIDGE_OFF');
  }
  if (!cfg.apiBridgeMethods.includes(verb)) {
    throw new McpToolError(
      `Méthode ${verb} non admise par le pont (réglage mcp.api_bridge_methods)`,
      'MCP_BRIDGE_METHOD',
    );
  }
  // `gl` : jeton de staff G&L déjà signé par `lib/mcp/glBridge.js` (seule voie vers `/api/gl/*`).
  const glToken = gl && typeof gl === 'object' ? String(gl.token || '') : '';
  const pathOnly = assertBridgePath(path, {
    sensitiveAllowed: cfg.apiBridgeSensitiveAuth,
    glAllowed: !!glToken,
  });
  if (!ctx?.user?.userId) throw new McpToolError('Utilisateur MCP inconnu', 'MCP_FORBIDDEN');

  const token = glToken || (await signBridgeToken(ctx.user));
  const headers = {
    host: bridgeHost(ctx),
    authorization: `Bearer ${token}`,
    accept: 'application/json',
    'x-forwarded-proto': 'https',
    'user-agent': 'foretmap-mcp-bridge',
    // Produit résolu par en-tête (lib/productResolver.js) : les routes G&L servent le produit `gl`.
    ...(glToken ? { 'x-foretmap-product': 'gl' } : {}),
  };
  const queryString = String(path).includes('?') ? String(path).split('?')[1] : '';
  const searchParams = new URLSearchParams(queryString);
  for (const [k, v] of Object.entries(query || {})) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) for (const item of v) searchParams.append(k, String(item));
    else searchParams.set(k, String(v));
  }
  const qs = searchParams.toString();
  const url = qs ? `${pathOnly}?${qs}` : pathOnly;

  let payload;
  if (Array.isArray(files) && files.length > 0) {
    const mp = buildMultipart(body && typeof body === 'object' ? body : {}, files);
    payload = mp.payload;
    headers['content-type'] = mp.contentType;
  } else if (body !== undefined && verb !== 'GET') {
    payload = JSON.stringify(body);
    headers['content-type'] = 'application/json';
  }

  const callCtx = currentMcpContext() || {};
  const mark = {
    tool: tool || callCtx.tool || 'foretmap_api',
    clientId: ctx.clientId || callCtx.clientId || null,
    userId: String(ctx.user.userId),
    requestId: ctx.requestId || null,
  };
  const inject = require('light-my-request');
  const dispatch = (req, res) => {
    markMcpInternalRequest(req, mark);
    pinPrototypeMethods(req);
    pinPrototypeMethods(res);
    // Comme un `IncomingMessage` : `complete` passe à vrai une fois le corps lu, pour que les
    // parseurs de corps suivants (l'application en enchaîne plusieurs) le sachent déjà lu
    // (`on-finished`) au lieu de relire un flux terminé.
    if (req.socket && req.socket.readable === undefined) req.socket.readable = true;
    req.complete = false;
    req.once('end', () => {
      req.complete = true;
    });
    app(req, res);
  };
  const res = await inject(dispatch, { method: verb, url, headers, payload });
  const outHeaders = pickHeaders(res.headers || {});
  const ctype = String(res.headers['content-type'] || '');
  const out = {
    status: res.statusCode,
    headers: outHeaders,
    request_id: res.headers['x-request-id'] || null,
  };
  if (res.headers.location) out.location = res.headers.location;
  if (/json/i.test(ctype)) {
    try {
      out.json = res.json();
    } catch (_) {
      out.text = String(res.body || '').slice(0, MAX_TEXT_CHARS);
    }
  } else if (/^(?:text\/|application\/(?:xml|javascript|csv))/i.test(ctype) || !ctype) {
    const text = String(res.body || '');
    out.text = text.slice(0, MAX_TEXT_CHARS);
    if (text.length > MAX_TEXT_CHARS) out.text_truncated = true;
  } else {
    out.binary = { content_type: ctype, bytes: res.rawPayload ? res.rawPayload.length : 0 };
  }
  return out;
}

/** Journal d'un appel du pont (écritures ; lectures quand le bypass est actif). */
async function auditBridgeCall(ctx, { method, path, status, tool }) {
  const verb = String(method || 'GET').toUpperCase();
  const cfg = ctx?.cfg || require('./config').getMcpConfig();
  if (verb === 'GET' && !cfg.privacyBypassActive) return;
  const { logAudit } = require('../auditLog');
  // `target_id` est un VARCHAR(64) (audit_log comme security_events) : au-delà, l'écriture
  // échouait et la ligne était perdue. Le chemin complet reste dans la charge.
  const fullPath = String(path).split('?')[0];
  const targetId = fullPath.length > 64 ? `…${fullPath.slice(-63)}` : fullPath;
  await logAudit('mcp_api_call', 'api', targetId, `${verb}`, {
    actorUserType: ctx.user?.userType || 'teacher',
    actorUserId: String(ctx.user?.userId || ''),
    result: status >= 400 ? 'failure' : 'success',
    payload: {
      method: verb,
      path: String(path).split('?')[0],
      status,
      tool: tool || 'foretmap_api',
      privacy_bypass: !!cfg.privacyBypassActive,
    },
  });
}

/**
 * Appel métier des outils de domaine : renvoie le JSON de la réponse, ou lève une
 * `McpToolError` portant le message d'erreur de l'API pour un 4xx/5xx.
 */
async function callApi(ctx, method, path, body, files, opts = {}) {
  const res = await bridgeRequest(ctx, {
    method,
    path,
    body,
    files,
    query: opts.query,
    tool: opts.tool,
    gl: opts.gl,
  });
  await auditBridgeCall(ctx, { method, path, status: res.status, tool: opts.tool });
  if (res.status >= 400) {
    const msg =
      (res.json && typeof res.json === 'object' && (res.json.error || res.json.message)) ||
      res.text ||
      `Erreur ${res.status}`;
    const err = new McpToolError(
      `${String(msg).slice(0, 500)} (HTTP ${res.status})`,
      'MCP_API_ERROR',
    );
    err.status = res.status;
    err.body = res.json;
    throw err;
  }
  return res.json !== undefined ? res.json : res.text !== undefined ? res.text : res.binary;
}

module.exports = {
  ALWAYS_DENIED,
  GL_API_RE,
  BRIDGE_TOKEN_TTL_SECONDS,
  MAX_FILES_BYTES,
  SENSITIVE_PATHS,
  assertBridgePath,
  auditBridgeCall,
  bridgeRequest,
  callApi,
  getBridgeApp,
  setBridgeApp,
  signBridgeToken,
};
