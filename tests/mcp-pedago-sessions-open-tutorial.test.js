'use strict';

/**
 * Outil MCP `foretmap_pedago_sessions` — action d'étape `open_tutorial` (chantier CPT, flux
 * F3) : le schéma annonce les actions de la source unique, une séance libre avec une étape
 * tutoriel s'écrit par le pont, et les refus du serveur (tutoriel inactif, introuvable)
 * remontent tels quels.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/mcpFixtures');
const { initSchema, execute } = require('../database');

fx.enableMcpEnv();

const { app } = require('../server');
const {
  PEDAGO_STEP_ACTION: A,
  PEDAGO_STEP_ACTION_ENUM,
} = require('../lib/shared/pedagoStepActions');

const TOOL = 'foretmap_pedago_sessions';
const stamp = Date.now().toString(36);
let adminToken;
let activeId;
let inactiveId;
let sessionId;

const call = (args) => fx.callTool(app, adminToken, TOOL, args);

async function insertTutorial(slug, isActive) {
  const res = await execute(
    `INSERT INTO tutorials (title, slug, type, html_content, is_active, sort_order, created_at, updated_at)
     VALUES (?, ?, 'html', ?, ?, 0, NOW(), NOW())`,
    [`Tutoriel MCP ${slug}`, slug, '<p>Contenu</p>', isActive ? 1 : 0],
  );
  return Number(res.insertId);
}

const steps = (payload) => [
  {
    id: 't1',
    title: 'Lire le tutoriel',
    body: 'Lis la fiche.',
    action: { type: A.OPEN_TUTORIAL, payload },
    completeWhen: 'manual',
  },
];

test.before(async () => {
  await initSchema();
  const admin = await fx.createAccount('admin');
  adminToken = (await fx.obtainTokens(app, admin)).access_token;
  activeId = await insertTutorial(`mcp-f3-actif-${stamp}`, true);
  inactiveId = await insertTutorial(`mcp-f3-inactif-${stamp}`, false);
});

test.after(async () => {
  if (sessionId) await execute('DELETE FROM pedago_sessions WHERE id = ?', [sessionId]);
  await execute('DELETE FROM tutorials WHERE id IN (?, ?)', [activeId, inactiveId]);
  await fx.cleanupAccounts();
});

test('le schéma de l’outil annonce chaque action d’étape et ses champs', async () => {
  const res = await fx.rpc(app, adminToken, 'tools/list');
  assert.equal(res.status, 200, res.text);
  const tool = res.body.result.tools.find((t) => t.name === TOOL);
  assert.ok(tool, 'outil exposé');
  const schema = JSON.stringify(tool.inputSchema);
  for (const type of PEDAGO_STEP_ACTION_ENUM.values) {
    assert.ok(schema.includes(type), `action absente du schéma : ${type}`);
  }
  assert.ok(schema.includes('tutorialId'));
  assert.ok(schema.includes('tutorialSlug'));
});

test('créer puis modifier une séance libre avec une étape tutoriel', async () => {
  const created = await call({
    action: 'create',
    data: {
      templateKey: 'custom',
      title: `Séance MCP tutoriel ${stamp}`,
      slug: `seance-mcp-tuto-${stamp}`,
      steps: steps({ tutorialSlug: `mcp-f3-actif-${stamp}` }),
    },
  });
  assert.equal(created.isError, false, created.text);
  sessionId = created.data.id;
  assert.equal(created.data.steps[0].action.type, A.OPEN_TUTORIAL);
  assert.equal(created.data.steps[0].action.payload.tutorialId, activeId);

  const refused = await call({
    action: 'update',
    session_id: sessionId,
    data: { steps: steps({ tutorialId: inactiveId }) },
  });
  assert.equal(refused.isError, true);
  assert.match(refused.text, /inactif/);

  const missing = await call({
    action: 'update',
    session_id: sessionId,
    data: { steps: steps({ tutorialId: 987654321 }) },
  });
  assert.equal(missing.isError, true);
  assert.match(missing.text, /introuvable/);

  const get = await call({ action: 'get', session_id: sessionId });
  assert.equal(get.data.steps[0].action.payload.tutorialId, activeId, 'étapes inchangées');
});
