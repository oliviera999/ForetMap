'use strict';

// Garde-fous de dates à l'écriture (audit échéances §7, restés non appliqués jusqu'ici) :
// format AAAA-MM-JJ strict et cohérence début ≤ échéance sur POST et PUT /api/tasks.
// Sans eux, une date d'un autre format se glisse dans la colonne VARCHAR(32) et fait
// échouer la duplication récurrente EN SILENCE (parseISODateOnly n'accepte que ce format).
// Le même couple de contrôles couvre POST /api/tasks/proposals ; la logique pure est
// testée dans tests/tasks-helpers.test.js.
require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const { initDatabase, queryOne, execute } = require('../database');
const { app } = require('../server');
const request = require('supertest');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureRbacBootstrap } = require('../lib/rbac');

test.before(async () => {
  await initDatabase();
  await ensureRbacBootstrap();
});

async function getAdminAuthToken() {
  const loginEmail = String(process.env.TEACHER_ADMIN_EMAIL || '').trim();
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [loginEmail],
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(teacher?.id);
  assert.ok(adminRole?.id);
  for (const key of ['tasks.manage', 'tasks.validate', 'teacher.access']) {
    await execute('INSERT IGNORE INTO permissions (`key`, label, description) VALUES (?, ?, ?)', [
      key,
      key,
      'Permission auto-seed tests dates',
    ]);
    await execute('INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)', [
      adminRole.id,
      key,
    ]);
  }
  await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', [
    'teacher',
    teacher.id,
  ]);
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
    ['teacher', teacher.id, adminRole.id],
  );
  return await signAuthToken(
    {
      userType: 'teacher',
      userId: teacher.id,
      canonicalUserId: teacher.id,
      roleId: adminRole.id,
      roleSlug: 'admin',
      roleDisplayName: 'Administrateur',
      elevated: false,
    },
    false,
  );
}

test('POST /api/tasks : format de date non conforme rejeté en 400', async () => {
  const token = await getAdminAuthToken();
  const zones = await request(app).get('/api/zones').expect(200);
  const zoneId = zones.body[0]?.id || 'pg';

  for (const mauvais of ['15/09/2026', '2026-9-15', '2026-09-15T10:00:00Z']) {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: `DateKO ${Date.now()}`, zone_id: zoneId, due_date: mauvais })
      .expect(400);
    assert.match(String(res.body.error || ''), /AAAA-MM-JJ/);
  }
});

test('POST /api/tasks : échéance antérieure au début rejetée en 400', async () => {
  const token = await getAdminAuthToken();
  const zones = await request(app).get('/api/zones').expect(200);
  const zoneId = zones.body[0]?.id || 'pg';

  const res = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: `Inversee ${Date.now()}`,
      zone_id: zoneId,
      start_date: '2026-09-18',
      due_date: '2026-09-15',
    })
    .expect(400);
  assert.match(String(res.body.error || ''), /échéance/);

  // Le couple cohérent, lui, passe (y compris start == due).
  await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: `Coherente ${Date.now()}`,
      zone_id: zoneId,
      start_date: '2026-09-15',
      due_date: '2026-09-15',
    })
    .expect(201);
});

test('PUT /api/tasks/:id : ne peut pas inverser le couple déjà en base', async () => {
  const token = await getAdminAuthToken();
  const zones = await request(app).get('/api/zones').expect(200);
  const zoneId = zones.body[0]?.id || 'pg';

  const created = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: `PutDates ${Date.now()}`,
      zone_id: zoneId,
      start_date: '2026-09-15',
      due_date: '2026-09-18',
    })
    .expect(201);
  const taskId = created.body.id;

  // Une seule des deux dates envoyée : le contrôle porte sur les valeurs effectives.
  const res = await request(app)
    .put(`/api/tasks/${taskId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ due_date: '2026-09-10' })
    .expect(400);
  assert.match(String(res.body.error || ''), /échéance/);

  // La tâche n'a pas bougé.
  const row = await queryOne('SELECT start_date, due_date FROM tasks WHERE id = ?', [taskId]);
  assert.strictEqual(String(row.start_date), '2026-09-15');
  assert.strictEqual(String(row.due_date), '2026-09-18');

  // Décaler les deux ensemble reste possible.
  await request(app)
    .put(`/api/tasks/${taskId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ start_date: '2026-09-08', due_date: '2026-09-11' })
    .expect(200);
});
