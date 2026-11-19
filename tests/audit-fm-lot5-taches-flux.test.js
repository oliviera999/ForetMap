'use strict';

/**
 * Audit ForetMap du 19/11/2026, lot 5 — flux d'une tâche :
 *
 *   - T2  : s'inscrire sur une tâche « proposée » ou « faite » est refusé, et le « fait » ne
 *           fait pas avancer une proposition (ni, donc, le badge « Semeur d'idées ») ;
 *   - T5  : commentaire du « fait » borné (chaîne de 5 000 caractères au plus, `code` stable) ;
 *   - T7  : double validation simultanée → une seule passe, l'autre 400 sans effet de bord ;
 *   - T8  : `PUT /api/tasks/:id` contrôle les droits avant de réserver `edit_revision` ;
 *   - T10 : le plafond de tâches actives est recompté sous verrou (inscriptions simultanées).
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, initDatabase, execute, queryOne, queryAll } = require('../database');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { setSetting } = require('../lib/settings');
const { createMetricContext } = require('../lib/rewards/metrics');
const { queryAll: qa, queryOne: qo } = require('../database');
const { setStudentPrimaryRole } = require('./helpers/studentRoles');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');

const stamp = Date.now();
let adminToken;
let zoneId;
const snapshots = [];
const createdTaskIds = [];

async function registerStudent(label, roleSlug = 'eleve_avance') {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ firstName: `Lot5${label}`, lastName: `Flux${stamp}`, password: 'pass1234' });
  assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  await setStudentPrimaryRole(res.body.id, roleSlug);
  return { id: res.body.id, token: res.body.authToken };
}

async function createTask(title, extra = {}) {
  const res = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: `${title} ${stamp}`, zone_id: zoneId, required_students: 3, ...extra })
    .expect(201);
  createdTaskIds.push(res.body.id);
  return res.body.id;
}

function asStudent(student, method, path, body = {}) {
  return request(app)[method](path).set('Authorization', `Bearer ${student.token}`).send(body);
}

before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  snapshots.push(await snapshotSetting('tasks.student_max_active_assignments'));
  await setSetting('tasks.student_max_active_assignments', 0, {});
  adminToken = await ensureAdminTeacherAuthToken();
  zoneId = (await queryOne('SELECT id FROM zones LIMIT 1'))?.id || null;
});

after(async () => {
  for (const snap of snapshots) await restoreSetting(snap);
  for (const id of createdTaskIds) {
    await execute('DELETE FROM task_logs WHERE task_id = ?', [id]);
    await execute('DELETE FROM task_assignments WHERE task_id = ?', [id]);
  }
});

test('T2 — proposer, s’inscrire, marquer fait : la proposition reste « proposée », pas de badge', async () => {
  const student = await registerStudent('Semeur');
  for (let i = 0; i < 2; i += 1) {
    const prop = await asStudent(student, 'post', '/api/tasks/proposals', {
      title: `Idée lot5 ${i} ${stamp}`,
      zone_id: zoneId,
    });
    assert.strictEqual(prop.status, 201, JSON.stringify(prop.body));
    const taskId = prop.body.id;
    createdTaskIds.push(taskId);
    assert.strictEqual(prop.body.status, 'proposed');

    const assign = await asStudent(student, 'post', `/api/tasks/${taskId}/assign`);
    assert.strictEqual(assign.status, 400);
    assert.strictEqual(assign.body.code, 'task_proposed');
    assert.match(assign.body.error, /Idée encore en discussion/);

    // Même avec une inscription déjà en base (prof, données anciennes) : pas de « fait ».
    await execute(
      `INSERT INTO task_assignments (task_id, student_id, student_first_name, student_last_name, assigned_at)
       VALUES (?, ?, 'Lot5Semeur', ?, NOW())`,
      [taskId, student.id, `Flux${stamp}`],
    );
    const done = await asStudent(student, 'post', `/api/tasks/${taskId}/done`, {
      comment: 'fini',
    });
    assert.strictEqual(done.status, 400);
    assert.strictEqual(done.body.code, 'task_proposed');
    const row = await queryOne('SELECT status FROM tasks WHERE id = ?', [taskId]);
    assert.strictEqual(row.status, 'proposed');
  }
  const ctx = createMetricContext({ queryAll: qa, queryOne: qo }, student.id);
  assert.strictEqual(await ctx.value('semeur'), 0, 'aucun « Semeur d’idées » par ce chemin');
});

test('T2 — tâche déjà « faite » : un élève qui n’a rien fait ne peut plus s’y inscrire', async () => {
  const a = await registerStudent('FaitA');
  const b = await registerStudent('FaitB');
  const taskId = await createTask('Faite lot5');
  await asStudent(a, 'post', `/api/tasks/${taskId}/assign`).expect(200);
  await asStudent(a, 'post', `/api/tasks/${taskId}/done`).expect(200);
  const late = await asStudent(b, 'post', `/api/tasks/${taskId}/assign`);
  assert.strictEqual(late.status, 400);
  assert.strictEqual(late.body.code, 'task_done');
  assert.strictEqual(late.body.error, 'C’est déjà plié pour celle-ci');
  const rows = await queryAll('SELECT student_id FROM task_assignments WHERE task_id = ?', [
    taskId,
  ]);
  assert.deepStrictEqual(
    rows.map((r) => r.student_id),
    [a.id],
  );
});

test('T2 — claimAssignmentSeat refuse proposed et done sous le verrou', async () => {
  const { claimAssignmentSeat } = require('../lib/tasks/assignmentSeat');
  for (const status of ['proposed', 'done']) {
    const tx = {
      queryOne: async (sql) =>
        /FROM tasks/.test(sql)
          ? { id: 't', status, completion_mode: 'single_done', required_students: 3 }
          : { c: 0 },
      execute: async () => {
        throw new Error('aucune écriture attendue');
      },
    };
    const out = await claimAssignmentSeat(tx, {
      taskId: 't',
      studentId: 's',
      firstName: 'A',
      lastName: 'B',
      assignedAt: '2026-11-19 10:00:00',
    });
    assert.deepStrictEqual(out, { ok: false, reason: status });
  }
});

test('T5 — commentaire du « fait » : texte de 5 000 caractères au plus', async () => {
  const student = await registerStudent('Comment');
  const taskId = await createTask('Commentaire lot5');
  await asStudent(student, 'post', `/api/tasks/${taskId}/assign`).expect(200);

  const tooLong = await asStudent(student, 'post', `/api/tasks/${taskId}/done`, {
    comment: 'x'.repeat(70000),
  });
  assert.strictEqual(tooLong.status, 400);
  assert.strictEqual(tooLong.body.code, 'comment_too_long');

  const notText = await asStudent(student, 'post', `/api/tasks/${taskId}/done`, {
    comment: { a: 1 },
  });
  assert.strictEqual(notText.status, 400);
  assert.strictEqual(notText.body.code, 'comment_invalid');

  const logs = await queryAll('SELECT id FROM task_logs WHERE task_id = ?', [taskId]);
  assert.strictEqual(logs.length, 0, 'aucun rapport écrit sur un refus');
  assert.strictEqual(
    (await queryOne('SELECT status FROM tasks WHERE id = ?', [taskId])).status,
    'in_progress',
  );

  await asStudent(student, 'post', `/api/tasks/${taskId}/done`, {
    comment: 'y'.repeat(5000),
  }).expect(200);
  const stored = await queryOne('SELECT comment FROM task_logs WHERE task_id = ?', [taskId]);
  assert.strictEqual(stored.comment.length, 5000);
});

test('T7 — double validation simultanée : une seule passe, l’autre 400 sans effet', async () => {
  const taskId = await createTask('Double validation lot5');
  const validate = () =>
    request(app)
      .post(`/api/tasks/${taskId}/validate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
  const results = await Promise.all([validate(), validate(), validate()]);
  const statuses = results.map((r) => r.status).sort();
  assert.deepStrictEqual(statuses, [200, 400, 400], JSON.stringify(results.map((r) => r.body)));
  const audits = await queryOne(
    "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'validate_task' AND target_id = ?",
    [taskId],
  );
  assert.strictEqual(Number(audits.n), 1, 'un seul audit « validate_task »');
});

test('T8 — PUT refusé : 403 avant toute réservation de révision (pas de 409 à tort)', async () => {
  const intruder = await registerStudent('Intrus');
  const taskId = await createTask('Révision lot5');
  const before = await queryOne('SELECT edit_revision FROM tasks WHERE id = ?', [taskId]);
  // Révision périmée : avant le correctif, le refus était un 409 `edit_conflict` (réservation
  // tentée avant le contrôle des droits) ; c'est un 403, et la révision ne bouge pas.
  const stale = await asStudent(intruder, 'put', `/api/tasks/${taskId}`, {
    title: 'Pirate',
    expected_revision: Number(before.edit_revision) + 7,
  });
  assert.strictEqual(stale.status, 403, JSON.stringify(stale.body));
  const ok = await asStudent(intruder, 'put', `/api/tasks/${taskId}`, {
    title: 'Pirate',
    expected_revision: Number(before.edit_revision),
  });
  assert.strictEqual(ok.status, 403);
  const after = await queryOne('SELECT edit_revision, title FROM tasks WHERE id = ?', [taskId]);
  assert.strictEqual(Number(after.edit_revision), Number(before.edit_revision));
  assert.notStrictEqual(after.title, 'Pirate');

  // Un enregistrement légitime avec la bonne révision passe toujours.
  await request(app)
    .put(`/api/tasks/${taskId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: `Révision lot5 ok ${stamp}`, expected_revision: Number(before.edit_revision) })
    .expect(200);
});

test('T10 — plafond de tâches actives : des inscriptions simultanées ne le dépassent pas', async () => {
  await setSetting('tasks.student_max_active_assignments', 1, {});
  try {
    const student = await registerStudent('Plafond');
    const ids = [];
    for (let i = 0; i < 4; i += 1) ids.push(await createTask(`Plafond lot5 ${i}`));
    const results = await Promise.all(
      ids.map((id) => asStudent(student, 'post', `/api/tasks/${id}/assign`)),
    );
    const ok = results.filter((r) => r.status === 200);
    assert.strictEqual(ok.length, 1, JSON.stringify(results.map((r) => [r.status, r.body.code])));
    for (const r of results.filter((x) => x.status !== 200)) {
      assert.strictEqual(r.body.code, 'TASK_ENROLLMENT_LIMIT');
    }
    const count = await queryOne(
      `SELECT COUNT(*) AS n FROM task_assignments WHERE student_id = ? AND task_id IN (${ids
        .map(() => '?')
        .join(',')})`,
      [student.id, ...ids],
    );
    assert.strictEqual(Number(count.n), 1);
  } finally {
    await setSetting('tasks.student_max_active_assignments', 0, {});
  }
});
