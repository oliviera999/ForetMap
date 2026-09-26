'use strict';

// « Tâche faite » sans réseau (audit du 25/09/2026, § 1.4.6 et § 2.4 ; migration 299).
//
// La file hors ligne du client rejoue `POST /api/tasks/:id/done` au retour du réseau ; une
// réponse perdue sur le terrain pousse aussi l'élève à renvoyer. Deux garanties :
//   - AVEC rapport (commentaire) : la clé `client_uuid` rend l'envoi idempotent — un seul
//     rapport, la réponse est rejouée (`replayed: true`), même pour deux envois simultanés ;
//   - SANS rapport : le marquage est naturellement idempotent — statut posé une fois, une
//     seule notification « à valider » pour les n3boss.
require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryAll } = require('../database');
const { setStudentPrimaryRole } = require('./helpers/studentRoles');
const { ensureAdminTeacherAuthToken, getAdminTeacherUserId } = require('./helpers/adminAuth');

let teacherToken;
let teacherId;

test.before(async () => {
  await initSchema();
  teacherToken = await ensureAdminTeacherAuthToken();
  teacherId = await getAdminTeacherUserId();
});

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function registerStudent(prefix) {
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      firstName: prefix,
      lastName: `Idem${stamp}`,
      email: `${prefix.toLowerCase()}_${stamp}@example.com`,
      password: 'pass1234',
    })
    .expect(201);
  await setStudentPrimaryRole(res.body.id, 'eleve_avance');
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identifier: res.body.email, password: 'pass1234' })
    .expect(200);
  return { id: res.body.id, token: login.body.authToken };
}

/** Tâche fraîche, avec le n3beur déjà inscrit. */
async function assignedTask(student, extra = {}) {
  const task = (
    await request(app)
      .post('/api/tasks')
      .set(auth(teacherToken))
      .send({
        title: `Tâche idempotence ${Date.now()}`,
        required_students: 1,
        referent_user_ids: [teacherId],
        ...extra,
      })
      .expect(201)
  ).body;
  await request(app)
    .post(`/api/tasks/${task.id}/assign`)
    .set(auth(student.token))
    .send({ studentId: student.id })
    .expect(200);
  return task;
}

const sendDone = (student, taskId, body = {}) =>
  request(app)
    .post(`/api/tasks/${taskId}/done`)
    .set(auth(student.token))
    .send({ studentId: student.id, ...body });

const logsOf = (taskId) =>
  queryAll('SELECT id, comment, client_uuid FROM task_logs WHERE task_id = ?', [taskId]);

/** Les notifications partent sans attendre la réponse : on laisse le temps de les écrire. */
async function doneNotificationsFor(taskId, { settleMs = 400 } = {}) {
  await new Promise((resolve) => setTimeout(resolve, settleMs));
  return queryAll(
    "SELECT id FROM notifications WHERE user_id = ? AND kind = 'task_done' AND target_id = ?",
    [teacherId, taskId],
  );
}

test('avec rapport : un renvoi de la même clé ne publie pas un second rapport', async () => {
  const student = await registerStudent('Rapport');
  const task = await assignedTask(student);
  const uuid = `done-${Date.now()}-a1b2c3`;

  const first = await sendDone(student, task.id, {
    comment: 'Compost retourné',
    client_uuid: uuid,
  }).expect(200);
  assert.strictEqual(first.body.status, 'done');
  assert.strictEqual(first.body.replayed, undefined);

  const again = await sendDone(student, task.id, {
    comment: 'Compost retourné',
    client_uuid: uuid,
  }).expect(200);
  assert.strictEqual(again.body.replayed, true);
  assert.strictEqual(again.body.status, 'done');

  const logs = await logsOf(task.id);
  assert.strictEqual(logs.length, 1, 'un seul rapport malgré le renvoi');
  assert.strictEqual(logs[0].client_uuid, uuid);
  assert.strictEqual((await doneNotificationsFor(task.id)).length, 1);
});

test('avec rapport : deux envois simultanés de la même clé ne font qu’un rapport', async () => {
  const student = await registerStudent('Course');
  const task = await assignedTask(student);
  const uuid = `race-${Date.now()}-d4e5f6`;
  const [r1, r2] = await Promise.all([
    sendDone(student, task.id, { comment: 'Arrosage fait', client_uuid: uuid }),
    sendDone(student, task.id, { comment: 'Arrosage fait', client_uuid: uuid }),
  ]);
  assert.strictEqual(r1.status, 200);
  assert.strictEqual(r2.status, 200);
  assert.strictEqual([r1.body.replayed, r2.body.replayed].filter((v) => v === true).length, 1);
  assert.strictEqual((await logsOf(task.id)).length, 1);
  assert.strictEqual((await doneNotificationsFor(task.id)).length, 1);
});

test('sans rapport : le marquage est naturellement idempotent (une notification)', async () => {
  const student = await registerStudent('Simple');
  const task = await assignedTask(student);
  await sendDone(student, task.id).expect(200);
  const again = await sendDone(student, task.id).expect(200);
  assert.strictEqual(again.body.status, 'done');
  assert.strictEqual((await logsOf(task.id)).length, 0);
  assert.strictEqual((await doneNotificationsFor(task.id)).length, 1);

  // Deux envois simultanés sans rapport : toujours une seule notification.
  const other = await assignedTask(student);
  const results = await Promise.all([sendDone(student, other.id), sendDone(student, other.id)]);
  assert.deepStrictEqual(
    results.map((r) => r.status),
    [200, 200],
  );
  assert.strictEqual((await doneNotificationsFor(other.id)).length, 1);
});

test('mode collectif : un renvoi ne repose pas la part ni ne renotifie', async () => {
  const student = await registerStudent('Collectif');
  const task = await assignedTask(student, {
    required_students: 2,
    completion_mode: 'all_assignees_done',
  });
  await sendDone(student, task.id).expect(200);
  const [assignment] = await queryAll(
    'SELECT done_at FROM task_assignments WHERE task_id = ? AND student_id = ?',
    [task.id, student.id],
  );
  assert.ok(assignment?.done_at, 'part marquée faite');
  await sendDone(student, task.id).expect(200);
  const [after] = await queryAll(
    'SELECT done_at FROM task_assignments WHERE task_id = ? AND student_id = ?',
    [task.id, student.id],
  );
  assert.strictEqual(String(after.done_at), String(assignment.done_at), 'done_at inchangé');
});

test('clé mal formée : 400, rien d’enregistré', async () => {
  const student = await registerStudent('Cle');
  const task = await assignedTask(student);
  await sendDone(student, task.id, { comment: 'x', client_uuid: 'x' }).expect(400);
  await sendDone(student, task.id, { comment: 'x', client_uuid: 'pas une clé !' }).expect(400);
  await sendDone(student, task.id, { comment: 'x', client_uuid: 42 }).expect(400);
  assert.strictEqual((await logsOf(task.id)).length, 0);
});

test('la clé est propre au n3beur : un camarade n’est pas bloqué par elle', async () => {
  const a = await registerStudent('Alpha');
  const b = await registerStudent('Beta');
  const taskA = await assignedTask(a);
  const taskB = await assignedTask(b);
  const uuid = `shared-${Date.now()}-0000`;
  await sendDone(a, taskA.id, { comment: 'Fait', client_uuid: uuid }).expect(200);
  const other = await sendDone(b, taskB.id, { comment: 'Fait aussi', client_uuid: uuid }).expect(
    200,
  );
  assert.strictEqual(other.body.replayed, undefined);
  assert.strictEqual((await logsOf(taskB.id)).length, 1);
});
