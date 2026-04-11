require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const { initSchema, execute, queryOne } = require('../database');
const { app } = require('../server');
const request = require('supertest');

let teacherToken;
let studentData;

async function setStudentPrimaryRole(studentId, roleSlug) {
  const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [roleSlug]);
  assert.ok(role?.id, `Rôle introuvable: ${roleSlug}`);
  await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', ['student', studentId]);
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
    ['student', studentId, role.id]
  );
}

async function refreshAdminTeacherToken() {
  const loginEmail = String(process.env.TEACHER_ADMIN_EMAIL || '').trim();
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [loginEmail]
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(teacher?.id, 'Compte admin enseignant introuvable');
  assert.ok(adminRole?.id, 'Rôle admin introuvable');
  const requiredPermissions = [
    'stats.read.all', 'stats.export',
    'tasks.manage', 'tasks.read.logs',
    'zones.manage', 'visit.manage',
    'admin.settings.read', 'admin.settings.write',
  ];
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

  const reg = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Feature', lastName: 'Test' + Date.now(), password: 'pwd123' })
    .expect(201);
  studentData = reg.body;
  await setStudentPrimaryRole(studentData.id, 'eleve_novice');
});

test.beforeEach(async () => {
  teacherToken = await refreshAdminTeacherToken();
});

// ─── Export CSV ──────────────────────────────────────────────────────────────
test('GET /api/stats/export renvoie un CSV avec le bon content-type', async () => {
  const res = await request(app)
    .get('/api/stats/export')
    .set('Authorization', 'Bearer ' + teacherToken)
    .expect(200);
  assert.ok(res.headers['content-type'].includes('text/csv'));
  assert.ok(res.headers['content-disposition'].includes('.csv'));
  assert.ok(res.text.includes('Prénom'));
  assert.ok(res.text.includes('Espèces observées (fiches)'));
  assert.ok(res.text.includes('Observations fiches plantes'));
  assert.ok(res.text.includes('Tutoriels lus'));
});

test('GET /api/stats/export sans token renvoie 401', async () => {
  await request(app).get('/api/stats/export').expect(401);
});

// ─── Projets de tâches (V1) ──────────────────────────────────────────────────
test('CRUD /api/task-projects fonctionne (prof)', async () => {
  const title = `Projet V1 ${Date.now()}`;
  const createRes = await request(app)
    .post('/api/task-projects')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({ map_id: 'foret', title, description: 'Projet test V1' })
    .expect(201);
  assert.ok(createRes.body.id);
  assert.strictEqual(createRes.body.title, title);
  assert.strictEqual(createRes.body.map_id, 'foret');

  const projectId = createRes.body.id;

  const listRes = await request(app)
    .get('/api/task-projects?map_id=foret')
    .expect(200);
  assert.ok(Array.isArray(listRes.body));
  assert.ok(listRes.body.some((p) => p.id === projectId));

  const renamed = `${title} (modifié)`;
  const updateRes = await request(app)
    .put(`/api/task-projects/${projectId}`)
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({ title: renamed, status: 'on_hold', description: 'Description mise à jour' })
    .expect(200);
  assert.strictEqual(updateRes.body.title, renamed);
  assert.strictEqual(updateRes.body.status, 'on_hold');
  assert.strictEqual(updateRes.body.description, 'Description mise à jour');
  assert.ok(Array.isArray(updateRes.body.zone_ids));
  assert.ok(Array.isArray(updateRes.body.tutorial_ids));

  await request(app)
    .delete(`/api/task-projects/${projectId}`)
    .set('Authorization', 'Bearer ' + teacherToken)
    .expect(200);
});

test('POST/PUT /api/task-projects : zones, repères et tutoriels associés', async () => {
  const zoneRow = await queryOne("SELECT id FROM zones WHERE map_id = 'foret' LIMIT 1");
  const markerRow = await queryOne("SELECT id FROM map_markers WHERE map_id = 'foret' LIMIT 1");
  const tutoRow = await queryOne('SELECT id FROM tutorials WHERE is_active = 1 LIMIT 1');
  assert.ok(zoneRow?.id, 'Zone foret requise');
  assert.ok(tutoRow?.id, 'Tutoriel actif requis');

  const title = `Projet liens ${Date.now()}`;
  const body = {
    map_id: 'foret',
    title,
    description: 'Projet avec lieux et ressources',
    zone_ids: [zoneRow.id],
    tutorial_ids: [Number(tutoRow.id)],
  };
  if (markerRow?.id) body.marker_ids = [markerRow.id];

  const createRes = await request(app)
    .post('/api/task-projects')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send(body)
    .expect(201);
  assert.strictEqual(createRes.body.description, 'Projet avec lieux et ressources');
  assert.ok((createRes.body.zone_ids || []).includes(zoneRow.id));
  assert.ok((createRes.body.tutorial_ids || []).map(Number).includes(Number(tutoRow.id)));
  assert.ok((createRes.body.zones_linked || []).some((z) => z.id === zoneRow.id));
  assert.ok((createRes.body.tutorials_linked || []).some((t) => Number(t.id) === Number(tutoRow.id)));
  if (markerRow?.id) {
    assert.ok((createRes.body.marker_ids || []).includes(markerRow.id));
    assert.ok((createRes.body.markers_linked || []).some((m) => m.id === markerRow.id));
  }

  const clearBody = { zone_ids: [], marker_ids: [], tutorial_ids: [], title };
  const clearRes = await request(app)
    .put(`/api/task-projects/${createRes.body.id}`)
    .set('Authorization', 'Bearer ' + teacherToken)
    .send(clearBody)
    .expect(200);
  assert.strictEqual((clearRes.body.zone_ids || []).length, 0);
  assert.strictEqual((clearRes.body.marker_ids || []).length, 0);
  assert.strictEqual((clearRes.body.tutorial_ids || []).length, 0);

  await request(app)
    .delete(`/api/task-projects/${createRes.body.id}`)
    .set('Authorization', 'Bearer ' + teacherToken)
    .expect(200);
});

test('POST /api/tasks/:id/assign bloque l’inscription si le projet est en attente', async () => {
  const projectRes = await request(app)
    .post('/api/task-projects')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({ map_id: 'foret', title: `Projet en attente ${Date.now()}`, status: 'on_hold' })
    .expect(201);
  const projectId = projectRes.body.id;
  assert.strictEqual(projectRes.body.status, 'on_hold');

  const taskRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      title: `Tâche sur projet en attente ${Date.now()}`,
      map_id: 'foret',
      required_students: 1,
      project_id: projectId,
    })
    .expect(201);

  await request(app)
    .post(`/api/tasks/${taskRes.body.id}/assign`)
    .set('Authorization', 'Bearer ' + studentData.authToken)
    .send({
      firstName: studentData.first_name,
      lastName: studentData.last_name,
      studentId: studentData.id,
    })
    .expect(400);
});

test('POST /api/tasks accepte project_id et GET /api/tasks?project_id filtre correctement', async () => {
  const projectRes = await request(app)
    .post('/api/task-projects')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({ map_id: 'foret', title: `Projet lien tâche ${Date.now()}` })
    .expect(201);
  const projectId = projectRes.body.id;

  const taskRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      title: `Tâche liée projet ${Date.now()}`,
      map_id: 'foret',
      required_students: 1,
      project_id: projectId,
    })
    .expect(201);

  assert.strictEqual(taskRes.body.project_id, projectId);
  assert.ok(taskRes.body.project_title);

  const listRes = await request(app)
    .get(`/api/tasks?project_id=${encodeURIComponent(projectId)}`)
    .expect(200);
  assert.ok(Array.isArray(listRes.body));
  assert.ok(listRes.body.some((t) => t.id === taskRes.body.id));
});

test('POST/PUT /api/tasks persiste completion_mode', async () => {
  const created = await request(app)
    .post('/api/tasks')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      title: `Mode validation ${Date.now()}`,
      map_id: 'foret',
      required_students: 2,
      completion_mode: 'all_assignees_done',
    })
    .expect(201);

  assert.strictEqual(created.body.completion_mode, 'all_assignees_done');

  const updated = await request(app)
    .put(`/api/tasks/${created.body.id}`)
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({ completion_mode: 'single_done' })
    .expect(200);
  assert.strictEqual(updated.body.completion_mode, 'single_done');
});

test('mode all_assignees_done: /done est idempotent pour un même élève', async () => {
  const taskRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      title: `Idempotence done ${Date.now()}`,
      required_students: 1,
      completion_mode: 'all_assignees_done',
    })
    .expect(201);
  const taskId = taskRes.body.id;

  await request(app)
    .post(`/api/tasks/${taskId}/assign`)
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      firstName: studentData.first_name,
      lastName: studentData.last_name,
      studentId: studentData.id,
    })
    .expect(200);

  const firstDone = await request(app)
    .post(`/api/tasks/${taskId}/done`)
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      firstName: studentData.first_name,
      lastName: studentData.last_name,
      studentId: studentData.id,
    })
    .expect(200);
  assert.strictEqual(Number(firstDone.body.assignees_done_count), 1);
  assert.strictEqual(firstDone.body.status, 'done');

  const secondDone = await request(app)
    .post(`/api/tasks/${taskId}/done`)
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      firstName: studentData.first_name,
      lastName: studentData.last_name,
      studentId: studentData.id,
    })
    .expect(200);
  assert.strictEqual(Number(secondDone.body.assignees_done_count), 1);
  assert.strictEqual(secondDone.body.status, 'done');
});

test('DELETE /api/task-projects conserve les tâches et remet project_id à NULL', async () => {
  const projectRes = await request(app)
    .post('/api/task-projects')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({ map_id: 'foret', title: `Projet suppression ${Date.now()}` })
    .expect(201);
  const projectId = projectRes.body.id;

  const taskRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      title: `Tâche conservation ${Date.now()}`,
      map_id: 'foret',
      required_students: 1,
      project_id: projectId,
    })
    .expect(201);
  const taskId = taskRes.body.id;

  await request(app)
    .delete(`/api/task-projects/${projectId}`)
    .set('Authorization', 'Bearer ' + teacherToken)
    .expect(200);

  const taskAfter = await request(app)
    .get(`/api/tasks/${taskId}`)
    .expect(200);
  assert.strictEqual(taskAfter.body.id, taskId);
  assert.strictEqual(taskAfter.body.project_id, null);
});

// ─── Suppression de log (modération) ──────────────────────────────────────────
test('DELETE /api/tasks/:id/logs/:logId supprime un log', async () => {
  const taskRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({ title: 'Tâche log test', required_students: 1 })
    .expect(201);
  const taskId = taskRes.body.id;

  await request(app)
    .post(`/api/tasks/${taskId}/assign`)
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({ firstName: studentData.first_name, lastName: studentData.last_name, studentId: studentData.id });

  await request(app)
    .post(`/api/tasks/${taskId}/done`)
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({ comment: 'Test commentaire', firstName: studentData.first_name, lastName: studentData.last_name, studentId: studentData.id });

  const logsRes = await request(app)
    .get(`/api/tasks/${taskId}/logs`)
    .set('Authorization', 'Bearer ' + teacherToken)
    .expect(200);
  assert.ok(logsRes.body.length > 0);
  const logId = logsRes.body[0].id;

  await request(app)
    .delete(`/api/tasks/${taskId}/logs/${logId}`)
    .set('Authorization', 'Bearer ' + teacherToken)
    .expect(200);

  const afterRes = await request(app)
    .get(`/api/tasks/${taskId}/logs`)
    .set('Authorization', 'Bearer ' + teacherToken)
    .expect(200);
  assert.ok(!afterRes.body.find(l => l.id === logId));
});

// ─── Audit log ───────────────────────────────────────────────────────────────
test('GET /api/audit renvoie un tableau d\'actions', async () => {
  const res = await request(app)
    .get('/api/audit')
    .set('Authorization', 'Bearer ' + teacherToken)
    .expect(200);
  assert.ok(Array.isArray(res.body));
});

test('GET /api/audit sans token renvoie 401', async () => {
  await request(app).get('/api/audit').expect(401);
});

// ─── Observations ────────────────────────────────────────────────────────────
test('POST /api/observations crée une observation', async () => {
  const res = await request(app)
    .post('/api/observations')
    .set('Authorization', 'Bearer ' + studentData.authToken)
    .send({ studentId: studentData.id, content: 'Les tomates poussent bien', zone_id: null })
    .expect(201);
  assert.ok(res.body.id);
  assert.strictEqual(res.body.content, 'Les tomates poussent bien');
});

test('GET /api/observations/student/:id retourne les observations', async () => {
  const res = await request(app)
    .get(`/api/observations/student/${studentData.id}`)
    .set('Authorization', 'Bearer ' + studentData.authToken)
    .expect(200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.length > 0);
});

test('DELETE /api/observations/:id supprime une observation', async () => {
  const obs = await request(app)
    .post('/api/observations')
    .set('Authorization', 'Bearer ' + studentData.authToken)
    .send({ studentId: studentData.id, content: 'À supprimer' })
    .expect(201);

  await request(app)
    .delete(`/api/observations/${obs.body.id}`)
    .set('Authorization', 'Bearer ' + studentData.authToken)
    .expect(200);
});

// ─── Profil élève enrichi ────────────────────────────────────────────────────
test('PATCH /api/students/:id/profile met à jour pseudo/email/description', async () => {
  const tinyAvatar = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=';
  const res = await request(app)
    .patch(`/api/students/${studentData.id}/profile`)
    .send({
      pseudo: `profil_${Date.now()}`,
      email: `profil_${Date.now()}@example.com`,
      description: 'Description mise à jour',
      affiliation: 'n3',
      avatarData: tinyAvatar,
      currentPassword: 'pwd123',
    })
    .expect(200);

  assert.ok(res.body.pseudo);
  assert.ok(res.body.email);
  assert.strictEqual(res.body.description, 'Description mise à jour');
  assert.strictEqual(res.body.affiliation, 'n3');
  assert.ok(res.body.avatar_path);
  assert.strictEqual(res.body.password_hash, undefined);
});

test('PATCH /api/students/:id/profile rejette un email invalide', async () => {
  const res = await request(app)
    .patch(`/api/students/${studentData.id}/profile`)
    .send({ email: 'pas-un-email', currentPassword: 'pwd123' })
    .expect(400);
  assert.ok(res.body.error);
});

test('PATCH /api/students/:id/profile rejette un conflit pseudo', async () => {
  const pseudoConflict = `conflict_${Date.now()}`;
  await request(app)
    .post('/api/auth/register')
    .send({
      firstName: 'Another',
      lastName: `Student${Date.now()}`,
      password: 'pwd123',
      pseudo: pseudoConflict,
      email: `another_${Date.now()}@example.com`,
    })
    .expect(201);

  const res = await request(app)
    .patch(`/api/students/${studentData.id}/profile`)
    .send({ pseudo: pseudoConflict, currentPassword: 'pwd123' })
    .expect(409);
  assert.ok(res.body.error);
});

test('PATCH /api/students/:id/profile rejette un mot de passe actuel invalide', async () => {
  const res = await request(app)
    .patch(`/api/students/${studentData.id}/profile`)
    .send({ pseudo: `new_${Date.now()}`, currentPassword: 'bad-password' })
    .expect(401);
  assert.ok(res.body.error);
});

test('PATCH /api/students/:id/profile rejette une affiliation invalide', async () => {
  const res = await request(app)
    .patch(`/api/students/${studentData.id}/profile`)
    .send({ affiliation: 'n4', currentPassword: 'pwd123' })
    .expect(400);
  assert.ok(res.body.error);
});

test('GET /api/visit/content expose les contenus visite et les tutos choisis', async () => {
  const zoneRes = await request(app)
    .post('/api/visit/zones')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      map_id: 'foret',
      name: `Zone visite ${Date.now()}`,
      points: [{ xp: 10, yp: 10 }, { xp: 24, yp: 11 }, { xp: 18, yp: 23 }],
    })
    .expect(201);
  const zoneId = zoneRes.body.id;
  assert.ok(zoneId);

  await request(app)
    .put(`/api/visit/zones/${zoneId}`)
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      subtitle: 'Sous-titre zone visite',
      short_description: 'Description zone visite',
      details_title: 'Détails zone',
      details_text: 'Contenu dépliable zone',
      sort_order: 1,
      is_active: true,
    })
    .expect(200);

  const markerRes = await request(app)
    .post('/api/visit/markers')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      map_id: 'foret',
      x_pct: 44,
      y_pct: 41,
      label: `Repère visite ${Date.now()}`,
      emoji: '🧭',
    })
    .expect(201);

  await request(app)
    .put(`/api/visit/markers/${markerRes.body.id}`)
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      subtitle: 'Sous-titre repère visite',
      short_description: 'Description repère visite',
      details_text: 'Contenu repère',
      sort_order: 2,
      is_active: true,
    })
    .expect(200);

  const tutosRes = await request(app).get('/api/tutorials').expect(200);
  const firstTutorial = tutosRes.body[0]?.id;
  assert.ok(firstTutorial);

  await request(app)
    .put('/api/visit/tutorials')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({ tutorial_ids: [firstTutorial] })
    .expect(200);

  const visitRes = await request(app).get('/api/visit/content?map_id=foret').expect(200);
  assert.ok(Array.isArray(visitRes.body.zones));
  assert.ok(Array.isArray(visitRes.body.markers));
  assert.ok(Array.isArray(visitRes.body.tutorials));
  assert.ok(visitRes.body.zones.some((z) => z.id === zoneId));
  assert.ok(visitRes.body.markers.some((m) => m.id === markerRes.body.id));
  assert.ok(visitRes.body.tutorials.some((t) => t.id === firstTutorial));
});

/** JPEG 1×1 px minimal (valide) pour upload base64. */
const TINY_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCABAAEADASIAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAAAAIDBP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhADEAAAf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//Z';

test('POST /api/tutorials/:id/cover-photo-upload enregistre cover_image_url', async () => {
  const createRes = await request(app)
    .post('/api/tutorials')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      title: `Tuto couverture ${Date.now()}`,
      type: 'html',
      html_content: '<p>contenu minimal</p>',
      summary: 'résumé test couverture',
    })
    .expect(201);
  const tid = createRes.body.id;
  assert.ok(tid);

  const up = await request(app)
    .post(`/api/tutorials/${tid}/cover-photo-upload`)
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({ imageData: `data:image/jpeg;base64,${TINY_JPEG_B64}` })
    .expect(200);
  assert.ok(String(up.body.url || '').includes('/uploads/tutorials/'));
  assert.ok(up.body.tutorial?.cover_image_url);

  const list = await request(app).get('/api/tutorials').expect(200);
  const row = list.body.find((t) => Number(t.id) === Number(tid));
  assert.ok(row?.cover_image_url);
});

test('POST /api/visit/media avec image_data, GET /data et contenu public', async () => {
  const markerRes = await request(app)
    .post('/api/visit/markers')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      map_id: 'foret',
      x_pct: 42,
      y_pct: 43,
      label: `Repère media upload ${Date.now()}`,
      emoji: '📷',
    })
    .expect(201);

  const postRes = await request(app)
    .post('/api/visit/media')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      target_type: 'marker',
      target_id: markerRes.body.id,
      image_data: `data:image/jpeg;base64,${TINY_JPEG_B64}`,
      caption: 'upload test',
    })
    .expect(201);

  assert.ok(String(postRes.body.image_url || '').includes(`/api/visit/media/${postRes.body.id}/data`));
  assert.ok(!postRes.body.image_path);

  await request(app).get(`/api/visit/media/${postRes.body.id}/data`).expect(200);

  const contentRes = await request(app).get('/api/visit/content?map_id=foret').expect(200);
  const m = contentRes.body.markers.find((x) => x.id === markerRes.body.id);
  assert.ok(m);
  const media = (m.visit_media || []).find((x) => x.id === postRes.body.id);
  assert.ok(media);
  assert.ok(String(media.image_url || '').includes('/api/visit/media/'));

  await request(app)
    .delete(`/api/visit/media/${postRes.body.id}`)
    .set('Authorization', 'Bearer ' + teacherToken)
    .expect(200);
  await request(app).get(`/api/visit/media/${postRes.body.id}/data`).expect(404);

  await request(app)
    .delete(`/api/visit/markers/${markerRes.body.id}`)
    .set('Authorization', 'Bearer ' + teacherToken)
    .expect(200);
});

test('POST /api/visit/sync importe de manière sélective carte -> visite', async () => {
  const zoneA = await request(app)
    .post('/api/zones')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      name: `Zone source visite A ${Date.now()}`,
      map_id: 'foret',
      points: [{ xp: 11, yp: 11 }, { xp: 19, yp: 11 }, { xp: 15, yp: 20 }],
      stage: 'empty',
    })
    .expect(201);
  const zoneB = await request(app)
    .post('/api/zones')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      name: `Zone source visite B ${Date.now()}`,
      map_id: 'foret',
      points: [{ xp: 21, yp: 21 }, { xp: 29, yp: 21 }, { xp: 25, yp: 30 }],
      stage: 'empty',
    })
    .expect(201);

  const markerA = await request(app)
    .post('/api/map/markers')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      map_id: 'foret',
      x_pct: 41,
      y_pct: 41,
      label: `Repère source visite A ${Date.now()}`,
      emoji: '📍',
    })
    .expect(201);
  const markerB = await request(app)
    .post('/api/map/markers')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      map_id: 'foret',
      x_pct: 45,
      y_pct: 45,
      label: `Repère source visite B ${Date.now()}`,
      emoji: '📍',
    })
    .expect(201);

  const syncRes = await request(app)
    .post('/api/visit/sync')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      map_id: 'foret',
      direction: 'map_to_visit',
      zone_ids: [zoneA.body.id],
      marker_ids: [markerA.body.id],
    })
    .expect(200);
  assert.strictEqual(syncRes.body.ok, true);
  assert.strictEqual(syncRes.body.imported.zones, 1);
  assert.strictEqual(syncRes.body.imported.markers, 1);

  const visitRes = await request(app).get('/api/visit/content?map_id=foret').expect(200);
  assert.ok(visitRes.body.zones.some((z) => z.id === zoneA.body.id));
  assert.ok(!visitRes.body.zones.some((z) => z.id === zoneB.body.id));
  assert.ok(visitRes.body.markers.some((m) => m.id === markerA.body.id));
  assert.ok(!visitRes.body.markers.some((m) => m.id === markerB.body.id));
});

test('POST /api/visit/sync importe de manière sélective visite -> carte', async () => {
  const visitZoneA = await request(app)
    .post('/api/visit/zones')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      map_id: 'foret',
      name: `Zone source carte A ${Date.now()}`,
      points: [{ xp: 61, yp: 61 }, { xp: 70, yp: 61 }, { xp: 66, yp: 69 }],
    })
    .expect(201);
  const visitZoneB = await request(app)
    .post('/api/visit/zones')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      map_id: 'foret',
      name: `Zone source carte B ${Date.now()}`,
      points: [{ xp: 71, yp: 71 }, { xp: 79, yp: 71 }, { xp: 75, yp: 78 }],
    })
    .expect(201);

  const visitMarkerA = await request(app)
    .post('/api/visit/markers')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      map_id: 'foret',
      x_pct: 66,
      y_pct: 66,
      label: `Repère source carte A ${Date.now()}`,
      emoji: '🧭',
    })
    .expect(201);
  const visitMarkerB = await request(app)
    .post('/api/visit/markers')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      map_id: 'foret',
      x_pct: 69,
      y_pct: 69,
      label: `Repère source carte B ${Date.now()}`,
      emoji: '🧭',
    })
    .expect(201);

  const syncRes = await request(app)
    .post('/api/visit/sync')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      map_id: 'foret',
      direction: 'visit_to_map',
      zone_ids: [visitZoneA.body.id],
      marker_ids: [visitMarkerA.body.id],
    })
    .expect(200);
  assert.strictEqual(syncRes.body.ok, true);
  assert.strictEqual(syncRes.body.imported.zones, 1);
  assert.strictEqual(syncRes.body.imported.markers, 1);

  const zonesRes = await request(app).get('/api/zones?map_id=foret').expect(200);
  const markersRes = await request(app).get('/api/map/markers?map_id=foret').expect(200);
  assert.ok(zonesRes.body.some((z) => z.id === visitZoneA.body.id));
  assert.ok(!zonesRes.body.some((z) => z.id === visitZoneB.body.id));
  assert.ok(markersRes.body.some((m) => m.id === visitMarkerA.body.id));
  assert.ok(!markersRes.body.some((m) => m.id === visitMarkerB.body.id));
});

test('POST /api/visit/rebuild-from-map conserve l’éditorial par id et retire la visite hors carte', async () => {
  const ts = Date.now();
  const points = [{ xp: 31, yp: 31 }, { xp: 39, yp: 31 }, { xp: 35, yp: 38 }];
  const zoneMap = await request(app)
    .post('/api/zones')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      name: `Zone rebuild carte ${ts}`,
      map_id: 'foret',
      points,
      stage: 'empty',
    })
    .expect(201);

  await request(app)
    .post('/api/visit/sync')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      map_id: 'foret',
      direction: 'map_to_visit',
      zone_ids: [zoneMap.body.id],
      marker_ids: [],
    })
    .expect(200);

  const editorial = `Sous-titre conservé ${ts}`;
  await request(app)
    .put(`/api/visit/zones/${zoneMap.body.id}`)
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      subtitle: editorial,
      short_description: 'court',
      details_title: 'Détails',
      details_text: 'corps',
    })
    .expect(200);

  const newName = `Nom carte mis à jour ${ts}`;
  await request(app)
    .put(`/api/zones/${zoneMap.body.id}`)
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({ name: newName })
    .expect(200);

  const orphan = await request(app)
    .post('/api/visit/zones')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      map_id: 'foret',
      name: `Zone visite seule ${ts}`,
      points: [{ xp: 80, yp: 80 }, { xp: 88, yp: 80 }, { xp: 84, yp: 87 }],
    })
    .expect(201);

  const rebuild = await request(app)
    .post('/api/visit/rebuild-from-map')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({ map_id: 'foret' })
    .expect(200);
  assert.strictEqual(rebuild.body.ok, true);
  assert.ok(Number(rebuild.body.removed.zones) >= 1);
  assert.ok(Number(rebuild.body.imported.zones) >= 1);

  const content = await request(app).get('/api/visit/content?map_id=foret').expect(200);
  const z = content.body.zones.find((x) => x.id === zoneMap.body.id);
  assert.ok(z, 'zone carte toujours en visite');
  assert.strictEqual(z.name, newName);
  assert.strictEqual(z.visit_subtitle, editorial);
  assert.ok(!content.body.zones.some((x) => x.id === orphan.body.id));

  await request(app).delete(`/api/zones/${zoneMap.body.id}`).set('Authorization', 'Bearer ' + teacherToken).expect(200);
  await request(app)
    .post('/api/visit/rebuild-from-map')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({ map_id: 'foret' })
    .expect(200);
});

test('Progression visite anonyme persiste via cookie signé', async () => {
  const zoneRes = await request(app)
    .post('/api/visit/zones')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      map_id: 'foret',
      name: `Zone progress ${Date.now()}`,
      points: [{ xp: 42, yp: 42 }, { xp: 53, yp: 42 }, { xp: 46, yp: 50 }],
    })
    .expect(201);
  const zoneId = zoneRes.body.id;
  assert.ok(zoneId);

  const agent = request.agent(app);
  const firstProgress = await agent.get('/api/visit/progress').expect(200);
  assert.strictEqual(firstProgress.body.mode, 'anonymous');

  await agent
    .post('/api/visit/seen')
    .send({ target_type: 'zone', target_id: zoneId, seen: true })
    .expect(200);

  const secondProgress = await agent.get('/api/visit/progress').expect(200);
  assert.ok(secondProgress.body.seen.some((item) => item.target_type === 'zone' && item.target_id === zoneId));
});

test('Progression visite élève connecté persiste en BDD', async () => {
  const markerRes = await request(app)
    .post('/api/visit/markers')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      map_id: 'foret',
      x_pct: 35,
      y_pct: 35,
      label: `Repère progress ${Date.now()}`,
      emoji: '📍',
    })
    .expect(201);
  const markerId = markerRes.body.id;
  assert.ok(markerId);

  const studentToken = studentData.authToken;
  assert.ok(studentToken);

  await request(app)
    .post('/api/visit/seen')
    .set('Authorization', `Bearer ${studentToken}`)
    .send({
      target_type: 'marker',
      target_id: markerId,
      seen: true,
    })
    .expect(200);

  const progress = await request(app)
    .get('/api/visit/progress')
    .set('Authorization', `Bearer ${studentToken}`)
    .expect(200);

  assert.strictEqual(progress.body.mode, 'student');
  assert.ok(progress.body.seen.some((item) => item.target_type === 'marker' && item.target_id === markerId));
});

test('GET /api/visit/progress?student_id refuse sans jeton élève', async () => {
  await request(app)
    .get(`/api/visit/progress?student_id=${encodeURIComponent(studentData.id)}`)
    .expect(401);
});

test('GET /api/visit/progress?student_id refuse si le jeton est un autre élève', async () => {
  const other = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Prog', lastName: `X${Date.now()}`, password: 'pwd123', affiliation: 'n3' })
    .expect(201);
  await setStudentPrimaryRole(other.body.id, 'eleve_novice');
  await request(app)
    .get(`/api/visit/progress?student_id=${encodeURIComponent(studentData.id)}`)
    .set('Authorization', `Bearer ${other.body.authToken}`)
    .expect(403);
});

test('POST /api/visit/seen avec student_id refuse sans authentification', async () => {
  const markerRes = await request(app)
    .post('/api/visit/markers')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      map_id: 'foret',
      x_pct: 36,
      y_pct: 36,
      label: `Repère IDOR ${Date.now()}`,
      emoji: '📍',
    })
    .expect(201);
  await request(app)
    .post('/api/visit/seen')
    .send({
      student_id: studentData.id,
      target_type: 'marker',
      target_id: markerRes.body.id,
      seen: true,
    })
    .expect(401);
});

test('POST /api/visit/seen refuse student_id différent du compte authentifié', async () => {
  const other = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Other', lastName: `V${Date.now()}`, password: 'pwd123', affiliation: 'n3' })
    .expect(201);
  await setStudentPrimaryRole(other.body.id, 'eleve_novice');

  const markerRes = await request(app)
    .post('/api/visit/markers')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      map_id: 'foret',
      x_pct: 37,
      y_pct: 37,
      label: `Repère mismatch ${Date.now()}`,
      emoji: '📍',
    })
    .expect(201);

  await request(app)
    .post('/api/visit/seen')
    .set('Authorization', `Bearer ${other.body.authToken}`)
    .send({
      student_id: studentData.id,
      target_type: 'marker',
      target_id: markerRes.body.id,
      seen: true,
    })
    .expect(403);
});

test('GET /api/visit/stats sans token renvoie 401', async () => {
  await request(app).get('/api/visit/stats').expect(401);
});

test('GET /api/visit/stats renvoie une structure complète', async () => {
  const res = await request(app)
    .get('/api/visit/stats')
    .set('Authorization', 'Bearer ' + teacherToken)
    .expect(200);

  assert.ok(res.body.generated_at);
  assert.ok(res.body.active_targets);
  assert.ok(res.body.kpis);
  assert.ok(res.body.breakdown);
  assert.strictEqual(typeof res.body.active_targets.total, 'number');
  assert.strictEqual(typeof res.body.kpis.sessions_total, 'number');
  assert.strictEqual(typeof res.body.kpis.completion_rate_pct, 'number');
});

test('GET /api/visit/stats gère le cas limite sans cibles actives', async () => {
  await execute('DELETE FROM visit_seen_students');
  await execute('DELETE FROM visit_seen_anonymous');
  await execute('DELETE FROM visit_media');
  await execute('DELETE FROM visit_markers');
  await execute('DELETE FROM visit_zones');

  const res = await request(app)
    .get('/api/visit/stats')
    .set('Authorization', 'Bearer ' + teacherToken)
    .expect(200);

  assert.strictEqual(res.body.active_targets.total, 0);
  assert.strictEqual(res.body.kpis.sessions_total, 0);
  assert.strictEqual(res.body.kpis.completed_visits_total, 0);
  assert.strictEqual(res.body.kpis.seen_actions_total, 0);
  assert.strictEqual(res.body.kpis.completion_rate_pct, 0);
});

test('GET /api/visit/stats calcule correctement sessions, complétion et visites terminées', async () => {
  await execute('DELETE FROM visit_seen_students');
  await execute('DELETE FROM visit_seen_anonymous');
  await execute('DELETE FROM visit_media');
  await execute('DELETE FROM visit_markers');
  await execute('DELETE FROM visit_zones');

  const zoneRes = await request(app)
    .post('/api/visit/zones')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      map_id: 'foret',
      name: `Zone stats ${Date.now()}`,
      points: [{ xp: 12, yp: 13 }, { xp: 24, yp: 14 }, { xp: 18, yp: 26 }],
    })
    .expect(201);
  const markerRes = await request(app)
    .post('/api/visit/markers')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      map_id: 'foret',
      x_pct: 33,
      y_pct: 37,
      label: `Repère stats ${Date.now()}`,
      emoji: '📍',
    })
    .expect(201);

  const studentReg = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Stats', lastName: `Visit${Date.now()}`, password: 'pwd123' })
    .expect(201);
  const studentToken = studentReg.body.authToken;
  assert.ok(studentToken, 'authToken élève après inscription');

  await request(app)
    .post('/api/visit/seen')
    .set('Authorization', 'Bearer ' + studentToken)
    .send({ target_type: 'zone', target_id: zoneRes.body.id, seen: true })
    .expect(200);
  await request(app)
    .post('/api/visit/seen')
    .set('Authorization', 'Bearer ' + studentToken)
    .send({ target_type: 'marker', target_id: markerRes.body.id, seen: true })
    .expect(200);

  const anonAgent = request.agent(app);
  await anonAgent
    .post('/api/visit/seen')
    .send({ target_type: 'zone', target_id: zoneRes.body.id, seen: true })
    .expect(200);

  const res = await request(app)
    .get('/api/visit/stats')
    .set('Authorization', 'Bearer ' + teacherToken)
    .expect(200);

  assert.strictEqual(res.body.active_targets.total, 2);
  assert.strictEqual(res.body.active_targets.zones, 1);
  assert.strictEqual(res.body.active_targets.markers, 1);
  assert.strictEqual(res.body.kpis.sessions_total, 2);
  assert.strictEqual(res.body.kpis.seen_actions_total, 3);
  assert.strictEqual(res.body.kpis.completed_visits_total, 1);
  assert.strictEqual(res.body.kpis.completion_rate_pct, 75);

  assert.strictEqual(res.body.breakdown.students.sessions, 1);
  assert.strictEqual(res.body.breakdown.students.seen_actions, 2);
  assert.strictEqual(res.body.breakdown.students.completed_visits, 1);
  assert.strictEqual(res.body.breakdown.students.completion_rate_pct, 100);

  assert.strictEqual(res.body.breakdown.anonymous.sessions, 1);
  assert.strictEqual(res.body.breakdown.anonymous.seen_actions, 1);
  assert.strictEqual(res.body.breakdown.anonymous.completed_visits, 0);
  assert.strictEqual(res.body.breakdown.anonymous.completion_rate_pct, 50);
});
