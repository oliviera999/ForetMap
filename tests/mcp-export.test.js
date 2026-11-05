'use strict';

/** `foretmap_export` (lot C) : fichier privé, lien signé d'une heure, purge après 24 h. */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const fx = require('./helpers/mcpFixtures');
const { initSchema } = require('../database');

fx.enableMcpEnv();

const { app } = require('../server');
const { purgeOldExports } = require('../lib/mcp/tools/data');
const { verifySignedUploadRequest } = require('../lib/uploadsSignedUrls');

const EXPORT_DIR = path.join(__dirname, '..', 'uploads', 'mcp-exports');
let adminToken;
const written = [];

test.before(async () => {
  await initSchema();
  const admin = await fx.createAccount('admin');
  adminToken = (await fx.obtainTokens(app, admin)).access_token;
});

test.after(async () => {
  for (const f of written) fs.rmSync(path.join(EXPORT_DIR, f), { force: true });
  await fx.cleanupAccounts();
});

for (const format of ['csv', 'xlsx', 'json']) {
  test(`export ${format} : fichier écrit, lien signé`, async () => {
    const r = await fx.callTool(app, adminToken, 'foretmap_export', {
      sql: 'SELECT id, name FROM plants ORDER BY id',
      format,
      filename: `essai-${format}`,
    });
    assert.equal(r.isError, false, r.text);
    written.push(r.data.file);
    assert.ok(fs.existsSync(path.join(EXPORT_DIR, r.data.file)));
    const url = new URL(r.data.url);
    assert.match(url.pathname, /^\/uploads\/mcp-exports\//);
    const rel = url.pathname.replace(/^\/uploads\//, '');
    const query = Object.fromEntries(url.searchParams);
    assert.equal(verifySignedUploadRequest(rel, query), true);
    // Expiré au-delà d'une heure.
    assert.equal(
      verifySignedUploadRequest(rel, query, { now: Date.now() + 61 * 60 * 1000 }),
      false,
    );
    // Accès direct sans signature refusé ; avec signature servi.
    assert.equal((await request(app).get(`/uploads/${rel}`)).status, 404);
    const ok = await request(app).get(`/uploads/${rel}`).query(query);
    assert.equal(ok.status, 200);
  });
}

test('table entière : colonnes secrètes retirées', async () => {
  const r = await fx.callTool(app, adminToken, 'foretmap_export', {
    table: 'users',
    format: 'json',
  });
  assert.equal(r.isError, false, r.text);
  written.push(r.data.file);
  assert.ok(!r.data.columns.includes('password_hash'));
  const content = fs.readFileSync(path.join(EXPORT_DIR, r.data.file), 'utf8');
  assert.doesNotMatch(content, /\$2[aby]\$/);
});

test('purge : fichier de plus de 24 h supprimé', () => {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const old = path.join(EXPORT_DIR, `vieux-${Date.now()}.csv`);
  fs.writeFileSync(old, 'a');
  const past = (Date.now() - 25 * 60 * 60 * 1000) / 1000;
  fs.utimesSync(old, past, past);
  assert.ok(purgeOldExports({ apply: false }) >= 1);
  assert.ok(fs.existsSync(old));
  purgeOldExports({ apply: true });
  assert.equal(fs.existsSync(old), false);
});
