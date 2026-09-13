'use strict';

require('./helpers/setup');
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { initSchema, queryOne, execute } = require('../database');
const { ensureTeacherAdminFromEnv } = require('../lib/teacherAdminSeed');
const { ensurePrimaryRole, resetRbacBootstrapForTests } = require('../lib/rbac');

describe('teacherAdminSeed', () => {
  before(async () => {
    await initSchema();
    resetRbacBootstrapForTests();
  });

  it('crée le compte TEACHER_ADMIN_* s’il est absent', async () => {
    const email = `seed-admin-${Date.now()}@foretmap.local`;
    const prevEmail = process.env.TEACHER_ADMIN_EMAIL;
    const prevPass = process.env.TEACHER_ADMIN_PASSWORD;
    process.env.TEACHER_ADMIN_EMAIL = email;
    process.env.TEACHER_ADMIN_PASSWORD = 'SeedPass12';
    try {
      await execute("DELETE FROM users WHERE email = ? AND user_type = 'teacher'", [email]);
      const first = await ensureTeacherAdminFromEnv({ ensurePrimaryRole });
      assert.equal(first.created, true);
      assert.ok(first.teacherId);
      const row = await queryOne(
        "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
        [email],
      );
      assert.equal(row.id, first.teacherId);
      const second = await ensureTeacherAdminFromEnv({ ensurePrimaryRole });
      assert.equal(second.created, false);
      assert.equal(second.teacherId, first.teacherId);
    } finally {
      process.env.TEACHER_ADMIN_EMAIL = prevEmail;
      process.env.TEACHER_ADMIN_PASSWORD = prevPass;
      await execute("DELETE FROM users WHERE email = ? AND user_type = 'teacher'", [email]);
    }
  });
});
