require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const { initSchema, execute } = require('../database');
const { app } = require('../server');
const request = require('supertest');

let teacherToken;
let studentData;

test.before(async () => {
  await initSchema();
  const auth = await request(app)
    .post('/api/auth/teacher')
    .send({ pin: process.env.TEACHER_PIN || '1234' });
  teacherToken = auth.body.token;

  const reg = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Feature', lastName: 'Test' + Date.now(), password: 'pwd123' });
  studentData = reg.body;
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
    .send({ title: renamed, status: 'on_hold' })
    .expect(200);
  assert.strictEqual(updateRes.body.title, renamed);
  assert.strictEqual(updateRes.body.status, 'on_hold');

  await request(app)
    .delete(`/api/task-projects/${projectId}`)
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
    .send({
      firstName: studentData.first_name,
      lastName: studentData.last_name,
      studentId: studentData.id,
    })
    .expect(200);

  const firstDone = await request(app)
    .post(`/api/tasks/${taskId}/done`)
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
    .send({ firstName: studentData.first_name, lastName: studentData.last_name, studentId: studentData.id });

  await request(app)
    .post(`/api/tasks/${taskId}/done`)
    .send({ comment: 'Test commentaire', firstName: studentData.first_name, lastName: studentData.last_name, studentId: studentData.id });

  const logsRes = await request(app).get(`/api/tasks/${taskId}/logs`).expect(200);
  assert.ok(logsRes.body.length > 0);
  const logId = logsRes.body[0].id;

  await request(app)
    .delete(`/api/tasks/${taskId}/logs/${logId}`)
    .set('Authorization', 'Bearer ' + teacherToken)
    .expect(200);

  const afterRes = await request(app).get(`/api/tasks/${taskId}/logs`).expect(200);
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
    .send({ studentId: studentData.id, content: 'Les tomates poussent bien', zone_id: null })
    .expect(201);
  assert.ok(res.body.id);
  assert.strictEqual(res.body.content, 'Les tomates poussent bien');
});

test('GET /api/observations/student/:id retourne les observations', async () => {
  const res = await request(app)
    .get(`/api/observations/student/${studentData.id}`)
    .expect(200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.length > 0);
});

test('DELETE /api/observations/:id supprime une observation', async () => {
  const obs = await request(app)
    .post('/api/observations')
    .send({ studentId: studentData.id, content: 'À supprimer' })
    .expect(201);

  await request(app)
    .delete(`/api/observations/${obs.body.id}`)
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

  await request(app)
    .post('/api/visit/seen')
    .send({
      student_id: studentData.id,
      target_type: 'marker',
      target_id: markerId,
      seen: true,
    })
    .expect(200);

  const progress = await request(app)
    .get(`/api/visit/progress?student_id=${encodeURIComponent(studentData.id)}`)
    .expect(200);

  assert.strictEqual(progress.body.mode, 'student');
  assert.ok(progress.body.seen.some((item) => item.target_type === 'marker' && item.target_id === markerId));
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

  await request(app)
    .post('/api/visit/seen')
    .send({ student_id: studentReg.body.id, target_type: 'zone', target_id: zoneRes.body.id, seen: true })
    .expect(200);
  await request(app)
    .post('/api/visit/seen')
    .send({ student_id: studentReg.body.id, target_type: 'marker', target_id: markerRes.body.id, seen: true })
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
