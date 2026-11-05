'use strict';

/**
 * Pont API interne `foretmap_api` (lot B) : appel réel en processus, droits applicatifs de
 * l'utilisateur MCP, refus G&L et routes sensibles, audit `via: 'mcp'`, aucun jeton dans la
 * sortie, limiteur général levé pour les seules requêtes marquées, en-tête forgé sans effet,
 * envoi de fichier.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const fx = require('./helpers/mcpFixtures');
const { initSchema, queryOne, queryAll, execute } = require('../database');

fx.enableMcpEnv();

const { app } = require('../server');
const { recomputeUserRole } = require('../lib/effectiveRole');
const { signAuthToken } = require('../middleware/requireTeacher');
const {
  assertBridgePath,
  bridgeRequest,
  setBridgeApp,
  getBridgeApp,
} = require('../lib/mcp/apiBridge');
const {
  markMcpInternalRequest,
  mcpContextOfRequest,
  runWithMcpContext,
} = require('../lib/mcp/callContext');
const { shouldSkipRateLimit } = require('../lib/rateLimit');
const { getMcpConfig } = require('../lib/mcp/config');

let admin;
let profClasse;
let adminToken;
let profClasseToken;
let profClasseRoleId;
let mapId;
const createdTaskIds = [];

function parse(raw) {
  if (!raw) return {};
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

test.before(async () => {
  await initSchema();
  admin = await fx.createAccount('admin');
  profClasse = await fx.createAccount('prof_classe');
  const role = await queryOne("SELECT id FROM roles WHERE slug = 'prof_classe'");
  profClasseRoleId = role.id;
  // Le prof de classe n'a pas `mcp.use` par défaut : on le lui accorde pour ce fichier.
  await execute('INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)', [
    profClasseRoleId,
    'mcp.use',
  ]);
  await recomputeUserRole(profClasse.id);
  adminToken = (await fx.obtainTokens(app, admin)).access_token;
  profClasseToken = (await fx.obtainTokens(app, profClasse)).access_token;
  const map = await queryOne('SELECT id FROM maps ORDER BY sort_order, id LIMIT 1');
  mapId = map?.id;
});

test.after(async () => {
  for (const id of createdTaskIds) {
    await execute('DELETE FROM task_logs WHERE task_id = ?', [id]);
    await execute('DELETE FROM task_assignments WHERE task_id = ?', [id]);
    await execute('DELETE FROM tasks WHERE id = ?', [id]);
  }
  await execute('DELETE FROM role_permissions WHERE role_id = ? AND permission_key = ?', [
    profClasseRoleId,
    'mcp.use',
  ]);
  await fx.cleanupAccounts();
});

test('POST puis GET réels : créer une tâche et la relire', async () => {
  const created = await fx.callTool(app, adminToken, 'foretmap_api', {
    method: 'POST',
    path: '/api/tasks',
    body: { title: `Tâche pont ${Date.now()}`, map_id: mapId, required_students: 1 },
  });
  assert.equal(created.isError, false, created.text);
  assert.equal(created.data.status, 201, JSON.stringify(created.data).slice(0, 400));
  const taskId = created.data.json.id;
  assert.ok(taskId);
  createdTaskIds.push(taskId);
  const read = await fx.callTool(app, adminToken, 'foretmap_api', {
    method: 'GET',
    path: `/api/tasks/${taskId}`,
  });
  assert.equal(read.isError, false, read.text);
  assert.equal(read.data.status, 200);
  assert.equal(read.data.json.id, taskId);
  // Aucun jeton dans la sortie.
  assert.doesNotMatch(created.text + read.text, /eyJ[A-Za-z0-9_-]{10,}\./);

  // Audit : la création porte `via: 'mcp'`, l'outil et le client OAuth.
  const row = await queryOne(
    `SELECT payload_json FROM audit_log WHERE action = 'create_task' AND target_id = ?
     ORDER BY id DESC LIMIT 1`,
    [taskId],
  );
  assert.ok(row, 'ligne create_task');
  const payload = parse(row.payload_json);
  assert.equal(payload.via, 'mcp');
  assert.equal(payload.mcp_tool, 'foretmap_api');
  assert.match(String(payload.mcp_client_id), /^fmcp_/);
  const bridgeRow = await queryOne(
    `SELECT payload_json FROM audit_log WHERE action = 'mcp_api_call' AND actor_user_id = ?
     ORDER BY id DESC LIMIT 1`,
    [admin.id],
  );
  assert.ok(bridgeRow, 'ligne mcp_api_call');
  // Aucun jeton dans les lignes d'audit du compte.
  const rows = await queryAll('SELECT payload_json FROM audit_log WHERE actor_user_id = ?', [
    admin.id,
  ]);
  for (const r of rows) {
    assert.doesNotMatch(JSON.stringify(r.payload_json || ''), /eyJ[A-Za-z0-9_-]{10,}\./);
  }
});

test('valider : un prof de classe sans tasks.validate reçoit le 403 de l’API', async () => {
  const created = await fx.callTool(app, adminToken, 'foretmap_api', {
    method: 'POST',
    path: '/api/tasks',
    body: { title: `Tâche à valider ${Date.now()}`, map_id: mapId },
  });
  const taskId = created.data.json.id;
  createdTaskIds.push(taskId);
  const denied = await fx.callTool(app, profClasseToken, 'foretmap_api', {
    method: 'POST',
    path: `/api/tasks/${taskId}/validate`,
  });
  assert.equal(denied.isError, false, denied.text);
  assert.equal(denied.data.status, 403);
  const ok = await fx.callTool(app, adminToken, 'foretmap_api', {
    method: 'POST',
    path: `/api/tasks/${taskId}/validate`,
  });
  assert.equal(ok.data.status, 200, JSON.stringify(ok.data).slice(0, 300));
  assert.equal(ok.data.json.status, 'validated');
});

test('chemins refusés : G&L, login, logout, sensible ; hors /api', async () => {
  for (const path of ['/api/gl/kingdom-map', '/api/gl', '/api/auth/login', '/api/auth/logout']) {
    const r = await fx.callTool(app, adminToken, 'foretmap_api', { method: 'GET', path });
    assert.equal(r.isError, true, path);
  }
  assert.throws(() => assertBridgePath('/mcp'), /api/);
  assert.throws(() => assertBridgePath('/api/../mcp'), /invalide/);
  assert.throws(() => assertBridgePath('/api/auth/admin/impersonate'), /sensible/);
  assert.equal(
    assertBridgePath('/api/auth/admin/impersonate', { sensitiveAllowed: true }),
    '/api/auth/admin/impersonate',
  );
  // `/api/glossary` n'est pas G&L.
  assert.equal(assertBridgePath('/api/glossary'), '/api/glossary');
});

test('méthode hors liste du réglage refusée ; écriture refusée sans portée write', async () => {
  process.env.MCP_API_BRIDGE_METHODS = 'GET';
  try {
    const r = await fx.callTool(app, adminToken, 'foretmap_api', {
      method: 'DELETE',
      path: '/api/tasks/inexistante',
    });
    assert.equal(r.isError, true);
    assert.match(r.text, /mcp\.api_bridge_methods/);
  } finally {
    delete process.env.MCP_API_BRIDGE_METHODS;
  }
  const readOnly = await fx.obtainTokens(app, admin, { scope: 'foretmap.read' });
  const r2 = await fx.callTool(app, readOnly.access_token, 'foretmap_api', {
    method: 'POST',
    path: '/api/tasks',
    body: { title: 'x' },
  });
  assert.equal(r2.isError, true);
  assert.match(r2.text, /foretmap\.write/);
});

test('limiteur général levé pour une requête marquée seulement', () => {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    E2E_DISABLE_RATE_LIMIT: process.env.E2E_DISABLE_RATE_LIMIT,
  };
  process.env.NODE_ENV = 'production';
  delete process.env.E2E_DISABLE_RATE_LIMIT;
  try {
    const marked = { headers: {}, get: () => '' };
    markMcpInternalRequest(marked, { tool: 'foretmap_api' });
    assert.equal(shouldSkipRateLimit(marked), true);
    const forged = {
      headers: { 'x-foretmap-mcp': '1', via: 'mcp' },
      via: 'mcp',
      get: () => '',
    };
    assert.equal(shouldSkipRateLimit(forged), false);
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('un en-tête de marquage forgé depuis l’extérieur n’a aucun effet', async () => {
  const jwt = await signAuthToken({
    userType: 'teacher',
    userId: admin.id,
    roleSlug: 'admin',
    mfa: true,
  });
  const res = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${jwt}`)
    .set('X-Foretmap-Mcp', '1')
    .set('Via', 'mcp')
    .send({ title: `Tâche réseau ${Date.now()}`, map_id: mapId });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  createdTaskIds.push(res.body.id);
  const row = await queryOne(
    `SELECT payload_json FROM audit_log WHERE action = 'create_task' AND target_id = ?
     ORDER BY id DESC LIMIT 1`,
    [res.body.id],
  );
  assert.ok(row);
  assert.notEqual(parse(row.payload_json).via, 'mcp');
});

test('photo de compte rendu : /done avec image (data URL) par le pont', async () => {
  const created = await fx.callTool(app, adminToken, 'foretmap_api', {
    method: 'POST',
    path: '/api/tasks',
    body: { title: `Tâche photo ${Date.now()}`, map_id: mapId, required_students: 1 },
  });
  const taskId = created.data.json.id;
  createdTaskIds.push(taskId);
  // Image PNG 1×1.
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const student = await fx.createAccount('eleve_novice', { userType: 'student' });
  const studentId = student.id;
  try {
    const assign = await fx.callTool(app, adminToken, 'foretmap_api', {
      method: 'POST',
      path: `/api/tasks/${taskId}/assign`,
      body: { studentId },
    });
    assert.ok([200, 201].includes(assign.data.status), JSON.stringify(assign.data).slice(0, 300));
    const done = await fx.callTool(app, adminToken, 'foretmap_api', {
      method: 'POST',
      path: `/api/tasks/${taskId}/done`,
      body: { studentId, comment: 'Fait', imageData: `data:image/png;base64,${png}` },
    });
    assert.ok([200, 201].includes(done.data.status), JSON.stringify(done.data).slice(0, 400));
    const log = await queryOne('SELECT image_path FROM task_logs WHERE task_id = ? LIMIT 1', [
      taskId,
    ]);
    assert.ok(log, 'compte rendu créé');
  } finally {
    await execute('DELETE FROM task_logs WHERE task_id = ?', [taskId]);
    await execute('DELETE FROM task_assignments WHERE task_id = ?', [taskId]);
  }
});

test('fichiers en multipart transmis à la route (multer)', async () => {
  const multer = require('multer');
  const upload = multer({ storage: multer.memoryStorage() });
  const mini = express();
  mini.post('/api/upload-test', upload.single('photo'), (req, res) => {
    const isMarked = !!mcpContextOfRequest(req);
    res.json({
      field: req.file?.fieldname,
      name: req.file?.originalname,
      size: req.file?.size,
      note: req.body?.note,
      marked: isMarked,
      auth: /^Bearer /.test(String(req.headers.authorization || '')),
    });
  });
  const previous = getBridgeApp();
  setBridgeApp(mini);
  try {
    const ctx = {
      user: { userId: admin.id, userType: 'teacher' },
      baseUrl: 'https://foretmap.test.example',
      cfg: getMcpConfig(),
    };
    const res = await runWithMcpContext({ tool: 'foretmap_api' }, () =>
      bridgeRequest(ctx, {
        method: 'POST',
        path: '/api/upload-test',
        body: { note: 'bonjour' },
        files: [
          {
            field: 'photo',
            filename: 'cr.png',
            mime: 'image/png',
            content_base64: Buffer.from('PNGDATA').toString('base64'),
          },
        ],
      }),
    );
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, {
      field: 'photo',
      name: 'cr.png',
      size: 7,
      note: 'bonjour',
      marked: true,
      auth: true,
    });
  } finally {
    setBridgeApp(previous);
  }
});

test('catalogue : routes documentées, filtres, G&L exclu', async () => {
  const all = await fx.callTool(app, adminToken, 'foretmap_api_catalog', {
    prefix: '/api/tasks',
    limit: 500,
  });
  assert.equal(all.isError, false, all.text);
  assert.ok(all.data.total > 5);
  assert.ok(all.data.items.every((r) => r.path.startsWith('/api/tasks')));
  assert.ok(all.data.items.some((r) => r.method === 'POST' && r.path === '/api/tasks'));
  const gl = await fx.callTool(app, adminToken, 'foretmap_api_catalog', { prefix: '/api/gl/' });
  assert.equal(gl.data.total, 0);
  // `/api/glossary` reste au catalogue (ce n'est pas G&L).
  const glossary = await fx.callTool(app, adminToken, 'foretmap_api_catalog', {
    prefix: '/api/glossary',
  });
  assert.ok(glossary.data.total > 0);
});

test('audit du pont : chemin plus long que la colonne target_id conservé', async () => {
  const longPath = `/api/tasks/${'x'.repeat(80)}`;
  await fx.callTool(app, adminToken, 'foretmap_api', { method: 'DELETE', path: longPath });
  const row = await queryOne(
    `SELECT target_id, payload_json FROM audit_log WHERE action = 'mcp_api_call' AND actor_user_id = ?
     ORDER BY id DESC LIMIT 1`,
    [admin.id],
  );
  assert.ok(row, 'ligne mcp_api_call écrite');
  assert.ok(row.target_id.length <= 64);
  assert.equal(parse(row.payload_json).path, longPath);
});
