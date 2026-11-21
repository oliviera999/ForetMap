'use strict';

// Élèves référents automatiques — lot 6 (contrat serveur) : l'identité d'un référent **élève**
// suit `tasks.assignees_visibility`, comme les inscrits ; un référent adulte reste visible ; un
// lecteur sans compte ne voit aucun référent ; un gestionnaire voit tout (son formulaire ne doit
// jamais recevoir une liste tronquée).

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { initDatabase, queryOne, execute } = require('../database');
const { setSetting } = require('../lib/settings');
const { setAssignedRole } = require('../lib/effectiveRole');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { app } = require('../server');
const { ensureAdminTeacherAuthToken, getAdminTeacherUserId } = require('./helpers/adminAuth');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');

const suffix = crypto.randomUUID().slice(0, 8);
let adminToken;
let adminId;
let taskId;
let snapshot;
const people = {};
const groups = [];

async function createGroup(label) {
  const id = crypto.randomUUID();
  await execute(
    "INSERT INTO `groups` (id, slug, name, kind, is_active) VALUES (?, ?, ?, 'class', 1)",
    [id, `sr-vis-${label}-${suffix}`, `Référents visibilité ${label} ${suffix}`],
  );
  groups.push(id);
  return id;
}

async function createStudent(label, groupId) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ firstName: `Ref${label}`, lastName: `Vis${suffix}`, password: 'pass1234' })
    .expect(201);
  const role = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_novice' LIMIT 1");
  await setAssignedRole(res.body.id, role.id);
  await execute(
    "INSERT IGNORE INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student')",
    [groupId, res.body.id],
  );
  return { id: res.body.id, token: res.body.authToken };
}

async function detailFor(token) {
  const req = request(app).get(`/api/tasks/${taskId}`);
  if (token) req.set('Authorization', `Bearer ${token}`);
  return (await req.expect(200)).body;
}

async function listRowFor(token) {
  const req = request(app).get('/api/tasks');
  if (token) req.set('Authorization', `Bearer ${token}`);
  return (await req.expect(200)).body.find((t) => t.id === taskId);
}

test.before(async () => {
  await initDatabase();
  await ensureRbacBootstrap();
  snapshot = await snapshotSetting('tasks.assignees_visibility');
  adminToken = await ensureAdminTeacherAuthToken({ elevated: true });
  adminId = await getAdminTeacherUserId();
  const g1 = await createGroup('g1');
  const g2 = await createGroup('g2');
  people.referent = await createStudent('Referent', g1);
  people.peer = await createStudent('Pair', g1);
  people.other = await createStudent('Autre', g2);
  const res = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      title: `Référents visibilité ${suffix}`,
      recurrence: 'weekly',
      referent_user_ids: [adminId, people.referent.id],
    })
    .expect(201);
  taskId = res.body.id;
  await execute("UPDATE task_referents SET source = 'auto' WHERE task_id = ? AND user_id = ?", [
    taskId,
    people.referent.id,
  ]);
});

test.after(async () => {
  await restoreSetting(snapshot);
  await execute('DELETE FROM tasks WHERE id = ?', [taskId]);
  for (const p of Object.values(people)) await execute('DELETE FROM users WHERE id = ?', [p.id]);
  for (const g of groups) await execute('DELETE FROM `groups` WHERE id = ?', [g]);
});

test('sans compte : aucun référent (liste et détail)', async () => {
  for (const body of [await listRowFor(null), await detailFor(null)]) {
    assert.deepEqual(body.referents_linked, []);
    assert.deepEqual(body.referent_user_ids, []);
    assert.doesNotMatch(JSON.stringify(body), /RefReferent/);
  }
});

test('mode group : le camarade voit le référent élève ; l’élève d’un autre groupe ne voit que l’adulte', async () => {
  await setSetting('tasks.assignees_visibility', 'group');
  const peer = await detailFor(people.peer.token);
  assert.ok(peer.referents_linked.some((r) => r.id === people.referent.id && r.source === 'auto'));
  assert.equal(peer.referents_hidden_count, undefined);
  for (const body of [await detailFor(people.other.token), await listRowFor(people.other.token)]) {
    assert.deepEqual(
      body.referents_linked.map((r) => r.id),
      [String(adminId)],
      'référent adulte toujours visible',
    );
    assert.ok(!body.referent_user_ids.includes(people.referent.id));
    assert.equal(body.referents_hidden_count, 1);
  }
});

test('mode self : seul le référent lui-même se voit ; mode all : tout compte connecté', async () => {
  await setSetting('tasks.assignees_visibility', 'self');
  const self = await detailFor(people.referent.token);
  assert.ok(self.referents_linked.some((r) => r.id === people.referent.id));
  const peer = await detailFor(people.peer.token);
  assert.equal(peer.referents_hidden_count, 1);
  await setSetting('tasks.assignees_visibility', 'all');
  const other = await listRowFor(people.other.token);
  assert.ok(other.referents_linked.some((r) => r.id === people.referent.id));
});

test('gestionnaire : liste complète, quel que soit le réglage', async () => {
  await setSetting('tasks.assignees_visibility', 'self');
  const body = await detailFor(adminToken);
  assert.equal(body.referents_linked.length, 2);
  assert.equal(body.referents_hidden_count, undefined);
});
