'use strict';

/**
 * `lib/tasks/taskActions.js` (lot D du connecteur) : l'extraction des gestionnaires de
 * `routes/tasks.js` ne change pas le comportement — mêmes refus, idempotence de l'archivage,
 * mêmes effets (lieux détachés, audit, suppression des inscriptions et comptes rendus).
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const {
  TaskActionError,
  deleteTaskAction,
  setTaskArchivedAction,
  validateTaskAction,
} = require('../lib/tasks/taskActions');

let mapId;
let zoneId;

async function makeTask(extra = {}) {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO tasks (id, title, map_id, status, created_at, required_students)
     VALUES (?, ?, ?, ?, NOW(), 1)`,
    [id, `Action ${id.slice(0, 6)}`, mapId, extra.status || 'available'],
  );
  await execute('INSERT INTO task_zones (task_id, zone_id) VALUES (?, ?)', [id, zoneId]);
  return id;
}

test.before(async () => {
  await initSchema();
  const zone = await queryOne('SELECT id, map_id FROM zones ORDER BY id LIMIT 1');
  zoneId = zone.id;
  mapId = zone.map_id;
});

test('validate : introuvable 404, archivée 409, déjà validée 400', async () => {
  await assert.rejects(
    validateTaskAction('inexistante'),
    (e) => e instanceof TaskActionError && e.status === 404,
  );
  const id = await makeTask();
  await setTaskArchivedAction(id, { archive: true });
  await assert.rejects(validateTaskAction(id), (e) => e.status === 409);
  await setTaskArchivedAction(id, { archive: false });
  const done = await validateTaskAction(id);
  assert.equal(done.status, 'validated');
  assert.equal((await queryAll('SELECT 1 FROM task_zones WHERE task_id = ?', [id])).length, 0);
  await assert.rejects(validateTaskAction(id), (e) => e.status === 400);
  const audit = await queryOne(
    "SELECT action FROM audit_log WHERE action = 'validate_task' AND target_id = ? LIMIT 1",
    [id],
  );
  assert.ok(audit);
  await deleteTaskAction(id);
});

test('archive : idempotent, sans nouvel audit au second appel', async () => {
  const id = await makeTask();
  await setTaskArchivedAction(id, { archive: true });
  const n1 = (
    await queryOne(
      "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'archive_task' AND target_id = ?",
      [id],
    )
  ).n;
  const again = await setTaskArchivedAction(id, { archive: true });
  assert.ok(again.archived_at);
  const n2 = (
    await queryOne(
      "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'archive_task' AND target_id = ?",
      [id],
    )
  ).n;
  assert.equal(Number(n2), Number(n1));
  await deleteTaskAction(id);
});

test('delete : inscriptions et comptes rendus supprimés, 404 ensuite', async () => {
  const id = await makeTask();
  await execute(
    "INSERT INTO task_logs (task_id, student_first_name, student_last_name, comment, created_at) VALUES (?, 'A', 'B', 'c', NOW())",
    [id],
  );
  const out = await deleteTaskAction(id);
  assert.deepEqual(out, { success: true });
  assert.equal((await queryAll('SELECT 1 FROM task_logs WHERE task_id = ?', [id])).length, 0);
  await assert.rejects(deleteTaskAction(id), (e) => e.status === 404);
});
