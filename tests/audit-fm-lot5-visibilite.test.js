'use strict';
const { tasksListItems } = require('./helpers/tasksListResponse');

/**
 * Audit ForetMap du 19/11/2026, lot 5 — visibilité dans les tâches :
 *
 *   - T3 : un prof de classe (`stats.read.group`) ne voit dans le détail et le journal d'une
 *          tâche que les inscrits et comptes rendus de ses groupes (comme dans la liste) ;
 *   - T4 : le nom du proposant (identifiant et ligne « Proposition n3beur : … ») est masqué,
 *          en liste comme en détail, quand le lecteur ne le voit pas ;
 *   - CR : en mode `tasks.logs_visibility = group`, un compte rendu écrit par l'encadrement
 *          (sans élève rattaché) est visible de tous ceux qui lisent le journal (décision du
 *          19/11/2026).
 *
 * Groupes créés à la main : A et B dans G1 (avec le prof de classe P), C dans G2.
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, initDatabase, execute, queryOne } = require('../database');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { setSetting } = require('../lib/settings');
const { setAssignedRole } = require('../lib/effectiveRole');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');

const SETTING_KEYS = ['tasks.assignees_visibility', 'tasks.logs_visibility'];
const snapshots = [];
const suffix = Date.now();
const people = {};
const groupIds = [];
let adminToken;
let profToken;
let profId;
let taskId;
let proposalByC;
let proposalByB;

async function createGroup(label) {
  const id = crypto.randomUUID();
  await execute(
    "INSERT INTO `groups` (id, slug, name, kind, default_role_id, is_active) VALUES (?, ?, ?, 'class', NULL, 1)",
    [id, `lot5-vis-${label}-${suffix}`, `Lot5 visibilité ${label} ${suffix}`],
  );
  groupIds.push(id);
  return id;
}

async function createStudent(label, groupId) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ firstName: `Lv${label}`, lastName: `Lot5${suffix}`, password: 'pass1234' })
    .expect(201);
  const role = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_avance' LIMIT 1");
  await setAssignedRole(res.body.id, role.id);
  await execute(
    "INSERT IGNORE INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student')",
    [groupId, res.body.id],
  );
  return {
    id: res.body.id,
    firstName: res.body.first_name,
    lastName: res.body.last_name,
    token: res.body.authToken,
  };
}

async function createClassTeacher(groupId) {
  const id = `lot5-prof-${suffix}`.slice(0, 64);
  const role = await queryOne("SELECT id FROM roles WHERE slug = 'prof_classe' LIMIT 1");
  assert.ok(role?.id, 'profil prof_classe introuvable');
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, ?, 'Prof lot5', 'x', 'local', 1, NOW(), NOW())`,
    [id, `${id}@foretmap.local`, id],
  );
  await execute(
    `INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES ('teacher', ?, ?, 1)
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), is_primary = 1`,
    [id, role.id],
  );
  await execute('UPDATE users SET assigned_role_id = ? WHERE id = ?', [role.id, id]);
  await execute(
    "INSERT IGNORE INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'teacher')",
    [groupId, id],
  );
  const token = await signAuthToken(
    {
      userType: 'teacher',
      userId: id,
      canonicalUserId: id,
      roleId: role.id,
      roleSlug: 'prof_classe',
      roleDisplayName: 'Prof de classe',
      elevated: false,
    },
    false,
  );
  return { id, token };
}

function asUser(token, method, path, body) {
  const r = request(app)[method](path).set('Authorization', `Bearer ${token}`);
  return body ? r.send(body) : r;
}

async function staffAction(path, student, extra = {}) {
  await asUser(adminToken, 'post', `/api/tasks/${taskId}/${path}`, {
    firstName: student.firstName,
    lastName: student.lastName,
    studentId: student.id,
    ...extra,
  }).expect(200);
}

async function propose(student, title) {
  const res = await asUser(student.token, 'post', '/api/tasks/proposals', {
    title: `${title} ${suffix}`,
    description: 'Une idée',
  });
  assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  assert.match(res.body.description, /Proposition n3beur/);
  return res.body.id;
}

function firstNames(rows) {
  return (rows || []).map((r) => r.student_first_name).sort();
}

before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  for (const key of SETTING_KEYS) snapshots.push(await snapshotSetting(key));
  await setSetting('tasks.assignees_visibility', 'group', {});
  await setSetting('tasks.logs_visibility', 'group', {});
  adminToken = await ensureAdminTeacherAuthToken();

  const g1 = await createGroup('g1');
  const g2 = await createGroup('g2');
  people.a = await createStudent('A', g1);
  people.b = await createStudent('B', g1);
  people.c = await createStudent('C', g2);
  ({ id: profId, token: profToken } = await createClassTeacher(g1));

  const taskRes = await asUser(adminToken, 'post', '/api/tasks', {
    title: `Visibilité lot5 ${suffix}`,
    required_students: 3,
  }).expect(201);
  taskId = taskRes.body.id;
  for (const s of [people.a, people.c]) await staffAction('assign', s);
  for (const s of [people.a, people.c]) {
    await staffAction('done', s, { comment: `Rapport ${s.firstName}` });
  }
  await asUser(adminToken, 'post', `/api/tasks/${taskId}/logs`, {
    comment: 'Note de l’encadrement',
  }).expect(201);

  proposalByC = await propose(people.c, 'Proposition de C');
  proposalByB = await propose(people.b, 'Proposition de B');
});

after(async () => {
  for (const snap of snapshots) await restoreSetting(snap);
  await execute("DELETE FROM user_roles WHERE user_type = 'teacher' AND user_id = ?", [profId]);
  for (const id of groupIds) await execute('DELETE FROM group_members WHERE group_id = ?', [id]);
});

test('T3 — prof de classe : détail borné aux inscrits de ses groupes', async () => {
  const detail = await asUser(profToken, 'get', `/api/tasks/${taskId}`).expect(200);
  assert.deepStrictEqual(firstNames(detail.body.assignments), ['LvA']);
  assert.strictEqual(detail.body.assigned_count, 2, 'compteurs intacts');

  const list = await asUser(profToken, 'get', '/api/tasks').expect(200);
  const row = tasksListItems(list.body).find((t) => t.id === taskId);
  assert.deepStrictEqual(firstNames(row.assignments), ['LvA'], 'liste et détail alignés');
});

test('T3 — prof de classe : journal limité à ses élèves et à l’encadrement', async () => {
  const logs = await asUser(profToken, 'get', `/api/tasks/${taskId}/logs`).expect(200);
  const comments = tasksListItems(logs.body)
    .map((l) => l.comment)
    .sort();
  assert.deepStrictEqual(comments, ['Note de l’encadrement', 'Rapport LvA']);
  assert.ok(
    !tasksListItems(logs.body).some((l) => l.student_id === people.c.id),
    'rien de C (hors groupe)',
  );
});

test('CR — mode group : le compte rendu de l’encadrement est visible des camarades', async () => {
  const logs = await asUser(people.a.token, 'get', `/api/tasks/${taskId}/logs`).expect(200);
  const comments = tasksListItems(logs.body)
    .map((l) => l.comment)
    .sort();
  assert.deepStrictEqual(comments, ['Note de l’encadrement', 'Rapport LvA']);

  const asB = await asUser(people.b.token, 'get', `/api/tasks/${taskId}/logs`).expect(200);
  assert.ok(tasksListItems(asB.body).some((l) => l.comment === 'Note de l’encadrement'));
});

test('T4 — proposant hors groupe masqué en liste et en détail (id et ligne de description)', async () => {
  const list = await asUser(people.a.token, 'get', '/api/tasks').expect(200);
  const fromC = tasksListItems(list.body).find((t) => t.id === proposalByC);
  assert.ok(fromC, 'la proposition de C figure dans la liste');
  assert.strictEqual(fromC.proposed_by_student_id, null);
  assert.doesNotMatch(fromC.description, /Proposition n3beur/);
  assert.match(fromC.description, /Une idée/);

  const detail = await asUser(people.a.token, 'get', `/api/tasks/${proposalByC}`).expect(200);
  assert.strictEqual(detail.body.proposed_by_student_id, null);
  assert.doesNotMatch(detail.body.description, /Proposition n3beur/);

  // Camarade (même groupe, mode group) : le proposant reste visible.
  const fromB = tasksListItems(list.body).find((t) => t.id === proposalByB);
  assert.strictEqual(fromB.proposed_by_student_id, people.b.id);
  assert.match(fromB.description, /Proposition n3beur/);

  // L'auteur se voit toujours lui-même.
  const own = await asUser(people.c.token, 'get', `/api/tasks/${proposalByC}`).expect(200);
  assert.strictEqual(own.body.proposed_by_student_id, people.c.id);
  assert.match(own.body.description, /Proposition n3beur/);

  // Prof de classe : le proposant hors de ses groupes est masqué aussi.
  const prof = await asUser(profToken, 'get', `/api/tasks/${proposalByC}`).expect(200);
  assert.strictEqual(prof.body.proposed_by_student_id, null);
  assert.doesNotMatch(prof.body.description, /Proposition n3beur/);

  // Gestion globale : tout reste visible.
  const admin = await asUser(adminToken, 'get', `/api/tasks/${proposalByC}`).expect(200);
  assert.strictEqual(admin.body.proposed_by_student_id, people.c.id);
  assert.match(admin.body.description, /Proposition n3beur/);
});
