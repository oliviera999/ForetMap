'use strict';

/** Prompts MCP (lot F) et note de mémoire stable semée de façon idempotente. */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/mcpFixtures');
const { initSchema, queryAll } = require('../database');

fx.enableMcpEnv();

const { app } = require('../server');
const { PROMPTS, STABLE_NOTES, resetSeedForTests, seedStableNotes } = require('../lib/mcp/prompts');

let token;

test.before(async () => {
  await initSchema();
  const admin = await fx.createAccount('admin');
  token = (await fx.obtainTokens(app, admin)).access_token;
});

test.after(() => fx.cleanupAccounts());

test('prompts/list expose les six parcours', async () => {
  const res = await fx.rpc(app, token, 'prompts/list');
  assert.equal(res.status, 200);
  const names = res.body.result.prompts.map((p) => p.name).sort();
  assert.deepEqual(names, PROMPTS.map((p) => p.name).sort());
  assert.equal(names.length, 6);
});

test('prompts/get renvoie les étapes avec les arguments', async () => {
  const res = await fx.rpc(app, token, 'prompts/get', {
    name: 'bilan_taches_periode',
    arguments: { from: '2026-09-01', to: '2026-10-31' },
  });
  assert.equal(res.status, 200);
  const text = res.body.result.messages[0].content.text;
  assert.match(text, /2026-09-01/);
  assert.match(text, /foretmap_tasks action=stats/);
});

test('note stable semée une seule fois', async () => {
  resetSeedForTests();
  await seedStableNotes();
  resetSeedForTests();
  await seedStableNotes();
  const rows = await queryAll("SELECT id FROM mcp_memory WHERE scope = 'site' AND subject = ?", [
    STABLE_NOTES[0].subject,
  ]);
  assert.equal(rows.length, 1);
});
