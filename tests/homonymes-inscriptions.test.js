'use strict';

/**
 * Deux élèves homonymes ne partagent ni leur quota, ni leurs inscriptions, ni leurs
 * journaux.
 *
 * `task_assignments` et `task_logs` portent à la fois `student_id` et le nom, l'identifiant
 * étant arrivé plus tard. La condition historique — `student_id = ? OR (prénom, nom)` —
 * appliquait le `OR` même aux lignes possédant un identifiant : deux homonymes se
 * reconnaissaient donc mutuellement, jusqu'à la suppression de compte.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { initSchema, execute, queryOne, queryAll } = require('../database');
const { countStudentActiveTaskAssignments } = require('../lib/studentTaskEnrollment');
const {
  assignmentIdentityMatch,
  assignmentRowMatchesStudent,
} = require('../lib/tasks/assignmentIdentityMatch');

const stamp = Date.now();
const FIRST = 'Camille';
const LAST = `Homonyme${stamp}`;

let zoneId = null;
let studentA = null;
let studentB = null;

async function makeStudent() {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO users (id, user_type, first_name, last_name, display_name, password_hash,
                        auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', ?, ?, ?, 'x', 'local', 1, NOW(), NOW())`,
    [id, FIRST, LAST, `${FIRST} ${LAST}`],
  );
  return id;
}

async function makeTaskAssignedTo(studentId, title) {
  const taskId = crypto.randomUUID();
  await execute(
    `INSERT INTO tasks (id, title, description, map_id, zone_id, required_students, status, created_at)
     VALUES (?, ?, '', 'foret', ?, 1, 'available', ?)`,
    [taskId, title, zoneId, new Date().toISOString()],
  );
  await execute(
    `INSERT INTO task_assignments (task_id, student_id, student_first_name, student_last_name, assigned_at)
     VALUES (?, ?, ?, ?, ?)`,
    [taskId, studentId, FIRST, LAST, new Date().toISOString()],
  );
  return taskId;
}

before(async () => {
  await initSchema();
  zoneId = (await queryOne('SELECT id FROM zones LIMIT 1')).id;
  studentA = await makeStudent();
  studentB = await makeStudent();
});

test('le quota de l’un ne compte pas les inscriptions de son homonyme', async () => {
  await makeTaskAssignedTo(studentA, `Homo A1 ${stamp}`);
  await makeTaskAssignedTo(studentA, `Homo A2 ${stamp}`);
  await makeTaskAssignedTo(studentB, `Homo B1 ${stamp}`);

  assert.strictEqual(await countStudentActiveTaskAssignments(studentA, FIRST, LAST), 2);
  assert.strictEqual(
    await countStudentActiveTaskAssignments(studentB, FIRST, LAST),
    1,
    'B ne doit pas hériter des inscriptions de A',
  );
});

test('les lignes héritées, sans identifiant, restent reconnues par le nom', async () => {
  const taskId = crypto.randomUUID();
  await execute(
    `INSERT INTO tasks (id, title, description, map_id, zone_id, required_students, status, created_at)
     VALUES (?, ?, '', 'foret', ?, 1, 'available', ?)`,
    [taskId, `Homo héritée ${stamp}`, zoneId, new Date().toISOString()],
  );
  await execute(
    `INSERT INTO task_assignments (task_id, student_id, student_first_name, student_last_name, assigned_at)
     VALUES (?, NULL, ?, ?, ?)`,
    [taskId, FIRST, LAST, new Date().toISOString()],
  );

  // Sans identifiant sur la ligne, le nom fait foi : les deux la voient. C'est le
  // comportement d'origine, préservé pour ne pas perdre l'historique.
  assert.strictEqual(await countStudentActiveTaskAssignments(studentA, FIRST, LAST), 3);
  assert.strictEqual(await countStudentActiveTaskAssignments(studentB, FIRST, LAST), 2);
});

test('supprimer un compte n’efface pas les inscriptions de son homonyme', async () => {
  const { deleteStudentById } = require('../lib/studentDeletion');
  const before = await queryAll('SELECT task_id FROM task_assignments WHERE student_id = ?', [
    studentB,
  ]);
  assert.ok(before.length >= 1);

  await deleteStudentById(studentA);

  const after = await queryAll('SELECT task_id FROM task_assignments WHERE student_id = ?', [
    studentB,
  ]);
  assert.strictEqual(
    after.length,
    before.length,
    'les inscriptions de l’homonyme survivant doivent être intactes',
  );
  const gone = await queryAll('SELECT task_id FROM task_assignments WHERE student_id = ?', [
    studentA,
  ]);
  assert.strictEqual(gone.length, 0, 'celles du compte supprimé doivent bien partir');
});

test('assignmentIdentityMatch : sans identifiant, seule la branche « nom » s’applique', () => {
  const match = assignmentIdentityMatch('ta');
  assert.deepStrictEqual(match.params(null, 'Jean', 'Dupont'), [null, null, 'Jean', 'Dupont']);
  assert.deepStrictEqual(match.params('  ', 'Jean', 'Dupont'), [null, null, 'Jean', 'Dupont']);
  assert.match(match.clause, /ta\.student_id IS NULL/);
});

test('assignmentRowMatchesStudent : même règle appliquée en mémoire', () => {
  const withId = { student_id: 'A', student_first_name: FIRST, student_last_name: LAST };
  const legacy = { student_id: null, student_first_name: FIRST, student_last_name: LAST };

  // Une ligne qui porte un identifiant n'est reconnue que par lui : un homonyme (ou un
  // nom envoyé par le client) ne doit pas s'y reconnaître.
  assert.strictEqual(
    assignmentRowMatchesStudent(withId, { studentId: 'A', firstName: FIRST, lastName: LAST }),
    true,
  );
  assert.strictEqual(
    assignmentRowMatchesStudent(withId, { studentId: 'B', firstName: FIRST, lastName: LAST }),
    false,
    'un homonyme ne prend pas la ligne d’un compte identifié',
  );
  assert.strictEqual(
    assignmentRowMatchesStudent(withId, { firstName: FIRST, lastName: LAST }),
    false,
    'sans identifiant, une ligne identifiée reste hors de portée',
  );

  // Ligne héritée : le nom reste la seule clé — insensible à la casse et aux espaces.
  assert.strictEqual(
    assignmentRowMatchesStudent(legacy, {
      studentId: 'B',
      firstName: ` ${FIRST.toUpperCase()} `,
      lastName: LAST.toLowerCase(),
    }),
    true,
  );
  assert.strictEqual(
    assignmentRowMatchesStudent(legacy, { studentId: 'B', firstName: 'Autre', lastName: LAST }),
    false,
  );
  assert.strictEqual(assignmentRowMatchesStudent(legacy, { studentId: 'B' }), false);
  assert.strictEqual(assignmentRowMatchesStudent(null, { studentId: 'B' }), false);
});
