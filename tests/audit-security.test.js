'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const { initSchema, execute, queryOne } = require('../database');
const { app } = require('../server');
const request = require('supertest');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureAdminTeacherAuthToken, getAdminTeacherUserId } = require('./helpers/adminAuth');

let adminToken = '';
let adminUserId = '';

async function createProfToken() {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const teacherId = `teacher-prof-sec-${stamp}`.slice(0, 64);
  const role = await queryOne("SELECT id FROM roles WHERE slug = 'prof' LIMIT 1");
  assert.ok(role?.id, 'Rôle prof introuvable');
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, ?, ?, 'x', 'local', 1, NOW(), NOW())`,
    [teacherId, `${teacherId}@foretmap.local`, teacherId, `Prof sec ${stamp}`],
  );
  await execute(
    `INSERT INTO user_roles (user_type, user_id, role_id, is_primary)
     VALUES ('teacher', ?, ?, 1)
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), is_primary = 1`,
    [teacherId, role.id],
  );
  await execute('UPDATE users SET assigned_role_id = ? WHERE id = ?', [role.id, teacherId]);
  // Garantir audit.read (matrice prof) sans audit.security.read.
  await execute('INSERT IGNORE INTO permissions (`key`, label, description) VALUES (?, ?, ?)', [
    'audit.read',
    'Lecture audit',
    'test',
  ]);
  await execute('INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)', [
    role.id,
    'audit.read',
  ]);
  await execute('DELETE FROM role_permissions WHERE role_id = ? AND permission_key = ?', [
    role.id,
    'audit.security.read',
  ]);
  const token = await signAuthToken({
    userType: 'teacher',
    userId: teacherId,
    canonicalUserId: teacherId,
    roleId: role.id,
    roleSlug: 'prof',
    roleDisplayName: 'Prof',
  });
  return { token, teacherId };
}

test.before(async () => {
  await initSchema();
  adminToken = await ensureAdminTeacherAuthToken();
  adminUserId = await getAdminTeacherUserId();
});

test('GET /api/audit/security sans token → 401', async () => {
  await request(app).get('/api/audit/security').expect(401);
});

test('GET /api/audit/security avec profil prof → 403', async () => {
  const { token } = await createProfToken();
  await request(app).get('/api/audit/security').set('Authorization', `Bearer ${token}`).expect(403);
});

test('GET /api/audit/security admin → 200 avec total/rows', async () => {
  const res = await request(app)
    .get('/api/audit/security?limit=20')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(res.body && typeof res.body === 'object');
  assert.ok(typeof res.body.from === 'string');
  assert.ok(typeof res.body.to === 'string');
  assert.ok(typeof res.body.total === 'number');
  assert.ok(Array.isArray(res.body.rows));
});

test('création zone → audit_log + security_events avec ip', async () => {
  const name = `Zone sécu ${Date.now()}`;
  const createRes = await request(app)
    .post('/api/zones')
    .set('Authorization', `Bearer ${adminToken}`)
    .set('User-Agent', 'ForetMap-Security-Test/1.0')
    .send({
      name,
      map_id: 'foret',
      points: [
        { xp: 10, yp: 10 },
        { xp: 20, yp: 10 },
        { xp: 15, yp: 20 },
      ],
      color: '#228B22',
    })
    .expect(201);
  const zoneId = createRes.body?.id;
  assert.ok(zoneId);

  const auditRow = await queryOne(
    `SELECT action, target_id, actor_user_id FROM audit_log
      WHERE action = 'create_zone' AND target_id = ? ORDER BY id DESC LIMIT 1`,
    [zoneId],
  );
  assert.ok(auditRow, 'ligne audit_log absente');
  assert.strictEqual(String(auditRow.actor_user_id), String(adminUserId));

  const secRow = await queryOne(
    `SELECT action, target_id, ip_address, user_agent, actor_user_id FROM security_events
      WHERE action = 'create_zone' AND target_id = ? ORDER BY id DESC LIMIT 1`,
    [zoneId],
  );
  assert.ok(secRow, 'ligne security_events absente');
  assert.ok(secRow.ip_address, 'ip_address attendue');
  assert.ok(
    String(secRow.user_agent || '').includes('ForetMap-Security-Test'),
    'user_agent attendu',
  );

  const filtered = await request(app)
    .get(`/api/audit/security?action=create_zone&actorUserId=${encodeURIComponent(adminUserId)}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(filtered.body.rows.some((r) => String(r.target_id) === String(zoneId)));

  const ipPrefix = String(secRow.ip_address).slice(0, 3);
  const byIp = await request(app)
    .get(`/api/audit/security?ip=${encodeURIComponent(ipPrefix)}&action=create_zone`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(byIp.body.rows.some((r) => String(r.target_id) === String(zoneId)));
});

test('export security CSV et JSON', async () => {
  const csv = await request(app)
    .get('/api/audit/security/export?format=csv&limit=50')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(String(csv.headers['content-type'] || '').includes('text/csv'));
  assert.ok(String(csv.headers['content-disposition'] || '').includes('.csv'));
  assert.ok(String(csv.text).includes('ip_address'));
  assert.ok(String(csv.text).includes('user_agent'));

  const json = await request(app)
    .get('/api/audit/security/export?format=json&limit=50')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(String(json.headers['content-type'] || '').includes('application/json'));
  assert.ok(String(json.headers['content-disposition'] || '').includes('.json'));
  assert.ok(Array.isArray(json.body.rows));
});

test('prof peut lire /api/audit mais pas l’export sécurité', async () => {
  const { token } = await createProfToken();
  await request(app).get('/api/audit?limit=5').set('Authorization', `Bearer ${token}`).expect(200);
  await request(app)
    .get('/api/audit/security/export?format=csv')
    .set('Authorization', `Bearer ${token}`)
    .expect(403);
});
