'use strict';

/**
 * Outil de domaine `foretmap_groups` (lot D2) : création, fiche (nouvelle route
 * `GET /api/groups/:id`), membres et périmètres (l'un ne vide pas l'autre), bilan de classe,
 * recalcul de progression en aperçu, suppression ; refus nominatif sans bypass, domaine
 * désactivé ; visibilité de la nouvelle route.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const fx = require('./helpers/mcpFixtures');
const { initSchema, queryOne, queryAll, execute } = require('../database');

fx.enableMcpEnv();

const { app } = require('../server');

let adminToken;
let s1;
let s2;
let outsider;
let mapId;
let groupId;
let questionCode;

async function appToken(account, userType = 'teacher') {
  const { buildSessionPayload } = require('../lib/auth/sessionPayload');
  const { signJwtToken } = require('../lib/auth/jwtPipeline');
  const { JWT_SECRET } = require('../middleware/requireTeacher');
  const session = await buildSessionPayload(userType, account.id);
  return signJwtToken(
    { ...session.tokenPayload, sessionStartedAt: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    { expiresIn: 600 },
  );
}

const call = (name, args) => fx.callTool(app, adminToken, name, args);

test.before(async () => {
  await initSchema();
  const admin = await fx.createAccount('admin');
  adminToken = (await fx.obtainTokens(app, admin)).access_token;
  s1 = await fx.createAccount('eleve_novice', { userType: 'student' });
  s2 = await fx.createAccount('eleve_novice', { userType: 'student' });
  outsider = await fx.createAccount('eleve_novice', { userType: 'student' });
  mapId = (await queryOne('SELECT id FROM maps ORDER BY id LIMIT 1')).id;
  const q = await queryOne(
    "SELECT question_code, categorie_slug FROM quiz_questions WHERE statut = 'actif' ORDER BY question_code LIMIT 1",
  );
  questionCode = q.question_code;
  await execute(
    'INSERT INTO user_quiz_attempts (user_id, question_code, categorie_slug, is_correct) VALUES (?, ?, ?, 1)',
    [s1.id, q.question_code, q.categorie_slug],
  );
});

test.after(async () => {
  if (groupId) await execute('DELETE FROM `groups` WHERE id = ?', [groupId]);
  await fx.cleanupAccounts();
});

test.beforeEach(() => fx.enableMcpEnv());

test('create, get, set_members puis set_scopes (membres conservés), list, class_report', async () => {
  const name = `Classe MCP ${Date.now().toString(36)}`;
  const c = await call('foretmap_groups', { action: 'create', data: { name, kind: 'class' } });
  assert.equal(c.isError, false, c.text);
  groupId = c.data.id;

  const g = await call('foretmap_groups', { action: 'get', group_id: groupId });
  assert.equal(g.isError, false, g.text);
  assert.equal(g.data.name, name);
  assert.equal(g.data.member_counts.total, 0);

  const m = await call('foretmap_groups', {
    action: 'set_members',
    group_id: groupId,
    member_user_ids: [s1.id, s2.id],
  });
  assert.equal(m.isError, false, m.text);
  assert.equal(
    (await queryAll('SELECT user_id FROM group_members WHERE group_id = ?', [groupId])).length,
    2,
  );

  const sc = await call('foretmap_groups', {
    action: 'set_scopes',
    group_id: groupId,
    scope_map_ids: [mapId],
  });
  assert.equal(sc.isError, false, sc.text);
  assert.equal(sc.data.members_count, 2);
  // Effet : périmètre posé, membres intacts.
  assert.ok(
    await queryOne('SELECT id FROM group_scopes WHERE group_id = ? AND map_id = ?', [
      groupId,
      mapId,
    ]),
  );
  assert.equal(
    (await queryAll('SELECT user_id FROM group_members WHERE group_id = ?', [groupId])).length,
    2,
  );
  // set_members conserve à son tour le périmètre.
  await call('foretmap_groups', {
    action: 'set_members',
    group_id: groupId,
    member_user_ids: [s1.id],
  });
  assert.ok(await queryOne('SELECT id FROM group_scopes WHERE group_id = ?', [groupId]));

  const list = await call('foretmap_groups', { action: 'list', q: name });
  assert.equal(list.isError, false, list.text);
  assert.equal(list.data.total, 1);
  assert.equal(list.data.items[0].students_count, 1);
  assert.equal(list.data.items[0].members, undefined, 'pas de noms dans la liste');

  const rep = await call('foretmap_groups', {
    action: 'class_report',
    group_id: groupId,
    inactive_days: 30,
  });
  assert.equal(rep.isError, false, rep.text);
  assert.equal(rep.data.students, 1);
  assert.equal(rep.data.quiz.attempts, 1);
  assert.equal(rep.data.quiz.success_rate_percent, 100);
  assert.ok(Array.isArray(rep.data.quiz.by_notion));
  assert.ok(Array.isArray(rep.data.inactive_students.items));
});

test('update, progression_recompute (aperçu), delete', async () => {
  const u = await call('foretmap_groups', {
    action: 'update',
    group_id: groupId,
    data: { description: 'Groupe de test MCP' },
  });
  assert.equal(u.isError, false, u.text);
  const row = await queryOne('SELECT description FROM `groups` WHERE id = ?', [groupId]);
  assert.equal(row.description, 'Groupe de test MCP');

  const p = await call('foretmap_groups', {
    action: 'progression_recompute',
    scope: 'group',
    group_id: groupId,
    dry_run: true,
  });
  assert.equal(p.isError, false, p.text);
  assert.equal(p.data.dryRun, true);

  const d = await call('foretmap_groups', { action: 'delete', group_id: groupId });
  assert.equal(d.isError, false, d.text);
  assert.equal(await queryOne('SELECT id FROM `groups` WHERE id = ?', [groupId]), undefined);
  groupId = null;
});

test('route GET /api/groups/:id : 404, hors périmètre, membre', async () => {
  const id = `mcp-grp-r-${Date.now().toString(36)}`;
  await execute(
    "INSERT INTO `groups` (id, slug, name, kind, is_active) VALUES (?, ?, ?, 'class', 1)",
    [id, id, `Route ${id}`],
  );
  await execute(
    "INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student')",
    [id, s2.id],
  );
  try {
    const missing = await request(app)
      .get('/api/groups/inconnu-xyz')
      .set('Authorization', `Bearer ${await appToken(s2, 'student')}`);
    assert.ok([403, 404].includes(missing.status));
    // Élève membre : le groupe est dans son périmètre (même règle que la liste).
    const member = await request(app)
      .get(`/api/groups/${id}`)
      .set('Authorization', `Bearer ${await appToken(s2, 'student')}`);
    assert.equal(member.status, 200, member.text);
    assert.equal(member.body.member_counts.students, 1);
    assert.equal(member.body.members, undefined);
    // Élève sans groupe : refus.
    const denied = await request(app)
      .get(`/api/groups/${id}`)
      .set('Authorization', `Bearer ${await appToken(outsider, 'student')}`);
    assert.equal(denied.status, 403);
  } finally {
    await execute('DELETE FROM `groups` WHERE id = ?', [id]);
  }
});

test('nominatif refusé sans bypass', async () => {
  process.env.MCP_PRIVACY_BYPASS = 'false';
  const r = await call('foretmap_groups', { action: 'class_report', group_id: 'x' });
  assert.equal(r.isError, true);
  assert.match(r.text, /bypass/);
});

test('domaine désactivé : outil absent et appel refusé', async () => {
  process.env.MCP_DOMAINS_DISABLED = 'groups';
  const tools = await fx.listTools(app, adminToken);
  assert.ok(!tools.includes('foretmap_groups'));
  assert.ok(tools.includes('foretmap_students'));
  const r = await call('foretmap_groups', { action: 'list' });
  assert.equal(r.isError, true);
  assert.ok(questionCode);
});
