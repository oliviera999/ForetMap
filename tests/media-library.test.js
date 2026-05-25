require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pJkQAAAAASUVORK5CYII=';

test.before(async () => {
  await initSchema();
});

async function createTeacherToken(label = 'media') {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const teacherId = `teacher-${label}-${stamp}`.slice(0, 64);
  const teacherEmail = `${teacherId}@foretmap.local`;
  const profRole = await queryOne("SELECT id FROM roles WHERE slug = 'prof' LIMIT 1");
  assert.ok(profRole?.id, 'Rôle prof introuvable');
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, ?, ?, 'x', 'local', 1, NOW(), NOW())`,
    [teacherId, teacherEmail, teacherId, 'Prof médiathèque']
  );
  await execute(
    `INSERT INTO user_roles (user_type, user_id, role_id, is_primary)
     VALUES ('teacher', ?, ?, 1)
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), is_primary = 1`,
    [teacherId, profRole.id]
  );
  return signAuthToken({
    userType: 'teacher',
    userId: teacherId,
    canonicalUserId: teacherId,
    roleId: profRole.id,
    roleSlug: 'prof',
    roleDisplayName: 'n3boss',
    elevated: false,
  }, false);
}

test('GET /api/media-library exige un compte n3boss ForetMap', async () => {
  await request(app)
    .get('/api/media-library')
    .expect(401);

  const glToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: 'media-player',
    roleSlug: 'gl_player',
    permissions: ['gl.read'],
  });

  await request(app)
    .get('/api/media-library')
    .set('Authorization', `Bearer ${glToken}`)
    .expect(403);

  const teacherToken = await createTeacherToken('media-read');
  const listed = await request(app)
    .get('/api/media-library?limit=5')
    .set('Authorization', `Bearer ${teacherToken}`)
    .expect(200);

  assert.ok(Array.isArray(listed.body?.items));
});

test('media-library ForetMap: upload, liste et suppression', async () => {
  const teacherToken = await createTeacherToken('media-crud');

  const created = await request(app)
    .post('/api/media-library')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ media_data: TINY_PNG_DATA_URL })
    .expect(201);

  assert.ok(String(created.body?.url || '').startsWith('/uploads/media-library/'));
  assert.strictEqual(created.body?.mediaType, 'image');

  const listed = await request(app)
    .get('/api/media-library?limit=400')
    .set('Authorization', `Bearer ${teacherToken}`)
    .expect(200);

  assert.ok(listed.body.items.some((item) => item.relativePath === created.body.relativePath));

  await request(app)
    .delete('/api/media-library')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ relative_path: created.body.relativePath })
    .expect(200);
});
