'use strict';

require('./helpers/setup');
const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureRbacBootstrap } = require('../lib/rbac');

const SAMPLE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5qXg8AAAAASUVORK5CYII=';

let teacherToken;

before(async () => {
  await initSchema();
  await ensureRbacBootstrap();
  const loginEmail = String(process.env.TEACHER_ADMIN_EMAIL || '').trim();
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [loginEmail]
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(teacher?.id, 'Compte admin enseignant introuvable');
  assert.ok(adminRole?.id, 'Rôle admin introuvable');
  teacherToken = await signAuthToken(
    {
      userType: 'teacher',
      userId: teacher.id,
      canonicalUserId: teacher.id,
      roleId: adminRole.id,
      roleSlug: 'admin',
      roleDisplayName: 'Administrateur',
      elevated: false,
    },
    false
  );
});

describe('Tâches — image illustrative', () => {
  it('POST /api/tasks avec imageData renvoie image_url et GET …/image sert le fichier', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        title: `Tâche photo ${Date.now()}`,
        required_students: 1,
        imageData: SAMPLE_PNG,
      })
      .expect(201);
    assert.ok(res.body.image_url);
    assert.ok(
      String(res.body.image_url).includes('/uploads/tasks/') || String(res.body.image_url).includes('/image')
    );
    assert.strictEqual(res.body.image_path, undefined);

    const img = await request(app).get(res.body.image_url).buffer(true).expect(200);
    assert.ok(Buffer.isBuffer(img.body));
    assert.ok(img.body.length > 10);
  });

  it('PUT remove_task_image supprime image_path', async () => {
    const taskId = `task-rm-img-${Date.now()}`;
    await execute(
      `INSERT INTO tasks (id, title, description, image_path, map_id, project_id, zone_id, marker_id, start_date, due_date, required_students, completion_mode, danger_level, difficulty_level, importance_level, status, recurrence, created_at)
       VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, 1, 'single_done', NULL, NULL, NULL, 'available', NULL, ?)`,
      [taskId, 'Sans image bientôt', '', `tasks/${taskId}.jpg`, new Date().toISOString()]
    );

    const put = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ remove_task_image: true })
      .expect(200);
    assert.strictEqual(put.body.image_url, null);

    const row = await queryOne('SELECT image_path FROM tasks WHERE id = ?', [taskId]);
    assert.strictEqual(row.image_path, null);
  });
});
