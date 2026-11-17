'use strict';

/**
 * `foretmap_usage_overview` — compteur `tasks_completed` (chantier « parcours
 * d'apprentissage », lot 5). « Tâches réalisées » = tâches **validées par le prof** sur la
 * période (`tasks.validated_at`), et non plus `task_assignments.done_at` — jamais posé en mode
 * `single_done` (le défaut), et chaîne VARCHAR comparée à une date.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fx = require('./helpers/mcpFixtures');
const { initSchema, execute } = require('../database');

fx.enableMcpEnv();

const { buildUsageTools } = require('../lib/mcp/tools/usage');

const stamp = Date.now();
const ids = [];

/** Lecture brute (bypass, sans compte : pas de ligne d'audit) du compteur sur 7 jours. */
async function tasksCompleted() {
  const tool = buildUsageTools().find((t) => t.name === 'foretmap_usage_overview');
  const out = await tool.handler({ days: 7 }, { privacyBypass: true });
  return Number(out.tasks_completed);
}

async function insertTask({ status, validatedAt = null, archived = false }) {
  const id = crypto.randomUUID();
  ids.push(id);
  await execute(
    `INSERT INTO tasks (id, title, status, required_students, validated_at, archived_at, created_at)
     VALUES (?, ?, ?, 1, ${validatedAt ? validatedAt : 'NULL'}, ${archived ? 'NOW()' : 'NULL'}, NOW())`,
    [id, `Compteur ${stamp}`, status],
  );
  return id;
}

test.before(async () => {
  await initSchema();
});

test.after(async () => {
  for (const id of ids) {
    await execute('DELETE FROM task_assignments WHERE task_id = ?', [id]).catch(() => {});
    await execute('DELETE FROM tasks WHERE id = ?', [id]).catch(() => {});
  }
});

test('tasks_completed compte les validations prof de la période, pas les « faites »', async () => {
  const before = await tasksCompleted();

  // Validée aujourd'hui : comptée.
  await insertTask({ status: 'validated', validatedAt: 'NOW()' });
  // Validée puis archivée (validated_at conservé) : comptée.
  await insertTask({ status: 'validated', validatedAt: 'NOW() - INTERVAL 2 DAY', archived: true });
  // Validée hors fenêtre : non comptée.
  await insertTask({ status: 'validated', validatedAt: 'NOW() - INTERVAL 30 DAY' });
  // Marquée faite par l'élève (mode all_assignees_done, done_at posé) mais pas validée :
  // l'ancien compteur la prenait, le nouveau non.
  const doneId = await insertTask({ status: 'done' });
  await execute(
    `INSERT INTO task_assignments (task_id, student_first_name, student_last_name, assigned_at, done_at)
     VALUES (?, 'Compteur', ?, NOW(), NOW())`,
    [doneId, `Eleve${stamp}`],
  );

  const after = await tasksCompleted();
  assert.equal(after - before, 2);
});
