require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');

let teacherToken;

async function refreshAdminTeacherToken() {
  const loginEmail = String(process.env.TEACHER_ADMIN_EMAIL || '').trim();
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [loginEmail]
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(teacher?.id, 'Compte admin enseignant introuvable');
  assert.ok(adminRole?.id, 'Rôle admin introuvable');
  const requiredPermissions = ['plants.manage'];
  for (const key of requiredPermissions) {
    await execute(
      'INSERT IGNORE INTO permissions (`key`, label, description) VALUES (?, ?, ?)',
      [key, key, 'Permission auto-seed tests']
    );
    await execute(
      'INSERT IGNORE INTO role_permissions (role_id, permission_key, requires_elevation) VALUES (?, ?, 1)',
      [adminRole.id, key]
    );
  }
  if (teacher?.id && adminRole?.id) {
    await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', ['teacher', teacher.id]);
    await execute(
      'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
      ['teacher', teacher.id, adminRole.id]
    );
  }
  const login = await request(app)
    .post('/api/auth/login')
    .send({
      identifier: loginEmail,
      password: process.env.TEACHER_ADMIN_PASSWORD,
    })
    .expect(200);
  const auth = await request(app)
    .post('/api/auth/teacher')
    .set({ Authorization: `Bearer ${login.body.authToken}` })
    .send({ pin: process.env.TEACHER_PIN || '1234' })
    .expect(200);
  return auth.body.token;
}

test.before(async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await initSchema();
      break;
    } catch (err) {
      if (err?.code !== 'ER_LOCK_DEADLOCK' || attempt === 4) throw err;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  teacherToken = await refreshAdminTeacherToken();
});

test.beforeEach(async () => {
  teacherToken = await refreshAdminTeacherToken();
});

test('POST /api/plants/import dryRun retourne un rapport avec erreurs', async () => {
  const unique = Date.now();
  const res = await request(app)
    .post('/api/plants/import')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      sourceType: 'rows',
      strategy: 'upsert_name',
      dryRun: true,
      rows: [
        { name: `ImportTest-${unique}-ok`, scientific_name: 'Ocimum basilicum', photo: 'https://example.com/image.jpg' },
        { name: '', scientific_name: 'Invalidus testus' },
        { name: `ImportTest-${unique}-badphoto`, photo: 'https://example.com/wiki/page' },
      ],
    })
    .expect(200);

  const report = res.body.report;
  assert.ok(report);
  assert.strictEqual(report.totals.received, 3);
  assert.strictEqual(report.totals.valid, 1);
  assert.strictEqual(report.totals.skipped_invalid, 2);
  assert.ok(Array.isArray(report.errors));
  assert.ok(report.errors.length >= 2);
});

test('POST /api/plants/import upsert_name crée puis met à jour', async () => {
  const name = `ImportUpsert-${Date.now()}`;
  await request(app)
    .post('/api/plants/import')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      sourceType: 'rows',
      strategy: 'upsert_name',
      dryRun: false,
      rows: [{ name, emoji: '🌿', description: 'version 1', scientific_name: 'Mentha spicata' }],
    })
    .expect(200);

  let row = await queryOne('SELECT * FROM plants WHERE name = ?', [name]);
  assert.ok(row);
  assert.strictEqual(row.description, 'version 1');

  await request(app)
    .post('/api/plants/import')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      sourceType: 'rows',
      strategy: 'upsert_name',
      dryRun: false,
      rows: [{ name, emoji: '🌿', description: 'version 2', scientific_name: 'Mentha spicata' }],
    })
    .expect(200);

  row = await queryOne('SELECT * FROM plants WHERE name = ?', [name]);
  assert.ok(row);
  assert.strictEqual(row.description, 'version 2');
});

test('POST /api/plants/import insert_only ignore les doublons', async () => {
  const name = `ImportInsertOnly-${Date.now()}`;

  await request(app)
    .post('/api/plants/import')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      sourceType: 'rows',
      strategy: 'upsert_name',
      dryRun: false,
      rows: [{ name, description: 'base' }],
    })
    .expect(200);

  const res = await request(app)
    .post('/api/plants/import')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      sourceType: 'rows',
      strategy: 'insert_only',
      dryRun: false,
      rows: [{ name, description: 'doit être ignoré' }],
    })
    .expect(200);

  assert.strictEqual(res.body.report.totals.skipped_existing, 1);
  const row = await queryOne('SELECT * FROM plants WHERE name = ?', [name]);
  assert.strictEqual(row.description, 'base');
});

test('POST /api/plants/import replace_all refuse si lignes invalides', async () => {
  const res = await request(app)
    .post('/api/plants/import')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      sourceType: 'rows',
      strategy: 'replace_all',
      dryRun: false,
      rows: [
        { name: 'ReplaceAll-OK', description: 'ok' },
        { name: '', description: 'invalide' },
      ],
    })
    .expect(400);

  assert.ok(res.body.error.includes('Import interrompu'));
  assert.ok(res.body.report);
  assert.strictEqual(res.body.report.totals.skipped_invalid, 1);
});
