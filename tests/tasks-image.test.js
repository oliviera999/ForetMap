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
    [loginEmail],
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
    false,
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
      String(res.body.image_url).includes('/uploads/tasks/') ||
        String(res.body.image_url).includes('/image'),
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
      [taskId, 'Sans image bientôt', '', `tasks/${taskId}.jpg`, new Date().toISOString()],
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

  // Le repli `GET /api/tasks/:id/image` est public par conception (docs/API.md), au même
  // titre que `/uploads/tasks/…`. Ce qui ne doit PAS être public, c'est une famille
  // d'`uploads/` que le montage statique refuse : `createPrivateUploadsGuard` bloque
  // `observations/` et `task-logs/` précisément pour que « l'autorisation portée par les
  // routes API ne soit pas contournable ». Ce repli lisait pourtant `image_path` sans
  // vérifier la famille — la garde contournée par l'API au lieu de l'inverse.
  it('le repli refuse un image_path pointant vers une famille privée d’uploads', async () => {
    const taskId = `task-priv-img-${Date.now()}`;
    await execute(
      `INSERT INTO tasks (id, title, description, image_path, map_id, project_id, zone_id, marker_id, start_date, due_date, required_students, completion_mode, danger_level, difficulty_level, importance_level, status, recurrence, created_at)
       VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, 1, 'single_done', NULL, NULL, NULL, 'available', NULL, ?)`,
      [taskId, 'Chemin privé', '', 'observations/secret-eleve.jpg', new Date().toISOString()],
    );

    // Sans authentification : c'est le cas qui compte, la route étant publique.
    const res = await request(app).get(`/api/tasks/${taskId}/image`);
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, 'Aucune image');

    // Et le montage statique refuse toujours le même chemin (403), donc les deux
    // portes disent la même chose.
    const direct = await request(app).get('/uploads/observations/secret-eleve.jpg');
    assert.strictEqual(direct.status, 403);
  });

  it('le repli sert toujours un image_path d’une famille publique', async () => {
    const taskId = `task-pub-img-${Date.now()}`;
    await execute(
      `INSERT INTO tasks (id, title, description, image_path, map_id, project_id, zone_id, marker_id, start_date, due_date, required_students, completion_mode, danger_level, difficulty_level, importance_level, status, recurrence, created_at)
       VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, 1, 'single_done', NULL, NULL, NULL, 'available', NULL, ?)`,
      [
        taskId,
        'Chemin public absent du disque',
        '',
        'tasks/inexistant-mais-public.jpg',
        new Date().toISOString(),
      ],
    );

    // Le fichier n'existe pas sur le disque : on attend « Fichier introuvable » (le refus
    // de famille privée, lui, répond « Aucune image ») — ce qui prouve que la garde a
    // laissé passer le chemin public et que c'est bien `sendFile` qui a tranché.
    const res = await request(app).get(`/api/tasks/${taskId}/image`);
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, 'Fichier introuvable');
  });
});
