'use strict';

/** `foretmap_entity_history` (lot C) : journal d'une entité, restauration par le pont API. */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/mcpFixtures');
const { initSchema, queryOne, execute } = require('../database');

fx.enableMcpEnv();

const { app } = require('../server');

let adminToken;
let taskId;

test.before(async () => {
  await initSchema();
  const admin = await fx.createAccount('admin');
  adminToken = (await fx.obtainTokens(app, admin)).access_token;
  const map = await queryOne('SELECT id FROM maps ORDER BY sort_order, id LIMIT 1');
  const created = await fx.callTool(app, adminToken, 'foretmap_api', {
    method: 'POST',
    path: '/api/tasks',
    body: { title: 'Titre initial', map_id: map.id },
  });
  taskId = created.data.json.id;
  await fx.callTool(app, adminToken, 'foretmap_api', {
    method: 'PUT',
    path: `/api/tasks/${taskId}`,
    body: { title: 'Titre modifié' },
  });
});

test.after(async () => {
  await execute('DELETE FROM tasks WHERE id = ?', [taskId]);
  await fx.cleanupAccounts();
});

test('historique : lignes d’audit avec via mcp, révision courante', async () => {
  const r = await fx.callTool(app, adminToken, 'foretmap_entity_history', {
    entity_type: 'task',
    entity_id: taskId,
  });
  assert.equal(r.isError, false, r.text);
  assert.equal(r.data.exists, true);
  const actions = r.data.items.map((i) => i.action);
  assert.ok(actions.includes('create_task'));
  assert.ok(actions.includes('update_task'));
  assert.ok(r.data.items.every((i) => i.via === 'mcp'));
  assert.ok(Number.isInteger(r.data.edit_revision));
});

test('restore : réapplique des valeurs par l’API (logique métier)', async () => {
  const r = await fx.callTool(app, adminToken, 'foretmap_entity_history', {
    entity_type: 'task',
    entity_id: taskId,
    action: 'restore',
    values: { title: 'Titre initial' },
  });
  assert.equal(r.isError, false, r.text);
  const row = await queryOne('SELECT title FROM tasks WHERE id = ?', [taskId]);
  assert.equal(row.title, 'Titre initial');
  const audit = await queryOne(
    "SELECT payload_json FROM audit_log WHERE action = 'update_task' AND target_id = ? ORDER BY id DESC LIMIT 1",
    [taskId],
  );
  const payload =
    typeof audit.payload_json === 'string' ? JSON.parse(audit.payload_json) : audit.payload_json;
  assert.equal(payload.mcp_tool, 'foretmap_entity_history');
});

test('restore refusé pour un type sans route de mise à jour', async () => {
  const r = await fx.callTool(app, adminToken, 'foretmap_entity_history', {
    entity_type: 'role',
    entity_id: '1',
    action: 'restore',
    values: { x: 1 },
  });
  assert.equal(r.isError, true);
});
