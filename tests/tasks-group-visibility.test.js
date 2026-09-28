require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const request = require('supertest');
const { initDatabase, initSchema, queryOne, execute } = require('../database');
const { setSetting } = require('../lib/settings');
const { setAssignedRole } = require('../lib/effectiveRole');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { app } = require('../server');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');

/**
 * Audit RGPD du 28/09/2026 (S-2, S-3) : un n3beur ne voit les noms des inscrits et le
 * journal d'une tâche que selon `tasks.assignees_visibility` et `tasks.logs_visibility`.
 *
 * Groupes créés à la main (et non via le groupe partagé des helpers de rôle, qui rend tous
 * les novices de test camarades) : A et B dans G1, C dans G2, D dans G1 sans inscription.
 */

const SETTING_KEYS = ['tasks.assignees_visibility', 'tasks.logs_visibility'];
const snapshots = [];
const suffix = Date.now();
let adminToken;
let taskId;
const people = {};

async function createGroup(label) {
  const id = crypto.randomUUID();
  await execute(
    "INSERT INTO `groups` (id, slug, name, kind, default_role_id, is_active) VALUES (?, ?, ?, 'class', NULL, 1)",
    [id, `rgpd-vis-${label}-${suffix}`, `RGPD visibilité ${label} ${suffix}`],
  );
  return id;
}

async function createStudent(label, groupId) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ firstName: `Vis${label}`, lastName: `Rgpd${suffix}`, password: 'pass1234' })
    .expect(201);
  const role = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_novice' LIMIT 1");
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

async function staffAction(path, student, extra = {}) {
  await request(app)
    .post(`/api/tasks/${taskId}/${path}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      firstName: student.firstName,
      lastName: student.lastName,
      studentId: student.id,
      ...extra,
    })
    .expect(200);
}

function firstNames(rows) {
  return (rows || []).map((r) => r.student_first_name).sort();
}

async function listRowFor(student) {
  const res = await request(app)
    .get('/api/tasks')
    .set('Authorization', `Bearer ${student.token}`)
    .expect(200);
  return res.body.find((t) => t.id === taskId);
}

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  for (const key of SETTING_KEYS) snapshots.push(await snapshotSetting(key));
  adminToken = await ensureAdminTeacherAuthToken({ elevated: true });

  const g1 = await createGroup('g1');
  const g2 = await createGroup('g2');
  people.a = await createStudent('A', g1);
  people.b = await createStudent('B', g1);
  people.c = await createStudent('C', g2);
  people.d = await createStudent('D', g1);

  const zones = await request(app).get('/api/zones').expect(200);
  const taskRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      title: `Visibilité RGPD ${suffix}`,
      zone_id: zones.body[0]?.id || 'pg',
      required_students: 3,
    })
    .expect(201);
  taskId = taskRes.body.id;

  for (const s of [people.a, people.b, people.c]) await staffAction('assign', s);
  for (const s of [people.a, people.b, people.c]) {
    await staffAction('done', s, { comment: `Rapport ${s.firstName}` });
  }
});

test.after(async () => {
  for (const snap of snapshots) await restoreSetting(snap);
});

test('inscrits : mode group (défaut) → soi et ses camarades, compteurs intacts', async () => {
  await setSetting('tasks.assignees_visibility', 'group', {});
  const row = await listRowFor(people.a);
  assert.deepStrictEqual(firstNames(row.assignments), ['VisA', 'VisB']);
  assert.strictEqual(row.assigned_count, 3);
  const own = row.assignments.find((r) => r.student_first_name === 'VisA');
  assert.strictEqual(own.student_id, people.a.id);
  const peer = row.assignments.find((r) => r.student_first_name === 'VisB');
  assert.strictEqual(peer.student_id, undefined);

  const detail = await request(app)
    .get(`/api/tasks/${taskId}`)
    .set('Authorization', `Bearer ${people.a.token}`)
    .expect(200);
  assert.deepStrictEqual(firstNames(detail.body.assignments), ['VisA', 'VisB']);
  assert.strictEqual(detail.body.assigned_count, 3);

  const cRow = await listRowFor(people.c);
  assert.deepStrictEqual(firstNames(cRow.assignments), ['VisC']);
});

test('inscrits : mode self → sa seule inscription', async () => {
  await setSetting('tasks.assignees_visibility', 'self', {});
  const row = await listRowFor(people.a);
  assert.deepStrictEqual(firstNames(row.assignments), ['VisA']);
  const detail = await request(app)
    .get(`/api/tasks/${taskId}`)
    .set('Authorization', `Bearer ${people.d.token}`)
    .expect(200);
  assert.deepStrictEqual(detail.body.assignments, []);
});

test('inscrits : mode all → comportement historique', async () => {
  await setSetting('tasks.assignees_visibility', 'all', {});
  const row = await listRowFor(people.a);
  assert.deepStrictEqual(firstNames(row.assignments), ['VisA', 'VisB', 'VisC']);
});

test('inscrits : anonyme en mode group → aucun nom', async () => {
  await setSetting('tasks.assignees_visibility', 'group', {});
  const detail = await request(app).get(`/api/tasks/${taskId}`).expect(200);
  assert.deepStrictEqual(detail.body.assignments, []);
});

test('inscrits : le personnel voit toujours tout', async () => {
  await setSetting('tasks.assignees_visibility', 'self', {});
  const detail = await request(app)
    .get(`/api/tasks/${taskId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(detail.body.assignments.length, 3);
});

test('journal : mode group → entrées de ses camarades et les siennes', async () => {
  await setSetting('tasks.logs_visibility', 'group', {});
  const res = await request(app)
    .get(`/api/tasks/${taskId}/logs`)
    .set('Authorization', `Bearer ${people.a.token}`)
    .expect(200);
  assert.deepStrictEqual(firstNames(res.body), ['VisA', 'VisB']);

  const cLog = await queryOne('SELECT id FROM task_logs WHERE task_id = ? AND student_id = ?', [
    taskId,
    people.c.id,
  ]);
  await request(app)
    .get(`/api/tasks/${taskId}/logs/${cLog.id}/image`)
    .set('Authorization', `Bearer ${people.a.token}`)
    .expect(403);
  const bLog = await queryOne('SELECT id FROM task_logs WHERE task_id = ? AND student_id = ?', [
    taskId,
    people.b.id,
  ]);
  await request(app)
    .get(`/api/tasks/${taskId}/logs/${bLog.id}/image`)
    .set('Authorization', `Bearer ${people.a.token}`)
    .expect(404);
});

test('journal : mode assignees → réservé aux inscrits, qui lisent tout', async () => {
  await setSetting('tasks.logs_visibility', 'assignees', {});
  await request(app)
    .get(`/api/tasks/${taskId}/logs`)
    .set('Authorization', `Bearer ${people.d.token}`)
    .expect(403);
  const res = await request(app)
    .get(`/api/tasks/${taskId}/logs`)
    .set('Authorization', `Bearer ${people.a.token}`)
    .expect(200);
  assert.strictEqual(res.body.length, 3);
});

test('journal : mode all → tout compte connecté non visiteur', async () => {
  await setSetting('tasks.logs_visibility', 'all', {});
  const res = await request(app)
    .get(`/api/tasks/${taskId}/logs`)
    .set('Authorization', `Bearer ${people.d.token}`)
    .expect(200);
  assert.strictEqual(res.body.length, 3);
});

test('journal : anonyme toujours refusé', async () => {
  await request(app).get(`/api/tasks/${taskId}/logs`).expect(403);
});
