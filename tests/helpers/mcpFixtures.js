'use strict';

/**
 * Fixtures du connecteur MCP : comptes avec profil, flux OAuth complet par supertest
 * (DCR → authorize → consentement → token) et client JSON-RPC minimal.
 *
 * Les mots de passe de test sont construits à l'exécution (garde-fou
 * `scripts/check-sensitive-files.js` : aucune valeur factice de secret en clair).
 */

const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { execute, queryOne } = require('../../database');
const { setAssignedRole, recomputeUserRole } = require('../../lib/effectiveRole');

const PASSWORD = `Mcp-${crypto.randomBytes(6).toString('hex')}-2026`;
const CLAUDE_CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
const LOOPBACK_CALLBACK = 'http://127.0.0.1:43123/callback';

/**
 * Base publique fixe : supertest ouvre un port éphémère **différent à chaque requête**, et
 * l'URL de ressource dérivée de l'hôte changerait d'un appel à l'autre (ce qui est le bon
 * comportement : un jeton est lié à sa ressource). La production fixe aussi cette variable.
 */
const TEST_BASE_URL = 'https://foretmap.test.example';

function enableMcpEnv(overrides = {}) {
  process.env.MCP_ENABLED = 'true';
  delete process.env.MCP_WRITE_ENABLED;
  delete process.env.MCP_SQL_ENABLED;
  delete process.env.MCP_SQL_WRITE_ENABLED;
  delete process.env.MCP_SQL_DDL_ENABLED;
  delete process.env.MCP_WRITE_REQUIRE_PLAN;
  delete process.env.MCP_PRIVACY_BYPASS;
  delete process.env.MCP_PRIVACY_BYPASS_ACK;
  delete process.env.MCP_CONFIRM_REQUIRED;
  process.env.MCP_PUBLIC_BASE_URL = TEST_BASE_URL;
  Object.assign(process.env, overrides);
}

/** Compte enseignant avec profil (`admin`, `prof`, `prof_classe`…). */
async function createAccount(roleSlug, { userType = 'teacher' } = {}) {
  const id = crypto.randomUUID();
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, first_name, last_name, display_name,
                        password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Mcp', ?, ?, ?, 'local', 1, NOW(), NOW())`,
    [
      id,
      userType,
      `mcp_${stamp}@example.test`,
      `mcp_${stamp}`,
      stamp,
      `Mcp ${stamp}`,
      await bcrypt.hash(PASSWORD, 4),
    ],
  );
  if (roleSlug) {
    const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [roleSlug]);
    assert.ok(role, `profil ${roleSlug} introuvable`);
    await setAssignedRole(id, role.id);
  }
  await recomputeUserRole(id);
  createdAccountIds.push(id);
  return { id, pseudo: `mcp_${stamp}`, password: PASSWORD };
}

const createdAccountIds = [];

/**
 * Supprime les comptes créés par ce fichier de test (cascade : jetons, plans, TOTP). Sans
 * cela, un compte enrôlé en TOTP avec une clé propre au fichier ferait échouer la rotation de
 * clé de `tests/auth-totp-admin.test.js` (secret indéchiffrable).
 */
async function cleanupAccounts() {
  if (createdAccountIds.length === 0) return;
  const ids = createdAccountIds.splice(0);
  await execute(`DELETE FROM user_roles WHERE user_id IN (${ids.map(() => '?').join(', ')})`, ids);
  await execute(`DELETE FROM users WHERE id IN (${ids.map(() => '?').join(', ')})`, ids);
}

function pkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function hiddenFields(html) {
  const out = {};
  for (const m of String(html).matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)) {
    out[m[1]] = m[2]
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }
  return out;
}

function csrfCookieOf(res, previous = '') {
  const cookies = res.headers['set-cookie'] || [];
  for (const c of cookies) if (c.startsWith('fmcp_csrf=')) return c.split(';')[0];
  return previous;
}

async function registerClient(app, redirectUris = [LOOPBACK_CALLBACK]) {
  const res = await request(app)
    .post('/oauth/register')
    .send({ client_name: 'test', redirect_uris: redirectUris, token_endpoint_auth_method: 'none' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.client_id;
}

function authorizeQuery({ clientId, redirectUri, challenge, scope, state = 'st4te', resource }) {
  const q = {
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  };
  if (scope) q.scope = scope;
  if (resource) q.resource = resource;
  return q;
}

/**
 * Parcours d'autorisation complet jusqu'au code. Renvoie `{ code, state, location }`.
 * `totp` : fonction asynchrone qui fournit un code quand l'étape est demandée.
 */
async function authorizeFlow(app, { clientId, redirectUri, account, scope, totp, pkce }) {
  const { challenge } = pkce;
  const page = await request(app)
    .get('/oauth/authorize')
    .query(authorizeQuery({ clientId, redirectUri, challenge, scope }));
  assert.equal(page.status, 200, page.text);
  let cookie = csrfCookieOf(page);
  const post = async (form) => {
    const res = await request(app)
      .post('/oauth/authorize')
      .set('Cookie', cookie)
      .type('form')
      .send(form);
    cookie = csrfCookieOf(res, cookie);
    return res;
  };
  let res = await post({
    ...hiddenFields(page.text),
    identifier: account.pseudo,
    password: account.password,
  });
  if (res.status !== 200) return { status: res.status, html: res.text };
  if (/name="step" value="totp"/.test(res.text)) {
    assert.ok(totp, 'second facteur demandé');
    res = await post({ ...hiddenFields(res.text), code: await totp() });
    if (res.status !== 200) return { status: res.status, html: res.text };
  }
  assert.match(res.text, /name="step" value="consent"/);
  const consentHtml = res.text;
  res = await post({ ...hiddenFields(consentHtml), decision: 'approve' });
  assert.equal(res.status, 302, res.text);
  const location = new URL(res.headers.location);
  return {
    status: 302,
    code: location.searchParams.get('code'),
    state: location.searchParams.get('state'),
    location,
    consentHtml,
  };
}

async function exchangeCode(app, { clientId, redirectUri, code, verifier }) {
  return request(app).post('/oauth/token').type('form').send({
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
    client_id: clientId,
  });
}

/** Jeton d'accès complet pour un compte (DCR loopback + parcours + échange). */
async function obtainTokens(app, account, { scope, redirectUri = LOOPBACK_CALLBACK } = {}) {
  const clientId = await registerClient(app, [redirectUri]);
  const pkce = pkcePair();
  const flow = await authorizeFlow(app, { clientId, redirectUri, account, scope, pkce });
  assert.equal(flow.status, 302, flow.html);
  const res = await exchangeCode(app, {
    clientId,
    redirectUri,
    code: flow.code,
    verifier: pkce.verifier,
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return { ...res.body, clientId };
}

let rpcId = 0;
/** Appel JSON-RPC sur `/mcp` (réponse JSON, transport sans état). */
async function rpc(app, token, method, params = {}) {
  const req = request(app)
    .post('/mcp')
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json');
  if (token) req.set('Authorization', `Bearer ${token}`);
  rpcId += 1;
  return req.send({ jsonrpc: '2.0', id: rpcId, method, params });
}

async function initialize(app, token) {
  return rpc(app, token, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '1.0.0' },
  });
}

async function listTools(app, token) {
  const res = await rpc(app, token, 'tools/list');
  assert.equal(res.status, 200, res.text);
  return res.body.result.tools.map((t) => t.name);
}

/** `tools/call` → `{ isError, data, text }` (data = JSON décodé du premier contenu). */
async function callTool(app, token, name, args = {}) {
  const res = await rpc(app, token, 'tools/call', { name, arguments: args });
  assert.equal(res.status, 200, res.text);
  if (res.body.error) return { isError: true, data: res.body.error, text: res.text };
  const text = res.body.result?.content?.[0]?.text ?? '';
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { isError: !!res.body.result?.isError, data, text };
}

module.exports = {
  TEST_BASE_URL,
  CLAUDE_CALLBACK,
  LOOPBACK_CALLBACK,
  PASSWORD,
  authorizeFlow,
  authorizeQuery,
  callTool,
  cleanupAccounts,
  createAccount,
  csrfCookieOf,
  enableMcpEnv,
  exchangeCode,
  hiddenFields,
  initialize,
  listTools,
  obtainTokens,
  pkcePair,
  registerClient,
  rpc,
};
