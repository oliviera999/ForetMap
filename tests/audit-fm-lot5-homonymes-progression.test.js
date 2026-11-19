'use strict';

/**
 * Audit ForetMap du 19/11/2026, lot 5 — T1 : deux homonymes ne se comptent plus mutuellement
 * dans la progression n3beur ni dans les statistiques.
 *
 * Le correctif « homonymes » (`lib/tasks/assignmentIdentityMatch.js`) n'avait pas été porté à
 * quatre requêtes (`countValidatedAssignmentsForStudent`, `syncProgressionForValidatedTask`,
 * `fetchAssignmentStatusCountsByStudent`, `listStudentTaskAssignments`). Scénario de rejeu :
 * A et B s'appellent « Lucas X », tous deux novices ; cinq tâches de B sont validées, A n'en a
 * aucune. A passait `eleve_avance` et `GET /api/stats/me/A` listait les tâches de B.
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, initDatabase, execute, queryOne } = require('../database');
const {
  ensureRbacBootstrap,
  countValidatedAssignmentsForStudent,
  syncProgressionForValidatedTask,
  getPrimaryRoleForUser,
} = require('../lib/rbac');
const {
  fetchAssignmentStatusCountsByStudent,
  listStudentTaskAssignments,
} = require('../lib/stats/statsReadModel');
const { setStudentPrimaryRole } = require('./helpers/studentRoles');
const { restoreDefaultProgressionThresholds } = require('./helpers/progressionThresholds');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

const stamp = Date.now();
const FIRST = 'Lucas';
const LAST = `X${stamp}`;

let a;
let b;
let adminToken;
const taskIds = [];

/** Homonyme créé directement en base (l'inscription publique refuse un nom déjà pris, mais
 * l'import Moodle et le pont G&L, eux, ne contrôlent pas le nom). */
async function insertHomonym() {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO users (id, user_type, first_name, last_name, display_name, password_hash,
                        auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', ?, ?, ?, 'x', 'local', 1, NOW(), NOW())`,
    [id, FIRST, LAST, `${FIRST} ${LAST}`],
  );
  await setStudentPrimaryRole(id, 'eleve_novice');
  return { id };
}

async function registerStudent() {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ firstName: FIRST, lastName: LAST, password: 'pass1234' });
  assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  await setStudentPrimaryRole(res.body.id, 'eleve_novice');
  return { id: res.body.id, token: res.body.authToken };
}

async function validatedTaskFor(studentId, label) {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO tasks (id, title, description, map_id, required_students, status, validated_at, created_at)
     VALUES (?, ?, '', 'foret', 1, 'validated', NOW(), NOW())`,
    [id, `Homonyme lot5 ${label} ${stamp}`],
  );
  await execute(
    `INSERT INTO task_assignments (task_id, student_id, student_first_name, student_last_name, assigned_at)
     VALUES (?, ?, ?, ?, NOW())`,
    [id, studentId, FIRST, LAST],
  );
  taskIds.push(id);
  return id;
}

before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  await restoreDefaultProgressionThresholds();
  adminToken = await ensureAdminTeacherAuthToken();
  a = await registerStudent();
  b = await insertHomonym();
  for (let i = 0; i < 5; i += 1) await validatedTaskFor(b.id, `B${i}`);
});

after(async () => {
  for (const id of taskIds) {
    await execute('DELETE FROM task_assignments WHERE task_id = ?', [id]);
    await execute('DELETE FROM tasks WHERE id = ?', [id]);
  }
});

test('T1 — progression : les 5 tâches validées de B ne comptent pas pour A', async () => {
  assert.strictEqual(await countValidatedAssignmentsForStudent(b.id), 5);
  assert.strictEqual(await countValidatedAssignmentsForStudent(a.id), 0);

  // La synchronisation après validation ne doit toucher que B.
  await syncProgressionForValidatedTask(taskIds[0]);
  const roleA = await getPrimaryRoleForUser('student', a.id);
  assert.strictEqual(roleA?.slug, 'eleve_novice', 'A ne change pas de palier');
});

test('T1 — stats : compteurs et liste d’inscriptions sans les tâches de l’homonyme', async () => {
  const counts = await fetchAssignmentStatusCountsByStudent({
    all: false,
    studentIds: [a.id, b.id],
  });
  assert.strictEqual(counts.get(String(b.id))?.done, 5);
  assert.strictEqual(counts.get(String(a.id)), undefined, 'A n’a aucune inscription');

  const rowA = await queryOne('SELECT id, first_name, last_name FROM users WHERE id = ?', [a.id]);
  assert.deepStrictEqual(await listStudentTaskAssignments(rowA), []);

  const me = await request(app)
    .get(`/api/stats/me/${a.id}`)
    .set('Authorization', `Bearer ${a.token}`)
    .expect(200);
  assert.strictEqual(me.body.stats?.done ?? 0, 0, JSON.stringify(me.body.stats));
  assert.deepStrictEqual(me.body.assignments || [], []);

  const all = await request(app)
    .get('/api/stats/all')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const entryA = (all.body.students || all.body || []).find((s) => String(s.id) === a.id);
  assert.ok(entryA, 'A figure dans la vue prof');
  assert.strictEqual(entryA.stats?.done ?? 0, 0);
});

test('T1 — une inscription héritée sans identifiant reste reconnue par le nom', async () => {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO tasks (id, title, description, map_id, required_students, status, validated_at, created_at)
     VALUES (?, ?, '', 'foret', 1, 'validated', NOW(), NOW())`,
    [id, `Homonyme lot5 legacy ${stamp}`],
  );
  await execute(
    `INSERT INTO task_assignments (task_id, student_id, student_first_name, student_last_name, assigned_at)
     VALUES (?, NULL, ?, ?, NOW())`,
    [id, FIRST, LAST],
  );
  taskIds.push(id);
  // Ligne héritée : rattachée par le nom aux deux homonymes, comme avant le correctif.
  assert.strictEqual(await countValidatedAssignmentsForStudent(a.id), 1);
  assert.strictEqual(await countValidatedAssignmentsForStudent(b.id), 6);
});
