'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { initSchema, execute, queryOne, queryAll } = require('../database');
const { invalidateSettingsCache } = require('../lib/settings');
const {
  assertLinkedTutorialsRead,
  isRequireLinkedTutorialsEnabled,
} = require('../lib/taskTutorialPrerequisites');

before(async () => {
  await initSchema();
  await execute('DELETE FROM app_settings WHERE `key` = ?', [
    'learning.gating.require_linked_tutorials_before_task_done',
  ]).catch(() => {});
  invalidateSettingsCache();
});

test('assertLinkedTutorialsRead — désactivé par défaut', async () => {
  assert.equal(await isRequireLinkedTutorialsEnabled(), false);
  const ok = await assertLinkedTutorialsRead(
    { queryAll, queryOne, execute },
    { taskId: 999999, userId: '1' },
  );
  assert.equal(ok.ok, true);
});

test('assertLinkedTutorialsRead — bloque si tutoriel lié non lu', async () => {
  await execute(
    "INSERT INTO app_settings (`key`, scope, value_json) VALUES ('learning.gating.require_linked_tutorials_before_task_done', 'teacher', 'true') ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)",
  );
  invalidateSettingsCache();
  assert.equal(await isRequireLinkedTutorialsEnabled(), true);

  const task = await queryOne('SELECT id FROM tasks LIMIT 1');
  const tutorial = await queryOne('SELECT id FROM tutorials LIMIT 1');
  if (!task?.id || !tutorial?.id) return;

  await execute('UPDATE tutorials SET is_active = 1 WHERE id = ?', [tutorial.id]);

  await execute('DELETE FROM task_tutorials WHERE task_id = ?', [task.id]);
  await execute('INSERT INTO task_tutorials (task_id, tutorial_id) VALUES (?, ?)', [
    task.id,
    tutorial.id,
  ]);

  const user = await queryOne(
    `SELECT u.id FROM users u
     INNER JOIN user_roles ur ON ur.user_id = u.id
     INNER JOIN roles r ON r.id = ur.role_id
     WHERE r.slug LIKE 'eleve%' LIMIT 1`,
  );
  if (!user?.id) return;

  await execute('DELETE FROM user_tutorial_reads WHERE user_id = ? AND tutorial_id = ?', [
    user.id,
    tutorial.id,
  ]);

  const blocked = await assertLinkedTutorialsRead(
    { queryAll, queryOne, execute },
    { taskId: task.id, userId: user.id },
  );
  assert.equal(blocked.ok, false);
  assert.ok(Array.isArray(blocked.missing));
  assert.ok(blocked.missing.length >= 1);

  await execute(
    'INSERT INTO user_tutorial_reads (user_id, tutorial_id, acknowledged_at) VALUES (?, ?, NOW())',
    [user.id, tutorial.id],
  );
  const allowed = await assertLinkedTutorialsRead(
    { queryAll, queryOne, execute },
    { taskId: task.id, userId: user.id },
  );
  assert.equal(allowed.ok, true);

  await execute('DELETE FROM app_settings WHERE `key` = ?', [
    'learning.gating.require_linked_tutorials_before_task_done',
  ]);
  invalidateSettingsCache();
});
