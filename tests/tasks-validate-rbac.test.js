'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { initSchema, queryOne, execute } = require('../database');
const { app } = require('../server');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

test.before(async () => {
  await initSchema();
  await ensureRbacBootstrap();
});

async function ensureValidateOnlyTeacher() {
  const ts = Date.now();
  const slug = `e2e_validate_only_${ts}`;
  const loginEmail = `validate.only.${ts}@foretmap.test`;
  const teacherId = `tval-${ts}`;

  await execute(
    `INSERT INTO users (id, user_type, email, first_name, last_name, password_hash, is_active, created_at)
     VALUES (?, 'teacher', ?, 'Valide', 'Seul', ?, 1, ?)
     ON DUPLICATE KEY UPDATE is_active = 1`,
    [
      teacherId,
      loginEmail,
      '$2a$10$abcdefghijklmnopqrstuvabcdefghijklmnopqrstuvabcdefghi',
      new Date().toISOString(),
    ]
  );

  await execute(
    'INSERT IGNORE INTO roles (slug, display_name, emoji, min_done_tasks, display_order, `rank`, is_system) VALUES (?, ?, ?, NULL, 9999, 150, 0)',
    [slug, 'Validateur test', '✔️']
  );
  const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [slug]);
  assert.ok(role?.id, 'rôle validate-only introuvable');

  for (const [key, elev] of [
    ['teacher.access', 0],
    ['tasks.validate', 1],
  ]) {
    await execute(
      'INSERT IGNORE INTO permissions (`key`, label, description) VALUES (?, ?, ?)',
      [key, key, 'test']
    );
    await execute(
      'INSERT IGNORE INTO role_permissions (role_id, permission_key, requires_elevation) VALUES (?, ?, ?)',
      [role.id, key, elev]
    );
  }

  await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', ['teacher', teacherId]);
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
    ['teacher', teacherId, role.id]
  );

  const sign = (elevated) => signAuthToken(
    {
      userType: 'teacher',
      userId: teacherId,
      canonicalUserId: teacherId,
      roleId: role.id,
      roleSlug: slug,
      roleDisplayName: 'Validateur test',
      elevated: !!elevated,
    },
    !!elevated
  );

  return { sign };
}

test('POST validate : rôle validate-only non élevé → 403 élévation', async () => {
  const { sign } = await ensureValidateOnlyTeacher();
  const token = await sign(false);
  const adminToken = await ensureAdminTeacherAuthToken({ elevated: true });

  const createRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: `Tâche validate rbac ${Date.now()}`, required_students: 1, status: 'done' })
    .expect(201);
  const taskId = createRes.body.id;

  const res = await request(app)
    .post(`/api/tasks/${taskId}/validate`)
    .set('Authorization', `Bearer ${token}`)
    .expect(403);
  assert.match(String(res.body.error || ''), /élévation pin requise/i);
});

test('POST validate : rôle validate-only élevé → 200', async () => {
  const { sign } = await ensureValidateOnlyTeacher();
  const elevatedToken = await sign(true);
  const adminToken = await ensureAdminTeacherAuthToken({ elevated: true });

  const createRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: `Tâche validate rbac ok ${Date.now()}`, required_students: 1 })
    .expect(201);
  const taskId = createRes.body.id;

  const validated = await request(app)
    .post(`/api/tasks/${taskId}/validate`)
    .set('Authorization', `Bearer ${elevatedToken}`)
    .expect(200);
  assert.strictEqual(validated.body.status, 'validated');
});

test('PUT statut done : rôle validate-only élevé → 403 (tasks.manage requis)', async () => {
  const { sign } = await ensureValidateOnlyTeacher();
  const elevatedToken = await sign(true);
  const adminToken = await ensureAdminTeacherAuthToken({ elevated: true });

  const createRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: `Tâche put done rbac ${Date.now()}`, required_students: 1 })
    .expect(201);
  const taskId = createRes.body.id;

  const putRes = await request(app)
    .put(`/api/tasks/${taskId}`)
    .set('Authorization', `Bearer ${elevatedToken}`)
    .send({ status: 'done' })
    .expect(403);
  assert.match(String(putRes.body.error || ''), /permission insuffisante/i);
});

test('PUT statut validated : rôle validate-only élevé → 200', async () => {
  const { sign } = await ensureValidateOnlyTeacher();
  const elevatedToken = await sign(true);
  const adminToken = await ensureAdminTeacherAuthToken({ elevated: true });

  const createRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: `Tâche put validated rbac ${Date.now()}`, required_students: 1 })
    .expect(201);
  const taskId = createRes.body.id;

  const putRes = await request(app)
    .put(`/api/tasks/${taskId}`)
    .set('Authorization', `Bearer ${elevatedToken}`)
    .send({ status: 'validated' })
    .expect(200);
  assert.strictEqual(putRes.body.status, 'validated');
});
