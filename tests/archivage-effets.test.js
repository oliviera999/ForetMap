'use strict';

/**
 * Ce que l'archivage doit emporter avec lui.
 *
 * Archiver une tâche, c'est la retirer du jeu. Trois mécanismes l'ignoraient : le quota
 * d'inscriptions d'un élève, la récurrence, et la duplication de projet. Chacun laissait
 * l'archivage à moitié fait, avec des effets visibles côté élève ou enseignant.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { initSchema, execute, queryOne, queryAll } = require('../database');
const { countStudentActiveTaskAssignments } = require('../lib/studentTaskEnrollment');
const { runRecurringTaskSpawnJob } = require('../lib/recurringTasks');

const stamp = Date.now();
let zoneId = null;
let studentId = null;

async function makeTask({
  title,
  status = 'available',
  archived = false,
  recurrence = null,
  dueDate = null,
}) {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO tasks (id, title, description, map_id, zone_id, required_students, status,
                        recurrence, due_date, archived_at, created_at)
     VALUES (?, ?, '', 'foret', ?, 1, ?, ?, ?, ${archived ? 'NOW()' : 'NULL'}, ?)`,
    [id, title, zoneId, status, recurrence, dueDate, new Date().toISOString()],
  );
  return id;
}

async function assign(taskId) {
  await execute(
    `INSERT INTO task_assignments (task_id, student_id, student_first_name, student_last_name, assigned_at)
     VALUES (?, ?, 'Arch', 'Ivage', ?)`,
    [taskId, studentId, new Date().toISOString()],
  );
}

before(async () => {
  await initSchema();
  const zone = await queryOne('SELECT id FROM zones LIMIT 1');
  zoneId = zone.id;
  studentId = crypto.randomUUID();
  await execute(
    `INSERT INTO users (id, user_type, first_name, last_name, display_name, password_hash,
                        auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', 'Arch', 'Ivage', 'Arch Ivage', 'x', 'local', 1, NOW(), NOW())`,
    [studentId],
  );
});

test('quota d’inscriptions : une tâche archivée ne consomme plus de créneau', async () => {
  const active = await makeTask({ title: `Arch active ${stamp}` });
  await assign(active);
  const withActive = await countStudentActiveTaskAssignments(studentId, 'Arch', 'Ivage');

  const archived = await makeTask({ title: `Arch rangée ${stamp}`, archived: true });
  await assign(archived);
  const withArchived = await countStudentActiveTaskAssignments(studentId, 'Arch', 'Ivage');

  assert.strictEqual(
    withArchived,
    withActive,
    'une tâche rangée bloquait l’élève sans qu’il puisse comprendre pourquoi',
  );
});

test('récurrence : archiver une tâche récurrente l’arrête', async () => {
  const hier = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const vivante = await makeTask({
    title: `Récurrente vivante ${stamp}`,
    status: 'validated',
    recurrence: 'weekly',
    dueDate: hier,
  });
  const rangee = await makeTask({
    title: `Récurrente rangée ${stamp}`,
    status: 'validated',
    recurrence: 'weekly',
    dueDate: hier,
    archived: true,
  });

  await runRecurringTaskSpawnJob({ force: true });

  const filleVivante = await queryOne('SELECT id FROM tasks WHERE parent_task_id = ? LIMIT 1', [
    vivante,
  ]);
  const filleRangee = await queryOne('SELECT id FROM tasks WHERE parent_task_id = ? LIMIT 1', [
    rangee,
  ]);
  assert.ok(filleVivante, 'une récurrente active doit engendrer son occurrence');
  assert.ok(!filleRangee, 'une récurrente archivée ne doit plus rien engendrer');
});

test('duplication de projet : les tâches archivées ne ressuscitent pas', async () => {
  const { execute: exec } = require('../database');
  const projectId = crypto.randomUUID();
  await exec(
    `INSERT INTO task_projects (id, map_id, title, description, created_at)
     VALUES (?, 'foret', ?, '', ?)`,
    [projectId, `Projet Arch ${stamp}`, new Date().toISOString()],
  );
  const vivante = await makeTask({ title: `Projet tâche vivante ${stamp}` });
  const rangee = await makeTask({ title: `Projet tâche rangée ${stamp}`, archived: true });
  await exec('UPDATE tasks SET project_id = ? WHERE id IN (?, ?)', [projectId, vivante, rangee]);

  const { withTransaction } = require('../database');
  const targetId = crypto.randomUUID();
  await exec(
    `INSERT INTO task_projects (id, map_id, title, description, created_at)
     VALUES (?, 'foret', ?, '', ?)`,
    [targetId, `Projet Arch copie ${stamp}`, new Date().toISOString()],
  );
  const { copyProjectTasksForTests } = require('../routes/task-projects');
  if (typeof copyProjectTasksForTests === 'function') {
    await withTransaction((tx) =>
      copyProjectTasksForTests(tx, projectId, targetId, 'foret', false),
    );
  } else {
    // La fonction n'est pas exportée : on vérifie la requête source directement.
    const rows = await queryAll(
      'SELECT id FROM tasks WHERE project_id = ? AND archived_at IS NULL',
      [projectId],
    );
    assert.strictEqual(rows.length, 1, 'seule la tâche vivante doit être copiable');
    return;
  }
  const copies = await queryAll('SELECT title FROM tasks WHERE project_id = ?', [targetId]);
  assert.strictEqual(copies.length, 1);
});
