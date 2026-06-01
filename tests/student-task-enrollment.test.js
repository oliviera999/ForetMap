'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const { initSchema, execute, queryOne } = require('../database');
const { setSetting } = require('../lib/settings');
const { getEffectiveMaxActiveTaskAssignments } = require('../lib/studentTaskEnrollment');

test.before(async () => {
  await initSchema();
});

test('max_concurrent_tasks = 0 sur le profil prime comme « sans limite »', async () => {
  const noviceRole = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_novice' LIMIT 1");
  assert.ok(noviceRole?.id);
  try {
    await setSetting('tasks.student_max_active_assignments', 3, {});
    await execute('UPDATE roles SET max_concurrent_tasks = 0 WHERE id = ?', [noviceRole.id]);

    const student = await queryOne(
      `SELECT u.id FROM users u
       INNER JOIN user_roles ur ON ur.user_id = u.id AND ur.user_type = 'student' AND ur.is_primary = 1
       INNER JOIN roles r ON r.id = ur.role_id AND r.slug = 'eleve_novice'
       WHERE u.user_type = 'student' AND u.is_active = 1
       LIMIT 1`
    );
    assert.ok(student?.id);

    const max = await getEffectiveMaxActiveTaskAssignments(student.id);
    assert.strictEqual(max, 0);
  } finally {
    await execute('UPDATE roles SET max_concurrent_tasks = NULL WHERE id = ?', [noviceRole.id]);
    await setSetting('tasks.student_max_active_assignments', 0, {});
  }
});
