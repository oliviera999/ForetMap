'use strict';

/**
 * Inscription à une tâche : le statut est relu **sous le verrou** de la ligne `tasks`.
 *
 * Les gardes en tête de route (`task.status === 'validated'`, `on_hold`) reposent sur une
 * lecture faite AVANT la transaction. Entre cette lecture et l'INSERT, un n3boss peut
 * valider ou mettre la tâche en attente : l'inscription passait alors, et le recalcul de
 * statut repartait de l'objet `task` périmé. La relecture sous `FOR UPDATE` referme la
 * fenêtre — et le recalcul part de la ligne verrouillée, donc de l'état réel.
 *
 * Complément unitaire : `computeTaskStatusFromProgress` / `recalculateTaskStatusWithConn`
 * protègent `validated`, et l'écriture est conditionnée à l'état lu (compare-and-set).
 */

require('./helpers/setup');
require('dotenv').config();
const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureRbacBootstrap } = require('../lib/rbac');
const {
  computeTaskStatusFromProgress,
  recalculateTaskStatusWithConn,
} = require('../lib/taskStatusRecalc');
const { claimAssignmentSeat } = require('../lib/tasks/assignmentSeat');

const stamp = Date.now();
const student = { firstName: `Lock${stamp}`, lastName: 'Statut' };

let teacherToken;
let studentId;

async function setStudentPrimaryRole(userId, roleSlug) {
  const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [roleSlug]);
  assert.ok(role?.id, `Rôle introuvable: ${roleSlug}`);
  await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', [
    'student',
    userId,
  ]);
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
    ['student', userId, role.id],
  );
}

async function createTask(title) {
  const res = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ title, required_students: 2 })
    .expect(201);
  return res.body.id;
}

function assignAsTeacher(taskId) {
  return request(app)
    .post(`/api/tasks/${taskId}/assign`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ studentId });
}

before(async () => {
  await initSchema();
  await ensureRbacBootstrap();
  const loginEmail = String(process.env.TEACHER_ADMIN_EMAIL || '').trim();
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [loginEmail],
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(teacher?.id, 'Compte admin enseignant introuvable');
  assert.ok(adminRole?.id, 'Rôle admin introuvable');
  await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', [
    'teacher',
    teacher.id,
  ]);
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
    ['teacher', teacher.id, adminRole.id],
  );
  teacherToken = await signAuthToken({
    userType: 'teacher',
    userId: teacher.id,
    canonicalUserId: teacher.id,
    roleId: adminRole.id,
    roleSlug: 'admin',
    roleDisplayName: 'Administrateur',
  });

  const reg = await request(app)
    .post('/api/auth/register')
    .send({ ...student, password: 'pass123' });
  assert.strictEqual(reg.status, 201, `inscription: ${JSON.stringify(reg.body)}`);
  studentId = reg.body.id;
  await setStudentPrimaryRole(studentId, 'eleve_novice');
});

describe('inscription : statut relu sous verrou', () => {
  it('refuse une tâche validée entre la lecture initiale et l’INSERT', async () => {
    const taskId = await createTask('Verrou statut validated');
    // Écriture directe : on simule la validation arrivée juste après la lecture de route.
    await execute('UPDATE tasks SET status = ? WHERE id = ?', ['validated', taskId]);

    const res = await assignAsTeacher(taskId);
    assert.strictEqual(res.status, 400, `réponse: ${JSON.stringify(res.body)}`);
    assert.match(String(res.body.error || ''), /validée/i);

    const rows = await queryAll('SELECT id FROM task_assignments WHERE task_id = ?', [taskId]);
    assert.strictEqual(rows.length, 0, 'aucune inscription ne doit être créée');
    const after = await queryOne('SELECT status FROM tasks WHERE id = ?', [taskId]);
    assert.strictEqual(after.status, 'validated', 'la validation ne doit pas être écrasée');
  });

  it('refuse une tâche mise en attente entre la lecture initiale et l’INSERT', async () => {
    const taskId = await createTask('Verrou statut on_hold');
    await execute('UPDATE tasks SET status = ? WHERE id = ?', ['on_hold', taskId]);

    const res = await assignAsTeacher(taskId);
    assert.strictEqual(res.status, 400, `réponse: ${JSON.stringify(res.body)}`);
    assert.match(String(res.body.error || ''), /attente/i);

    const rows = await queryAll('SELECT id FROM task_assignments WHERE task_id = ?', [taskId]);
    assert.strictEqual(rows.length, 0, 'aucune inscription ne doit être créée');
    const after = await queryOne('SELECT status FROM tasks WHERE id = ?', [taskId]);
    assert.strictEqual(after.status, 'on_hold', 'la mise en attente ne doit pas être écrasée');
  });

  it('laisse passer une tâche disponible et recalcule le statut', async () => {
    const taskId = await createTask('Verrou statut disponible');
    const res = await assignAsTeacher(taskId);
    assert.strictEqual(res.status, 200, `réponse: ${JSON.stringify(res.body)}`);
    const after = await queryOne('SELECT status FROM tasks WHERE id = ?', [taskId]);
    assert.strictEqual(after.status, 'in_progress');
  });
});

describe('claimAssignmentSeat : la course lecture-de-route / validation', () => {
  /**
   * `tx` factice. `lockedStatus` est ce que la ligne `tasks` porte AU MOMENT du
   * `SELECT … FOR UPDATE` — c'est-à-dire APRÈS la lecture de route : c'est très
   * exactement la fenêtre que le verrou doit refermer.
   */
  function fakeTx({ lockedStatus, assignedCount = 0, requiredStudents = 2, missing = false }) {
    const executes = [];
    const tx = {
      queryOne: async (sql) => {
        if (/FROM tasks WHERE id = \? FOR UPDATE/i.test(sql)) {
          return missing
            ? null
            : {
                id: 't1',
                status: lockedStatus,
                completion_mode: 'single_done',
                required_students: requiredStudents,
              };
        }
        if (/COUNT\(\*\) AS c FROM task_assignments/i.test(sql)) return { c: assignedCount };
        if (/FROM task_assignments/i.test(sql)) {
          return { assigned_count: assignedCount + 1, done_count: 0 };
        }
        return null;
      },
      execute: async (sql, params) => {
        executes.push({ sql, params });
        return { affectedRows: 1, insertId: 1 };
      },
    };
    return { tx, executes };
  }

  const seatParams = {
    taskId: 't1',
    studentId: 42,
    firstName: 'Ada',
    lastName: 'Lovelace',
    assignedAt: '2026-01-01T00:00:00.000Z',
  };

  it('refuse quand la tâche a été validée après la lecture de route', async () => {
    const { tx, executes } = fakeTx({ lockedStatus: 'validated' });
    const outcome = await claimAssignmentSeat(tx, seatParams);
    assert.deepStrictEqual(outcome, { ok: false, reason: 'validated' });
    assert.strictEqual(executes.length, 0, 'ni INSERT ni UPDATE de statut');
  });

  it('refuse quand la tâche a été mise en attente après la lecture de route', async () => {
    const { tx, executes } = fakeTx({ lockedStatus: 'on_hold' });
    const outcome = await claimAssignmentSeat(tx, seatParams);
    assert.deepStrictEqual(outcome, { ok: false, reason: 'on_hold' });
    assert.strictEqual(executes.length, 0, 'ni INSERT ni UPDATE de statut');
  });

  it('refuse quand la dernière place a été prise entre-temps', async () => {
    const { tx, executes } = fakeTx({
      lockedStatus: 'available',
      assignedCount: 2,
      requiredStudents: 2,
    });
    const outcome = await claimAssignmentSeat(tx, seatParams);
    assert.deepStrictEqual(outcome, { ok: false, reason: 'full' });
    assert.strictEqual(executes.length, 0, 'aucune insertion au-delà de la capacité');
  });

  it('refuse quand la tâche a disparu', async () => {
    const { tx } = fakeTx({ lockedStatus: 'available', missing: true });
    assert.deepStrictEqual(await claimAssignmentSeat(tx, seatParams), {
      ok: false,
      reason: 'missing',
    });
  });

  it('insère et recalcule le statut depuis la ligne verrouillée', async () => {
    const { tx, executes } = fakeTx({ lockedStatus: 'available' });
    const outcome = await claimAssignmentSeat(tx, seatParams);
    assert.deepStrictEqual(outcome, { ok: true, status: 'in_progress' });
    assert.match(String(executes[0].sql), /INSERT INTO task_assignments/i);
    assert.deepStrictEqual(executes[0].params, [
      't1',
      42,
      'Ada',
      'Lovelace',
      '2026-01-01T00:00:00.000Z',
    ]);
    assert.match(String(executes[1].sql), /UPDATE tasks SET status/i);
    assert.deepStrictEqual(executes[1].params, ['in_progress', 't1', 'available']);
  });
});

describe('recalcul de statut : garde-fous unitaires', () => {
  it('préserve validated même si assignedCount > 0', () => {
    assert.strictEqual(
      computeTaskStatusFromProgress({
        currentStatus: 'validated',
        completionMode: 'single_done',
        assignedCount: 2,
        doneCount: 0,
      }),
      'validated',
    );
  });

  it('n’émet aucun UPDATE quand le statut lu sous verrou est validated', async () => {
    const executes = [];
    const conn = {
      queryOne: async (sql) => {
        if (/FROM tasks/i.test(sql)) {
          return { id: 't1', status: 'validated', completion_mode: 'single_done' };
        }
        if (/FROM task_assignments/i.test(sql)) return { assigned_count: 1, done_count: 0 };
        return null;
      },
      execute: async (sql, params) => {
        executes.push({ sql, params });
        return { affectedRows: 1 };
      },
    };
    const result = await recalculateTaskStatusWithConn(conn, 't1');
    assert.strictEqual(result.status, 'validated');
    assert.strictEqual(executes.length, 0, 'aucun UPDATE tasks.status attendu');
  });

  it('conditionne l’écriture à l’état lu (compare-and-set) sur un objet task périmé', async () => {
    const executes = [];
    const staleTask = { id: 't1', status: 'available', completion_mode: 'single_done' };
    const conn = {
      queryOne: async (sql) => {
        if (/FROM task_assignments/i.test(sql)) return { assigned_count: 1, done_count: 0 };
        return null;
      },
      execute: async (sql, params) => {
        executes.push({ sql, params });
        return { affectedRows: 1 };
      },
    };
    const result = await recalculateTaskStatusWithConn(conn, staleTask);
    assert.strictEqual(result.status, 'in_progress');
    assert.strictEqual(executes.length, 1);
    assert.match(String(executes[0].sql), /UPDATE tasks SET status = \? WHERE id = \? AND status/i);
    assert.deepStrictEqual(
      executes[0].params,
      ['in_progress', 't1', 'available'],
      'l’UPDATE ne s’applique que si le statut est resté celui qui a été lu',
    );
  });
});
