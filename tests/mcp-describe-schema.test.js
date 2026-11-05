'use strict';

/** `foretmap_describe_schema` (lot C) : structure, gl_* exclues, colonnes secrètes masquées. */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/mcpFixtures');
const { initSchema } = require('../database');

fx.enableMcpEnv();

const { app } = require('../server');

let adminToken;

test.before(async () => {
  await initSchema();
  const admin = await fx.createAccount('admin');
  adminToken = (await fx.obtainTokens(app, admin)).access_token;
});

test.after(() => fx.cleanupAccounts());

test('résumé : gl_* exclues, migration courante', async () => {
  const r = await fx.callTool(app, adminToken, 'foretmap_describe_schema', {});
  assert.equal(r.isError, false, r.text);
  assert.ok(r.data.count > 20);
  assert.ok(Number.isInteger(r.data.migration_courante));
  assert.ok(r.data.tables.every((t) => !/^gl_/.test(t.name)));
  assert.ok(r.data.tables.some((t) => t.name === 'tasks'));
});

test('détail d’une table : colonnes, clés, index ; colonne secrète masquée', async () => {
  const r = await fx.callTool(app, adminToken, 'foretmap_describe_schema', { table: 'users' });
  assert.equal(r.isError, false, r.text);
  const users = r.data.tables[0];
  assert.equal(users.name, 'users');
  assert.deepEqual(users.primary_key, ['id']);
  const hash = users.columns.find((c) => c.name === 'password_hash');
  assert.ok(hash && hash.masquee === true);
  assert.ok(users.indexes.length > 0);
  const tasks = await fx.callTool(app, adminToken, 'foretmap_describe_schema', {
    table: 'task_assignments',
  });
  assert.ok(tasks.data.tables[0].foreign_keys.length >= 0);
});

test('filtre q', async () => {
  const r = await fx.callTool(app, adminToken, 'foretmap_describe_schema', { q: 'tutorial' });
  assert.ok(r.data.tables.length > 0);
  assert.ok(r.data.tables.every((t) => !/^gl_/.test(t.name)));
});
