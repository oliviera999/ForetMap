'use strict';

/**
 * Outil MCP `foretmap_pedago_sessions` — étape « réseau trophique » avec `plantIds` (chantier
 * collège, flux C3) : le schéma annonce le champ, une séance libre s'écrit par le pont, et un
 * `plantIds` invalide est refusé par le serveur (validation partagée).
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/mcpFixtures');
const { initSchema, execute, queryAll } = require('../database');

fx.enableMcpEnv();

const { app } = require('../server');
const { PEDAGO_STEP_ACTION: A } = require('../lib/shared/pedagoStepActions');

const TOOL = 'foretmap_pedago_sessions';
const stamp = Date.now().toString(36);
let adminToken;
let sessionId;

const call = (args) => fx.callTool(app, adminToken, TOOL, args);
const steps = (payload) => [
  {
    id: 'f1',
    title: 'Qui mange qui',
    body: '',
    action: { type: A.OPEN_FOODWEB, payload },
    completeWhen: 'manual',
  },
];

test.before(async () => {
  await initSchema();
  const admin = await fx.createAccount('admin');
  adminToken = (await fx.obtainTokens(app, admin)).access_token;
});

test.after(async () => {
  if (sessionId) await execute('DELETE FROM pedago_sessions WHERE id = ?', [sessionId]);
  await fx.cleanupAccounts();
});

test('le schéma annonce plantIds pour l’étape réseau trophique', async () => {
  const res = await fx.rpc(app, adminToken, 'tools/list');
  assert.equal(res.status, 200, res.text);
  const tool = res.body.result.tools.find((t) => t.name === TOOL);
  const schema = JSON.stringify(tool.inputSchema);
  assert.ok(schema.includes(`${A.OPEN_FOODWEB} { mapId, highlightPlantId, plantIds, preset }`));
  assert.match(schema, /liens mutuels/);
});

test('séance libre avec plantIds par le pont ; liste invalide refusée', async () => {
  const ids = (await queryAll('SELECT id FROM plants ORDER BY id LIMIT 2')).map((r) =>
    Number(r.id),
  );
  const refused = await call({
    action: 'create',
    data: { templateKey: 'custom', slug: `mcp-c3-ko-${stamp}`, steps: steps({ plantIds: [0] }) },
  });
  assert.equal(refused.isError, true);
  assert.match(refused.text, /plantIds/);

  const created = await call({
    action: 'create',
    data: { templateKey: 'custom', slug: `mcp-c3-${stamp}`, steps: steps({ plantIds: ids }) },
  });
  assert.equal(created.isError, false, created.text);
  sessionId = created.data.id;
  assert.deepEqual(created.data.steps[0].action.payload.plantIds, ids);
});
