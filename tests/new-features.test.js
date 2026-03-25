require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const { initSchema } = require('../database');
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
      avatarData: tinyAvatar,
      currentPassword: 'pwd123',
    })
    .expect(200);

  assert.ok(res.body.pseudo);
  assert.ok(res.body.email);
  assert.strictEqual(res.body.description, 'Description mise à jour');
  assert.ok(res.body.avatar_path);
  assert.strictEqual(res.body.password, undefined);
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

test('GET /api/visit/content expose les contenus visite et les tutos choisis', async () => {
  const zonesRes = await request(app).get('/api/zones?map_id=foret').expect(200);
  const zoneId = zonesRes.body[0]?.id;
  assert.ok(zoneId);

  const markerRes = await request(app)
    .post('/api/map/markers')
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

test('Progression visite anonyme persiste via cookie signé', async () => {
  const zonesRes = await request(app).get('/api/zones?map_id=foret').expect(200);
  const zoneId = zonesRes.body[0]?.id;
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
  const markersRes = await request(app).get('/api/map/markers?map_id=foret').expect(200);
  const markerId = markersRes.body[0]?.id;
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
