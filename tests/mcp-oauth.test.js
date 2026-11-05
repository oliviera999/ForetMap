'use strict';

/**
 * Connecteur MCP — serveur d'autorisation OAuth (lib/mcp/oauth) : métadonnées et 401,
 * enregistrement DCR, CIMD (lecture du document simulée), autorisation PKCE + consentement,
 * point de jeton (code à usage unique, PKCE faux, rotation, réutilisation → révocation),
 * révocation, isolation des jetons, refus de permission, désactivation et hôte GL.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const fx = require('./helpers/mcpFixtures');

fx.enableMcpEnv();
process.env.TOTP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');

const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const clients = require('../lib/mcp/oauth/clients');
const pages = require('../lib/mcp/oauth/pages');
const { signAuthToken } = require('../middleware/requireTeacher');
const totp = require('../lib/auth/totp');
const totpStore = require('../lib/auth/totpStore');

let admin;
let prof;
let student;

test.before(async () => {
  await initSchema();
  admin = await fx.createAccount('admin');
  prof = await fx.createAccount('prof');
  student = await fx.createAccount('eleve_novice', { userType: 'student' });
});

test.beforeEach(() => fx.enableMcpEnv());

test.after(() => fx.cleanupAccounts());

test('POST /mcp sans jeton : 401 + WWW-Authenticate resource_metadata', async () => {
  const res = await fx.rpc(app, null, 'tools/list');
  assert.equal(res.status, 401);
  const header = res.headers['www-authenticate'];
  assert.match(header, /^Bearer /);
  assert.ok(
    header.includes(
      `resource_metadata="${fx.TEST_BASE_URL}/.well-known/oauth-protected-resource/mcp"`,
    ),
    header,
  );
  assert.match(header, /scope="foretmap\.read foretmap\.write"/);
});

test('métadonnées : ressource protégée (RFC 9728) et serveur d’autorisation (RFC 8414)', async () => {
  process.env.MCP_PUBLIC_BASE_URL = 'https://foretmap.example.org/';
  const prm = await request(app).get('/.well-known/oauth-protected-resource/mcp');
  assert.equal(prm.status, 200);
  assert.equal(prm.body.resource, 'https://foretmap.example.org/mcp');
  assert.deepEqual(prm.body.authorization_servers, ['https://foretmap.example.org']);
  assert.deepEqual(prm.body.bearer_methods_supported, ['header']);
  assert.ok(prm.body.scopes_supported.includes('foretmap.read'));
  const fallback = await request(app).get('/.well-known/oauth-protected-resource');
  assert.deepEqual(fallback.body, prm.body);

  const asm = await request(app).get('/.well-known/oauth-authorization-server');
  assert.equal(asm.status, 200);
  assert.equal(asm.body.issuer, 'https://foretmap.example.org');
  assert.equal(asm.body.authorization_endpoint, 'https://foretmap.example.org/oauth/authorize');
  assert.equal(asm.body.token_endpoint, 'https://foretmap.example.org/oauth/token');
  assert.equal(asm.body.registration_endpoint, 'https://foretmap.example.org/oauth/register');
  assert.equal(asm.body.revocation_endpoint, 'https://foretmap.example.org/oauth/revoke');
  assert.deepEqual(asm.body.response_types_supported, ['code']);
  assert.deepEqual(asm.body.grant_types_supported, ['authorization_code', 'refresh_token']);
  assert.deepEqual(asm.body.code_challenge_methods_supported, ['S256']);
  assert.ok(asm.body.token_endpoint_auth_methods_supported.includes('none'));
  assert.equal(asm.body.client_id_metadata_document_supported, true);
  assert.ok(asm.body.scopes_supported.includes('offline_access'));
  const oidc = await request(app).get('/.well-known/openid-configuration');
  assert.equal(oidc.body.issuer, asm.body.issuer);
});

test('connecteur désactivé ou hôte G&L : tout répond 404', async () => {
  process.env.MCP_ENABLED = 'false';
  assert.equal((await request(app).get('/.well-known/oauth-authorization-server')).status, 404);
  assert.equal((await fx.rpc(app, null, 'tools/list')).status, 404);
  fx.enableMcpEnv();
  const gl = await request(app)
    .get('/.well-known/oauth-protected-resource/mcp')
    .set('X-Foretmap-Product', 'gl');
  assert.equal(gl.status, 404);
});

test('GET et DELETE /mcp : 405', async () => {
  assert.equal((await request(app).get('/mcp')).status, 405);
  assert.equal((await request(app).delete('/mcp')).status, 405);
});

test('redirections : claude.ai exacte, loopback port ignoré (localhost et 127.0.0.1)', () => {
  assert.ok(clients.isRedirectAllowedByServer('https://claude.ai/api/mcp/auth_callback'));
  assert.ok(clients.isRedirectAllowedByServer('http://localhost:3118/callback'));
  assert.ok(clients.isRedirectAllowedByServer('http://127.0.0.1:59999/callback'));
  assert.ok(clients.isRedirectAllowedByServer('http://localhost/callback'));
  assert.ok(!clients.isRedirectAllowedByServer('https://claude.ai/api/mcp/auth_callback/x'));
  assert.ok(!clients.isRedirectAllowedByServer('https://evil.example/api/mcp/auth_callback'));
  assert.ok(!clients.isRedirectAllowedByServer('http://localhost:3118/autre'));
  assert.ok(!clients.isRedirectAllowedByServer('https://localhost/callback'));
  assert.ok(
    !clients.redirectUriMatches('http://localhost:1/callback', 'http://127.0.0.1/callback'),
  );
});

test('CSP consentement : form-action autorise loopback:port, https et cursor:', () => {
  const cspLoop = pages.consentPageCsp('http://localhost:8787/callback');
  assert.match(cspLoop, /form-action[^;]*http:\/\/localhost:\*/);
  assert.match(cspLoop, /form-action[^;]*http:\/\/localhost:8787/);
  assert.match(cspLoop, /form-action[^;]*cursor:/);
  const cspCursor = pages.consentPageCsp('cursor://anysphere.cursor-mcp/oauth/callback');
  assert.match(cspCursor, /form-action[^;]*cursor:/);
  const cspHttps = pages.consentPageCsp('https://www.cursor.com/agents/mcp/oauth/callback');
  assert.match(cspHttps, /form-action[^;]*https:\/\/www\.cursor\.com/);
});

test('redirections multi-clients : Cursor, ChatGPT (stable + préfixe), Gemini CLI', () => {
  assert.ok(clients.isRedirectAllowedByServer('https://www.cursor.com/agents/mcp/oauth/callback'));
  assert.ok(clients.isRedirectAllowedByServer('http://localhost:8787/callback'));
  assert.ok(clients.isRedirectAllowedByServer('http://127.0.0.1:8787/callback'));
  assert.ok(clients.isRedirectAllowedByServer('cursor://anysphere.cursor-mcp/oauth/callback'));
  assert.equal(
    clients.validateRedirectUriShape('cursor://anysphere.cursor-mcp/oauth/callback'),
    null,
  );
  assert.ok(
    clients.isRedirectAllowedByServer('https://chatgpt.com/connector_platform_oauth_redirect'),
  );
  assert.ok(clients.isRedirectAllowedByServer('https://chatgpt.com/connector/oauth/cb_abc123'));
  assert.ok(!clients.isRedirectAllowedByServer('https://chatgpt.com/connector/oauth/'));
  assert.ok(!clients.isRedirectAllowedByServer('https://chatgpt.com/connector/other/x'));
  assert.ok(clients.isRedirectAllowedByServer('http://localhost:19234/oauth/callback'));
  assert.ok(clients.isRedirectAllowedByServer('http://127.0.0.1:9/oauth/callback'));
  assert.ok(!clients.isRedirectAllowedByServer('cursor://evil-app/oauth/callback'));
});

test('DCR : client public enregistré, redirections et méthode validées', async () => {
  const ok = await request(app)
    .post('/oauth/register')
    .send({ client_name: 'Claude', redirect_uris: [fx.CLAUDE_CALLBACK] });
  assert.equal(ok.status, 201);
  assert.match(ok.body.client_id, /^fmcp_dcr_/);
  assert.equal(ok.body.token_endpoint_auth_method, 'none');
  assert.equal(ok.body.client_secret, undefined);

  const bad = await request(app)
    .post('/oauth/register')
    .send({ redirect_uris: ['https://evil.example/cb'] });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'invalid_redirect_uri');

  const confidential = await request(app)
    .post('/oauth/register')
    .send({
      redirect_uris: [fx.CLAUDE_CALLBACK],
      token_endpoint_auth_method: 'client_secret_post',
    });
  assert.equal(confidential.body.error, 'invalid_client_metadata');

  const fragment = await request(app)
    .post('/oauth/register')
    .send({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback#x'] });
  assert.equal(fragment.status, 400);
});

test('DCR : filtre les redirect_uris hors allowlist (Cursor mix)', async () => {
  const mixed = await request(app)
    .post('/oauth/register')
    .send({
      client_name: 'Cursor',
      redirect_uris: [
        'https://www.cursor.com/agents/mcp/oauth/callback',
        'http://localhost:8787/callback',
        'cursor://anysphere.cursor-mcp/oauth/callback',
        'https://evil.example/cb',
      ],
    });
  assert.equal(mixed.status, 201, JSON.stringify(mixed.body));
  assert.deepEqual(mixed.body.redirect_uris, [
    'https://www.cursor.com/agents/mcp/oauth/callback',
    'http://localhost:8787/callback',
    'cursor://anysphere.cursor-mcp/oauth/callback',
  ]);
});

test('CIMD : document ChatGPT-like avec redirect préfixe accepté', async () => {
  const url = 'https://chatgpt.com/oauth/client.json';
  clients.setCimdFetcherForTests(async (u) => {
    assert.equal(u, url);
    return {
      status: 200,
      body: Buffer.from(
        JSON.stringify({
          client_id: url,
          client_name: 'ChatGPT',
          redirect_uris: [
            'https://chatgpt.com/connector_platform_oauth_redirect',
            'https://chatgpt.com/connector/oauth/cb_test1',
            'https://evil.example/cb',
          ],
        }),
      ),
      contentType: 'application/json',
    };
  });
  const client = await clients.resolveClient(url);
  assert.equal(client.kind, 'cimd');
  assert.deepEqual(client.redirect_uris, [
    'https://chatgpt.com/connector_platform_oauth_redirect',
    'https://chatgpt.com/connector/oauth/cb_test1',
  ]);
  clients.setCimdFetcherForTests(null);
});

test('CIMD : document lu, validé (client_id = URL) et mis en cache', async () => {
  const url = 'https://claude.ai/oauth/claude-code-client-metadata';
  let fetches = 0;
  clients.setCimdFetcherForTests(async (u) => {
    fetches += 1;
    assert.equal(u, url);
    return {
      status: 200,
      body: Buffer.from(
        JSON.stringify({
          client_id: url,
          client_name: 'Claude Code',
          redirect_uris: ['http://localhost/callback', 'http://127.0.0.1/callback'],
          token_endpoint_auth_method: 'none',
        }),
      ),
    };
  });
  const pkce = fx.pkcePair();
  const page = await request(app)
    .get('/oauth/authorize')
    .query(
      fx.authorizeQuery({
        clientId: url,
        redirectUri: 'http://localhost:48123/callback',
        challenge: pkce.challenge,
      }),
    );
  assert.equal(page.status, 200, page.text);
  assert.match(page.text, /claude\.ai/);
  assert.match(page.text, /localhost:48123/);
  assert.match(page.text, /adresse locale/, 'avertissement loopback');
  await request(app)
    .get('/oauth/authorize')
    .query(
      fx.authorizeQuery({
        clientId: url,
        redirectUri: 'http://127.0.0.1:1/callback',
        challenge: pkce.challenge,
      }),
    );
  assert.equal(fetches, 1, 'document mis en cache');

  clients.setCimdFetcherForTests(async () => ({
    status: 200,
    body: Buffer.from(
      JSON.stringify({ client_id: 'https://autre.example/doc', redirect_uris: [] }),
    ),
  }));
  const mismatch = await request(app)
    .get('/oauth/authorize')
    .query(
      fx.authorizeQuery({
        clientId: 'https://claude.ai/oauth/other-doc',
        redirectUri: fx.CLAUDE_CALLBACK,
        challenge: pkce.challenge,
      }),
    );
  assert.equal(mismatch.status, 400);
  assert.match(mismatch.text, /client_id du document/);

  clients.setCimdFetcherForTests(async () => {
    throw new Error('timeout');
  });
  const down = await request(app)
    .get('/oauth/authorize')
    .query(
      fx.authorizeQuery({
        clientId: 'https://claude.ai/oauth/down-doc',
        redirectUri: fx.CLAUDE_CALLBACK,
        challenge: pkce.challenge,
      }),
    );
  assert.equal(down.status, 400);
});

test('authorize : PKCE S256 obligatoire, redirect_uri vérifiée avant toute redirection', async () => {
  const clientId = await fx.registerClient(app);
  const plain = await request(app)
    .get('/oauth/authorize')
    .query({
      ...fx.authorizeQuery({
        clientId,
        redirectUri: fx.LOOPBACK_CALLBACK,
        challenge: fx.pkcePair().challenge,
      }),
      code_challenge_method: 'plain',
    });
  assert.equal(plain.status, 302);
  const loc = new URL(plain.headers.location);
  assert.equal(loc.searchParams.get('error'), 'invalid_request');
  assert.equal(loc.searchParams.get('state'), 'st4te');

  const foreign = await request(app)
    .get('/oauth/authorize')
    .query(
      fx.authorizeQuery({
        clientId,
        redirectUri: 'https://evil.example/cb',
        challenge: fx.pkcePair().challenge,
      }),
    );
  assert.equal(foreign.status, 400, 'jamais de redirection vers une URI non enregistrée');

  const badResource = await request(app)
    .get('/oauth/authorize')
    .query(
      fx.authorizeQuery({
        clientId,
        redirectUri: fx.LOOPBACK_CALLBACK,
        challenge: fx.pkcePair().challenge,
        resource: 'https://ailleurs.example/mcp',
      }),
    );
  assert.equal(new URL(badResource.headers.location).searchParams.get('error'), 'invalid_target');
});

test('authorize : CSRF exigé, mauvais mot de passe refusé, refus utilisateur', async () => {
  const clientId = await fx.registerClient(app);
  const pkce = fx.pkcePair();
  const page = await request(app)
    .get('/oauth/authorize')
    .query(
      fx.authorizeQuery({ clientId, redirectUri: fx.LOOPBACK_CALLBACK, challenge: pkce.challenge }),
    );
  const fields = fx.hiddenFields(page.text);
  const cookie = fx.csrfCookieOf(page);
  const noCsrf = await request(app)
    .post('/oauth/authorize')
    .type('form')
    .send({ ...fields, identifier: admin.pseudo, password: admin.password });
  assert.equal(noCsrf.status, 403);

  const wrong = await request(app)
    .post('/oauth/authorize')
    .set('Cookie', cookie)
    .type('form')
    .send({ ...fields, identifier: admin.pseudo, password: 'faux-mot-de-passe' });
  assert.equal(wrong.status, 401);
  assert.match(wrong.text, /incorrect/);

  const deny = await request(app)
    .post('/oauth/authorize')
    .set('Cookie', cookie)
    .type('form')
    .send({ ...fields, decision: 'deny' });
  assert.equal(deny.status, 302);
  assert.equal(new URL(deny.headers.location).searchParams.get('error'), 'access_denied');
});

test('authorize : compte sans mcp.use refusé à la connexion', async () => {
  const clientId = await fx.registerClient(app);
  const flow = await fx.authorizeFlow(app, {
    clientId,
    redirectUri: fx.LOOPBACK_CALLBACK,
    account: student,
    pkce: fx.pkcePair(),
  });
  assert.equal(flow.status, 403);
  assert.match(flow.html, /pas accès au connecteur/);
});

test('consentement : écran affiche hôte et portées ; un prof ne reçoit que la lecture', async () => {
  const clientId = await fx.registerClient(app, [fx.CLAUDE_CALLBACK]);
  const pkce = fx.pkcePair();
  const flow = await fx.authorizeFlow(app, {
    clientId,
    redirectUri: fx.CLAUDE_CALLBACK,
    account: prof,
    scope: 'foretmap.read foretmap.write offline_access',
    pkce,
  });
  assert.equal(flow.status, 302);
  assert.equal(flow.state, 'st4te');
  assert.equal(flow.location.origin + flow.location.pathname, fx.CLAUDE_CALLBACK);
  assert.match(flow.consentHtml, /claude\.ai/);
  assert.match(flow.consentHtml, /foretmap\.read/);
  assert.doesNotMatch(flow.consentHtml, /foretmap\.write/, 'écriture non proposée à un prof');
  const tok = await fx.exchangeCode(app, {
    clientId,
    redirectUri: fx.CLAUDE_CALLBACK,
    code: flow.code,
    verifier: pkce.verifier,
  });
  assert.equal(tok.status, 200);
  assert.equal(tok.body.scope, 'foretmap.read');
});

test('token : admin reçoit lecture + écriture, refresh émis, réponse rapide, no-store', async () => {
  const started = Date.now();
  const tokens = await fx.obtainTokens(app, admin, {
    scope: 'foretmap.read foretmap.write offline_access',
  });
  assert.ok(Date.now() - started < 5000);
  assert.equal(tokens.token_type, 'Bearer');
  assert.equal(tokens.scope, 'foretmap.read foretmap.write');
  assert.match(tokens.access_token, /^fmcp_at_/);
  assert.match(tokens.refresh_token, /^fmcp_rt_/);
  assert.ok(tokens.expires_in > 0);
  // Stockage haché : le jeton en clair n'existe pas en base.
  const raw = await queryOne('SELECT COUNT(*) AS n FROM mcp_oauth_tokens WHERE token_hash = ?', [
    tokens.access_token,
  ]);
  assert.equal(Number(raw.n), 0);
  const hashed = await queryOne('SELECT kind FROM mcp_oauth_tokens WHERE token_hash = ?', [
    crypto.createHash('sha256').update(tokens.access_token).digest('hex'),
  ]);
  assert.equal(hashed.kind, 'access');
});

test('token : code à usage unique, PKCE faux → invalid_grant, rejeu → famille révoquée', async () => {
  const clientId = await fx.registerClient(app);
  const pkce = fx.pkcePair();
  const flow = await fx.authorizeFlow(app, {
    clientId,
    redirectUri: fx.LOOPBACK_CALLBACK,
    account: admin,
    pkce,
  });
  const badPkce = await fx.exchangeCode(app, {
    clientId,
    redirectUri: fx.LOOPBACK_CALLBACK,
    code: flow.code,
    verifier: fx.pkcePair().verifier,
  });
  assert.equal(badPkce.status, 400);
  assert.equal(badPkce.body.error, 'invalid_grant');
  // Le code a été consommé par la tentative : il ne sert plus, même avec le bon vérificateur.
  const again = await fx.exchangeCode(app, {
    clientId,
    redirectUri: fx.LOOPBACK_CALLBACK,
    code: flow.code,
    verifier: pkce.verifier,
  });
  assert.equal(again.body.error, 'invalid_grant');

  const flow2 = await fx.authorizeFlow(app, {
    clientId,
    redirectUri: fx.LOOPBACK_CALLBACK,
    account: admin,
    pkce,
  });
  const first = await fx.exchangeCode(app, {
    clientId,
    redirectUri: fx.LOOPBACK_CALLBACK,
    code: flow2.code,
    verifier: pkce.verifier,
  });
  assert.equal(first.status, 200);
  const replay = await fx.exchangeCode(app, {
    clientId,
    redirectUri: fx.LOOPBACK_CALLBACK,
    code: flow2.code,
    verifier: pkce.verifier,
  });
  assert.equal(replay.body.error, 'invalid_grant');
  const after = await fx.rpc(app, first.body.access_token, 'tools/list');
  assert.equal(after.status, 401, 'jetons issus d’un code rejoué révoqués');
});

test('token : redirect_uri différente, client inconnu, grant non pris en charge', async () => {
  const clientId = await fx.registerClient(app);
  const pkce = fx.pkcePair();
  const flow = await fx.authorizeFlow(app, {
    clientId,
    redirectUri: fx.LOOPBACK_CALLBACK,
    account: admin,
    pkce,
  });
  const res = await fx.exchangeCode(app, {
    clientId,
    redirectUri: 'http://127.0.0.1:1/callback',
    code: flow.code,
    verifier: pkce.verifier,
  });
  assert.equal(res.body.error, 'invalid_grant');
  const unknown = await request(app)
    .post('/oauth/token')
    .type('form')
    .send({ grant_type: 'authorization_code', client_id: 'fmcp_dcr_inconnu', code: 'x' });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.body.error, 'invalid_client');
  const cc = await request(app)
    .post('/oauth/token')
    .type('form')
    .send({ grant_type: 'client_credentials', client_id: clientId });
  assert.equal(cc.body.error, 'unsupported_grant_type');
  const json = await request(app)
    .post('/oauth/token')
    .send({ grant_type: 'password', client_id: clientId });
  assert.equal(json.body.error, 'unsupported_grant_type', 'corps JSON toléré');
});

test('refresh : rotation, ancien refresh refusé, réutilisation → famille révoquée', async () => {
  const tokens = await fx.obtainTokens(app, admin);
  const refresh = (rt) =>
    request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'refresh_token', refresh_token: rt, client_id: tokens.clientId });
  const r1 = await refresh(tokens.refresh_token);
  assert.equal(r1.status, 200);
  assert.notEqual(r1.body.refresh_token, tokens.refresh_token);
  assert.equal(
    (await fx.rpc(app, tokens.access_token, 'tools/list')).status,
    401,
    'ancien access révoqué',
  );
  assert.equal((await fx.listTools(app, r1.body.access_token)).length > 0, true);

  const reuse = await refresh(tokens.refresh_token);
  assert.equal(reuse.status, 400);
  assert.equal(reuse.body.error, 'invalid_grant');
  // Toute la famille est révoquée : le refresh et l'access tout neufs ne marchent plus.
  assert.equal((await fx.rpc(app, r1.body.access_token, 'tools/list')).status, 401);
  assert.equal((await refresh(r1.body.refresh_token)).body.error, 'invalid_grant');
});

test('refresh : portée réduite quand mcp.write a été retirée', async () => {
  const other = await fx.createAccount('admin');
  const tokens = await fx.obtainTokens(app, other);
  assert.equal(tokens.scope, 'foretmap.read foretmap.write');
  // Retrait de l'écriture par passage au profil prof.
  const profRole = await queryOne("SELECT id FROM roles WHERE slug = 'prof'");
  const { setAssignedRole, recomputeUserRole } = require('../lib/effectiveRole');
  await setAssignedRole(other.id, profRole.id);
  await execute('DELETE FROM user_roles WHERE user_id = ? AND role_id <> ?', [
    other.id,
    profRole.id,
  ]);
  await recomputeUserRole(other.id);
  const r = await request(app).post('/oauth/token').type('form').send({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id: tokens.clientId,
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.scope, 'foretmap.read');
});

test('revoke : jeton révoqué, jeton inconnu → 200', async () => {
  const tokens = await fx.obtainTokens(app, admin);
  const res = await request(app)
    .post('/oauth/revoke')
    .type('form')
    .send({ token: tokens.access_token, client_id: tokens.clientId });
  assert.equal(res.status, 200);
  assert.equal((await fx.rpc(app, tokens.access_token, 'tools/list')).status, 401);
  const unknown = await request(app).post('/oauth/revoke').type('form').send({ token: 'inconnu' });
  assert.equal(unknown.status, 200);
});

test('isolation : jeton MCP refusé sur /api/* et /api/gl/*, JWT applicatif refusé sur /mcp', async () => {
  const tokens = await fx.obtainTokens(app, admin);
  const api = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${tokens.access_token}`);
  assert.equal(api.status, 401);
  assert.equal(api.body.code, 'MCP_TOKEN');
  const gl = await request(app)
    .get('/api/gl/chapters')
    .set('Authorization', `Bearer ${tokens.access_token}`);
  assert.equal(gl.status, 401);

  const jwt = await signAuthToken({ userType: 'teacher', userId: admin.id, permissions: [] });
  const mcp = await fx.rpc(app, jwt, 'tools/list');
  assert.equal(mcp.status, 401);
  assert.match(mcp.headers['www-authenticate'], /invalid_token/);
});

test('compte désactivé : accès coupé immédiatement', async () => {
  const other = await fx.createAccount('prof');
  const tokens = await fx.obtainTokens(app, other);
  assert.ok((await fx.listTools(app, tokens.access_token)).length > 0);
  await execute('UPDATE users SET is_active = 0 WHERE id = ?', [other.id]);
  assert.equal((await fx.rpc(app, tokens.access_token, 'tools/list')).status, 401);
});

test('TOTP : un compte enrôlé passe par le second facteur', async () => {
  const other = await fx.createAccount('admin');
  const started = await totpStore.startEnrollment(other.id);
  await totpStore.confirmEnrollment(other.id, totp.totpAt(started.secret, Date.now()));
  // Pas suivant : l'anti-rejeu refuse le pas déjà consommé à la confirmation.
  const nextCode = () => totp.totpAt(started.secret, Date.now() + 30_000);
  const clientId = await fx.registerClient(app);
  const pkce = fx.pkcePair();
  const flow = await fx.authorizeFlow(app, {
    clientId,
    redirectUri: fx.LOOPBACK_CALLBACK,
    account: other,
    pkce,
    totp: async () => nextCode(),
  });
  assert.equal(flow.status, 302, flow.html);
  assert.ok(flow.code);
});

test('jeton lié à sa ressource : refusé si l’URL publique change', async () => {
  const tokens = await fx.obtainTokens(app, admin);
  process.env.MCP_PUBLIC_BASE_URL = 'https://autre-hote.example';
  const res = await fx.rpc(app, tokens.access_token, 'tools/list');
  assert.equal(res.status, 401);
  assert.match(res.body.error_description, /autre ressource/);
});

test('jeton sans ressource refusé ; corps /mcp > 256 ko refusé (413)', async () => {
  const tokens = await fx.obtainTokens(app, admin);
  await execute('UPDATE mcp_oauth_tokens SET resource = NULL WHERE token_hash = ?', [
    crypto.createHash('sha256').update(tokens.access_token).digest('hex'),
  ]);
  const res = await fx.rpc(app, tokens.access_token, 'tools/list');
  assert.equal(res.status, 401);
  const big = await request(app)
    .post('/mcp')
    .set('Content-Type', 'application/json')
    .send(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'x', params: { p: 'a'.repeat(300_000) } }),
    );
  assert.equal(big.status, 413);
});

test('époque de jeton : changement de mot de passe ou désactivation → accès et refresh coupés (I1)', async () => {
  const { bumpUserTokenEpoch } = require('../lib/auth/tokenEpoch');
  const other = await fx.createAccount('prof');
  const tokens = await fx.obtainTokens(app, other);
  assert.ok((await fx.listTools(app, tokens.access_token)).length > 0);
  // Époque enregistrée à l'émission.
  const row = await queryOne('SELECT token_epoch FROM mcp_oauth_tokens WHERE token_hash = ?', [
    crypto.createHash('sha256').update(tokens.access_token).digest('hex'),
  ]);
  const epoch = await queryOne('SELECT token_epoch FROM users WHERE id = ?', [other.id]);
  assert.equal(Number(row.token_epoch), Number(epoch.token_epoch));

  await bumpUserTokenEpoch(other.id);
  assert.equal((await fx.rpc(app, tokens.access_token, 'tools/list')).status, 401);
  const refreshed = await request(app).post('/oauth/token').type('form').send({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id: tokens.clientId,
  });
  assert.equal(refreshed.body.error, 'invalid_grant');
  const live = await queryOne(
    'SELECT COUNT(*) AS n FROM mcp_oauth_tokens WHERE user_id = ? AND revoked_at IS NULL',
    [other.id],
  );
  assert.equal(Number(live.n), 0, 'revokeAllForUser appelé par bumpUserTokenEpoch');

  // Époque changée par une écriture directe (sans passer par bumpUserTokenEpoch) : la
  // comparaison seule suffit à refuser.
  const fresh = await fx.obtainTokens(app, other);
  assert.ok((await fx.listTools(app, fresh.access_token)).length > 0);
  await execute('UPDATE users SET token_epoch = token_epoch + 1 WHERE id = ?', [other.id]);
  assert.equal((await fx.rpc(app, fresh.access_token, 'tools/list')).status, 401);
});

test('lot JSON-RPC de plus de 20 messages refusé avant le SDK (M2)', async () => {
  const tokens = await fx.obtainTokens(app, admin);
  const batch = Array.from({ length: 21 }, (_, i) => ({
    jsonrpc: '2.0',
    id: i + 1,
    method: 'tools/list',
  }));
  const res = await request(app)
    .post('/mcp')
    .set('Authorization', `Bearer ${tokens.access_token}`)
    .set('Accept', 'application/json, text/event-stream')
    .send(batch);
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, -32600);
});

test('étapes MFA/consentement liées à l’empreinte complète de la demande (M3)', async () => {
  const clientId = await fx.registerClient(app);
  const pkceA = fx.pkcePair();
  const pageA = await request(app)
    .get('/oauth/authorize')
    .query(
      fx.authorizeQuery({
        clientId,
        redirectUri: fx.LOOPBACK_CALLBACK,
        challenge: pkceA.challenge,
        state: 'A',
      }),
    );
  const cookie = fx.csrfCookieOf(pageA);
  const login = await request(app)
    .post('/oauth/authorize')
    .set('Cookie', cookie)
    .type('form')
    .send({ ...fx.hiddenFields(pageA.text), identifier: admin.pseudo, password: admin.password });
  const consentA = fx.hiddenFields(login.text);
  assert.ok(consentA.consent);
  // Même client, autre demande (autre défi PKCE, autre state) : le jeton de consentement de A
  // ne la termine pas.
  const pkceB = fx.pkcePair();
  const pageB = await request(app)
    .get('/oauth/authorize')
    .set('Cookie', cookie)
    .query(
      fx.authorizeQuery({
        clientId,
        redirectUri: fx.LOOPBACK_CALLBACK,
        challenge: pkceB.challenge,
        state: 'B',
      }),
    );
  const requestB = fx.hiddenFields(pageB.text).request;
  const mixed = await request(app)
    .post('/oauth/authorize')
    .set('Cookie', cookie)
    .type('form')
    .send({ ...consentA, request: requestB, decision: 'approve' });
  assert.equal(mixed.status, 400);
  assert.match(mixed.text, /Étape expirée/);
});

test('jeton : client CIMD lu en base, sans relecture du document (M4)', async () => {
  const url = 'https://claude.ai/oauth/cimd-m4-doc';
  let fetches = 0;
  clients.setCimdFetcherForTests(async () => {
    fetches += 1;
    return {
      status: 200,
      body: Buffer.from(
        JSON.stringify({
          client_id: url,
          redirect_uris: ['http://127.0.0.1/callback'],
          token_endpoint_auth_method: 'none',
        }),
      ),
    };
  });
  const pkce = fx.pkcePair();
  const flow = await fx.authorizeFlow(app, {
    clientId: url,
    redirectUri: 'http://127.0.0.1:45555/callback',
    account: admin,
    pkce,
  });
  assert.equal(fetches, 1);
  clients.setCimdFetcherForTests(async () => {
    throw new Error('ne doit pas être appelé');
  });
  const tok = await fx.exchangeCode(app, {
    clientId: url,
    redirectUri: 'http://127.0.0.1:45555/callback',
    code: flow.code,
    verifier: pkce.verifier,
  });
  assert.equal(tok.status, 200, JSON.stringify(tok.body));
});

test('production sans MCP_PUBLIC_BASE_URL : connecteur en 503 (M5)', async () => {
  const saved = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  delete process.env.MCP_PUBLIC_BASE_URL;
  try {
    const mcp = await fx.rpc(app, null, 'tools/list');
    assert.equal(mcp.status, 503);
    const md = await request(app).get('/.well-known/oauth-authorization-server');
    assert.equal(md.status, 503);
  } finally {
    process.env.NODE_ENV = saved;
    fx.enableMcpEnv();
  }
});
