#!/usr/bin/env node
/**
 * Smoke test du connecteur MCP distant, **flux OAuth complet** contre un serveur lancé :
 *
 *   1. découverte : 401 + WWW-Authenticate sur /mcp, métadonnées RFC 9728 puis RFC 8414 ;
 *   2. enregistrement DCR (redirection loopback Claude Code) ;
 *   3. /oauth/authorize : page de connexion, POST identifiants (+ code TOTP si demandé),
 *      consentement, redirection avec `code` ;
 *   4. /oauth/token (PKCE S256) puis rotation du refresh ;
 *   5. client MCP du SDK (StreamableHTTPClientTransport) : initialize, tools/list,
 *      tools/call foretmap_audit_all, puis foretmap_health_report (compte admin seulement).
 *
 * Usage :
 *   MCP_SMOKE_BASE_URL=http://localhost:3000 \
 *   MCP_SMOKE_IDENTIFIER=prof@exemple.fr MCP_SMOKE_PASSWORD=… [MCP_SMOKE_TOTP=123456] \
 *   node scripts/mcp-smoke.mjs
 *
 * Le mot de passe est lu dans l'environnement, jamais en argument (historique du shell).
 * Sortie : code 0 si tout passe, 1 sinon. N'écrit rien dans le contenu du site.
 */
import crypto from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export async function runSmoke({
  baseUrl,
  identifier,
  password,
  totp = null,
  log = (...a) => process.stderr.write(`${a.join(' ')}\n`),
  callTool = 'foretmap_audit_all',
}) {
  const base = baseUrl.replace(/\/+$/, '');
  const step = (msg) => log(`• ${msg}`);
  const fail = (msg) => {
    throw new Error(msg);
  };

  // 1. Découverte
  const unauth = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'tools/list' }),
  });
  if (unauth.status !== 401) fail(`401 attendu sur /mcp sans jeton, reçu ${unauth.status}`);
  const challenge = unauth.headers.get('www-authenticate') || '';
  const prmUrl = /resource_metadata="([^"]+)"/.exec(challenge)?.[1];
  if (!prmUrl) fail('WWW-Authenticate sans resource_metadata');
  step(`401 + resource_metadata=${prmUrl}`);
  const prm = await (await fetch(prmUrl)).json();
  if (prm.resource !== `${base}/mcp`) fail(`resource inattendu : ${prm.resource}`);
  const issuer = prm.authorization_servers?.[0];
  const asm = await (await fetch(`${issuer}/.well-known/oauth-authorization-server`)).json();
  if (!asm.code_challenge_methods_supported?.includes('S256')) fail('S256 non annoncé');
  step(`issuer ${asm.issuer} (CIMD=${asm.client_id_metadata_document_supported})`);

  // 2. DCR
  const redirectUri = 'http://127.0.0.1:53682/callback';
  const reg = await fetch(asm.registration_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'mcp-smoke',
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    }),
  });
  if (reg.status !== 201) fail(`DCR : ${reg.status} ${await reg.text()}`);
  const { client_id: clientId } = await reg.json();
  step(`client DCR ${clientId.slice(0, 18)}…`);

  // 3. Authorize (formulaires serveur)
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challengeS256 = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(8).toString('hex');
  const authUrl = new URL(asm.authorization_endpoint);
  for (const [k, v] of Object.entries({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: challengeS256,
    code_challenge_method: 'S256',
    state,
    scope: 'foretmap.read foretmap.write offline_access',
    resource: prm.resource,
  })) {
    authUrl.searchParams.set(k, v);
  }
  let cookie = '';
  const keepCookie = (res) => {
    const sc = res.headers.getSetCookie?.() || [];
    for (const c of sc) if (c.startsWith('fmcp_csrf=')) cookie = c.split(';')[0];
  };
  const fields = (html) => {
    const out = {};
    for (const m of html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)) {
      out[m[1]] = m[2]
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    }
    return out;
  };
  const post = async (form) => {
    const res = await fetch(asm.authorization_endpoint, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      body: new URLSearchParams(form),
    });
    keepCookie(res);
    return res;
  };
  const page = await fetch(authUrl, { redirect: 'manual' });
  keepCookie(page);
  if (page.status !== 200) fail(`page de connexion : ${page.status}`);
  let html = await page.text();
  let res = await post({ ...fields(html), identifier, password });
  html = res.status === 200 ? await res.text() : '';
  if (res.status !== 200) fail(`connexion refusée (${res.status})`);
  if (/name="step" value="totp"/.test(html)) {
    if (!totp) fail('Second facteur demandé : définir MCP_SMOKE_TOTP');
    res = await post({ ...fields(html), code: totp });
    html = res.status === 200 ? await res.text() : '';
    if (res.status !== 200) fail(`TOTP refusé (${res.status})`);
  }
  if (!/name="step" value="consent"/.test(html)) fail('Écran de consentement attendu');
  step('connexion + consentement affiché');
  res = await post({ ...fields(html), decision: 'approve' });
  if (res.status !== 302) fail(`redirection attendue après consentement (${res.status})`);
  const back = new URL(res.headers.get('location'));
  if (back.searchParams.get('state') !== state) fail('state non renvoyé');
  const code = back.searchParams.get('code');
  if (!code) fail(`pas de code : ${back.search}`);
  step('code d’autorisation reçu');

  // 4. Token + rotation
  const tokenReq = (params) =>
    fetch(asm.token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });
  const t0 = Date.now();
  let tok = await tokenReq({
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
    client_id: clientId,
    resource: prm.resource,
  });
  if (tok.status !== 200) fail(`token : ${tok.status} ${await tok.text()}`);
  let tokens = await tok.json();
  step(`jetons émis en ${Date.now() - t0} ms (portée : ${tokens.scope})`);
  tok = await tokenReq({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id: clientId,
  });
  if (tok.status !== 200) fail(`refresh : ${tok.status}`);
  tokens = await tok.json();
  step('refresh tourné');

  // 5. Client MCP du SDK
  const transport = new StreamableHTTPClientTransport(new URL(prm.resource), {
    requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } },
  });
  const client = new Client({ name: 'mcp-smoke', version: '1.0.0' });
  await client.connect(transport);
  const info = client.getServerVersion();
  step(`initialize → ${info?.name} ${info?.version}`);
  const list = await client.listTools();
  step(`tools/list → ${list.tools.length} outils`);
  const call = await client.callTool({ name: callTool, arguments: {} });
  if (call.isError) fail(`tools/call ${callTool} : ${call.content?.[0]?.text}`);
  const payload = JSON.parse(call.content[0].text);
  step(`tools/call ${callTool} → ${payload.total_findings ?? '?'} constats`);
  // Rapport de santé : proposé aux seuls comptes `admin.settings.read` (sauté sinon).
  let health = null;
  if (list.tools.some((t) => t.name === 'foretmap_health_report')) {
    const h = await client.callTool({
      name: 'foretmap_health_report',
      arguments: { skip_audit: true },
    });
    if (h.isError) fail(`tools/call foretmap_health_report : ${h.content?.[0]?.text}`);
    health = JSON.parse(h.content[0].text);
    if (!['green', 'orange', 'red'].includes(health.status)) fail('statut de santé inattendu');
    step(`tools/call foretmap_health_report → ${health.summary}`);
  } else {
    step('foretmap_health_report non proposé à ce compte (admin seulement) : sauté');
  }
  await client.close();
  return { tools: list.tools.map((t) => t.name), audit: payload, health, scope: tokens.scope };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const baseUrl = process.env.MCP_SMOKE_BASE_URL || 'http://localhost:3000';
  const identifier = process.env.MCP_SMOKE_IDENTIFIER;
  const password = process.env.MCP_SMOKE_PASSWORD;
  if (!identifier || !password) {
    process.stderr.write('MCP_SMOKE_IDENTIFIER et MCP_SMOKE_PASSWORD requis (environnement).\n');
    process.exit(2);
  }
  runSmoke({ baseUrl, identifier, password, totp: process.env.MCP_SMOKE_TOTP || null })
    .then((out) => {
      process.stdout.write(
        `${JSON.stringify({ ok: true, tools: out.tools, scope: out.scope, audit: out.audit.checks?.map((c) => `${c.check}=${c.count}`), health: out.health ? { status: out.health.status, summary: out.health.summary } : null }, null, 2)}\n`,
      );
      process.exit(0);
    })
    .catch((err) => {
      process.stderr.write(`ÉCHEC : ${err.message}\n`);
      process.exit(1);
    });
}
