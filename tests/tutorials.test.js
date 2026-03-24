require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema } = require('../database');

let teacherToken;

test.before(async () => {
  await initSchema();
  const auth = await request(app)
    .post('/api/auth/teacher')
    .send({ pin: process.env.TEACHER_PIN || '1234' })
    .expect(200);
  teacherToken = auth.body.token;
});

test('GET /api/tutorials renvoie les tutoriels seedés', async () => {
  const res = await request(app).get('/api/tutorials').expect(200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.length >= 4);
  assert.ok(res.body.some((t) => t.slug === 'arrosage-potager'));
});

test('POST /api/tutorials sans token prof renvoie 401', async () => {
  await request(app)
    .post('/api/tutorials')
    .send({
      title: 'Tuto interdit',
      type: 'html',
      html_content: '<h1>Test</h1>',
    })
    .expect(401);
});

test('POST /api/tutorials crée un tuto HTML, téléchargeable en HTML/PDF', async () => {
  const create = await request(app)
    .post('/api/tutorials')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      title: `Tuto HTML ${Date.now()}`,
      summary: 'Résumé test',
      type: 'html',
      html_content: '<h1>Tutoriel test</h1><p>Contenu PDF test</p>',
      sort_order: 99,
    })
    .expect(201);
  assert.ok(create.body.id);
  assert.strictEqual(create.body.type, 'html');

  const htmlRes = await request(app)
    .get(`/api/tutorials/${create.body.id}/download/html`)
    .expect(200);
  assert.ok((htmlRes.headers['content-type'] || '').includes('text/html'));
  assert.ok((htmlRes.text || '').includes('Tutoriel test'));

  const pdfRes = await request(app)
    .get(`/api/tutorials/${create.body.id}/download/pdf`)
    .expect(200);
  assert.ok((pdfRes.headers['content-type'] || '').includes('application/pdf'));
  assert.ok((pdfRes.headers['content-disposition'] || '').includes('.pdf'));
});

test('POST /api/tasks accepte tutorial_ids et renvoie tutorials_linked', async () => {
  const tutorialsRes = await request(app).get('/api/tutorials').expect(200);
  const tutorialId = tutorialsRes.body[0]?.id;
  assert.ok(tutorialId, 'Un tutoriel actif est requis pour le test');

  const taskCreate = await request(app)
    .post('/api/tasks')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      title: `Tâche avec tuto ${Date.now()}`,
      required_students: 1,
      tutorial_ids: [tutorialId],
    })
    .expect(201);

  assert.ok(Array.isArray(taskCreate.body.tutorial_ids));
  assert.ok(taskCreate.body.tutorial_ids.includes(tutorialId));
  assert.ok(Array.isArray(taskCreate.body.tutorials_linked));
  assert.ok(taskCreate.body.tutorials_linked.some((t) => t.id === tutorialId));
});
