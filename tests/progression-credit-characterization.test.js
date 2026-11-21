'use strict';

// Caractérisation de la règle de progression n3beur avant / après son extraction en requête
// partagée (`lib/tasks/progressionCredit.js`, chantier des élèves référents automatiques).
//
// L'ancienne requête de `countValidatedAssignmentsForStudent` est recopiée ici telle quelle
// (référence figée) : pour **tous** les comptes de la base de test, y compris un jeu fictif avec
// une inscription ancienne sans identifiant de compte et deux homonymes, le compteur courant et
// un `COUNT(*)` sur la requête partagée doivent rendre exactement la même valeur.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { initSchema, execute, queryAll, queryOne } = require('../database');
const { countValidatedAssignmentsForStudent } = require('../lib/rbac');
const { progressionCreditedAssignmentsQuery } = require('../lib/tasks/progressionCredit');

const STAMP = crypto.randomUUID().slice(0, 8);
const LAST = `Carac${STAMP}`;
const ids = {
  a: `pc-a-${STAMP}`,
  b: `pc-b-${STAMP}`,
  homonym: `pc-h-${STAMP}`,
  teacher: `pc-t-${STAMP}`,
};
const tasks = [];

/** Requête d'origine (lib/rbac.js avant extraction), recopiée à l'identique. */
async function legacyCount(studentId) {
  const row = await queryOne(
    `SELECT COUNT(*) AS c
       FROM task_assignments ta
       INNER JOIN tasks t ON t.id = ta.task_id
       INNER JOIN users u ON u.id = ? AND u.user_type = 'student'
      WHERE t.status = 'validated'
        AND (ta.student_id = u.id
             OR (ta.student_id IS NULL AND ta.student_first_name = u.first_name
                 AND ta.student_last_name = u.last_name))`,
    [studentId],
  );
  return Number(row?.c || 0);
}

async function sharedCount(studentId) {
  const q = progressionCreditedAssignmentsQuery({ userId: studentId });
  const row = await queryOne(`SELECT COUNT(*) AS c FROM (${q.sql}) pc`, q.params);
  return Number(row?.c || 0);
}

async function addTask(status, extra = {}) {
  const id = `pc-task-${STAMP}-${tasks.length}`;
  tasks.push(id);
  await execute(
    `INSERT INTO tasks (id, title, status, recurrence, recurrence_series_id, validated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      `Caractérisation ${tasks.length}`,
      status,
      extra.recurrence || null,
      extra.seriesId || null,
      status === 'validated' ? '2026-11-01 10:00:00' : null,
    ],
  );
  return id;
}

async function assign(taskId, studentId, firstName, lastName) {
  await execute(
    `INSERT INTO task_assignments (task_id, student_id, student_first_name, student_last_name, assigned_at)
     VALUES (?, ?, ?, ?, '2026-10-01')`,
    [taskId, studentId, firstName, lastName],
  );
}

before(async () => {
  await initSchema();
  const users = [
    [ids.a, 'student', 'Alpha', LAST],
    [ids.b, 'student', 'Bravo', LAST],
    [ids.homonym, 'student', 'Alpha', LAST],
    [ids.teacher, 'teacher', 'Tango', LAST],
  ];
  for (const [id, type, fn, ln] of users) {
    await execute(
      'INSERT INTO users (id, user_type, first_name, last_name, is_active) VALUES (?, ?, ?, ?, 1)',
      [id, type, fn, ln],
    );
  }
  const v1 = await addTask('validated', { recurrence: 'weekly', seriesId: `pc-s-${STAMP}` });
  const v2 = await addTask('validated', { recurrence: 'weekly', seriesId: `pc-s-${STAMP}` });
  const v3 = await addTask('validated');
  const open = await addTask('available');
  await assign(v1, ids.a, 'Alpha', LAST);
  await assign(v2, ids.a, 'Alpha', LAST);
  await assign(v3, ids.b, 'Bravo', LAST);
  await assign(open, ids.b, 'Bravo', LAST);
  // Inscription ancienne sans identifiant : reconnue par le nom (Alpha et son homonyme).
  await assign(v3, null, 'Alpha', LAST);
  // Le professeur n'est jamais compté.
  await assign(v1, ids.teacher, 'Tango', LAST);
});

after(async () => {
  for (const id of tasks) await execute('DELETE FROM tasks WHERE id = ?', [id]);
  for (const id of Object.values(ids)) await execute('DELETE FROM users WHERE id = ?', [id]);
});

test('jeu fictif : valeurs attendues (identifiant, nom hérité, homonyme, professeur)', async () => {
  assert.equal(await legacyCount(ids.a), 3);
  assert.equal(await legacyCount(ids.b), 1);
  assert.equal(await legacyCount(ids.homonym), 1, 'ligne héritée seule');
  assert.equal(await legacyCount(ids.teacher), 0);
});

test('tous les comptes de la base : compteur courant = référence figée = requête partagée', async () => {
  const users = await queryAll('SELECT id FROM users');
  assert.ok(users.length >= 4);
  for (const { id } of users) {
    const expected = await legacyCount(id);
    assert.equal(await countValidatedAssignmentsForStudent(id), expected, `compteur ${id}`);
    assert.equal(await sharedCount(id), expected, `requête partagée ${id}`);
  }
});

test('requête partagée : filtres série et récurrentes, colonnes attendues', async () => {
  const q = progressionCreditedAssignmentsQuery({
    recurringOnly: true,
    seriesId: `pc-s-${STAMP}`,
  });
  const rows = await queryAll(
    `SELECT user_id, series_id, COUNT(DISTINCT task_id) AS n FROM (${q.sql}) pc GROUP BY user_id, series_id`,
    q.params,
  );
  assert.deepEqual(
    rows.map((r) => [r.user_id, r.series_id, Number(r.n)]),
    [[ids.a, `pc-s-${STAMP}`, 2]],
  );
});

test('sans élève : aucun crédit (comme l’ancienne jointure u.id = NULL)', async () => {
  assert.equal(await countValidatedAssignmentsForStudent(null), 0);
  assert.equal(await countValidatedAssignmentsForStudent(''), 0);
});
