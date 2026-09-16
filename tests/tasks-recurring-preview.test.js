require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const { initDatabase, queryOne, execute } = require('../database');
const { app } = require('../server');
const request = require('supertest');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureRbacBootstrap } = require('../lib/rbac');

/**
 * `GET /api/tasks/recurring-preview` : la prochaine occurrence **prévue** de chaque série.
 *
 * La route sert l'aperçu du cadre « Séries récurrentes » côté n3boss. Ce qu'elle promet et
 * qui n'est vérifiable que côté serveur : une seule ligne par série (la tête, celle qui
 * engendrera la suivante), le champ `pending` qui dit ce qui manque pour que l'occurrence
 * arrive, et la permission `tasks.manage` — un n3beur ne voit pas le calendrier des séries.
 */

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
      'Permission auto-seed tests recurring-preview',
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

async function createRecurringTask(token, title, extra = {}) {
  const zones = await request(app).get('/api/zones').expect(200);
  const res = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title,
      zone_id: zones.body[0]?.id || 'pg',
      required_students: 1,
      recurrence: 'weekly',
      start_date: '2020-01-07',
      due_date: '2020-01-10',
      ...extra,
    })
    .expect(201);
  return res.body.id;
}

function findSeries(body, taskId) {
  return (body.series || []).find((s) => String(s.task_id) === String(taskId)) || null;
}

test('recurring-preview : une ligne par série, ancrée sur la date de départ', async () => {
  const token = await getAdminAuthToken();
  const title = `RecPreview ${Date.now()}`;
  const taskId = await createRecurringTask(token, title);

  const res = await request(app)
    .get('/api/tasks/recurring-preview')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  assert.match(res.body.today, /^\d{4}-\d{2}-\d{2}$/, 'le jour de référence est une date ISO');
  const ligne = findSeries(res.body, taskId);
  assert.ok(ligne, 'la série créée figure dans la prévision');
  assert.strictEqual(ligne.title, title);
  assert.strictEqual(ligne.recurrence, 'weekly');
  // L'ancre est la date de départ : c'est elle qui fixe le jour de la semaine de la série.
  assert.strictEqual(ligne.anchor_date, '2020-01-07');
  assert.strictEqual(ligne.current_due, '2020-01-10');
  // Tâche non validée : c'est la validation qui manque pour que la suivante naisse.
  assert.strictEqual(ligne.pending, 'validation');
});

test('recurring-preview : une série n’apparaît qu’une fois, par sa tête d’échéance', async () => {
  const token = await getAdminAuthToken();
  const seriesId = `srv-${Date.now()}`;
  const ancienId = await createRecurringTask(token, `RecPreview ancien ${Date.now()}`);
  const recentId = await createRecurringTask(token, `RecPreview récent ${Date.now()}`, {
    start_date: '2020-01-14',
    due_date: '2020-01-17',
  });
  // Les deux occurrences appartiennent à la même série : seule la plus récente doit sortir.
  await execute('UPDATE tasks SET recurrence_series_id = ? WHERE id IN (?, ?)', [
    seriesId,
    ancienId,
    recentId,
  ]);

  const res = await request(app)
    .get('/api/tasks/recurring-preview')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  const pourSerie = (res.body.series || []).filter((s) => String(s.series_id) === seriesId);
  assert.strictEqual(pourSerie.length, 1, 'une seule ligne pour la série');
  assert.strictEqual(String(pourSerie[0].task_id), String(recentId), 'la tête est la plus récente');
});

test('recurring-preview : les tâches archivées sortent de la prévision', async () => {
  const token = await getAdminAuthToken();
  const taskId = await createRecurringTask(token, `RecPreview archivée ${Date.now()}`);

  await request(app)
    .post(`/api/tasks/${taskId}/archive`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  const res = await request(app)
    .get('/api/tasks/recurring-preview')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.strictEqual(findSeries(res.body, taskId), null, 'une série archivée ne s’annonce plus');
});

test('recurring-preview : réservé à `tasks.manage`', async () => {
  await request(app).get('/api/tasks/recurring-preview').expect(401);

  const studentRes = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Prev', lastName: `Stu${Date.now()}`, password: 'pass1234' })
    .expect(201);
  const studentToken = await signAuthToken(
    {
      userType: 'student',
      userId: studentRes.body.id,
      canonicalUserId: studentRes.body.id,
      roleSlug: 'eleve_novice',
      roleDisplayName: 'n3beur novice',
      elevated: false,
    },
    false,
  );
  await request(app)
    .get('/api/tasks/recurring-preview')
    .set('Authorization', `Bearer ${studentToken}`)
    .expect(403);
});
