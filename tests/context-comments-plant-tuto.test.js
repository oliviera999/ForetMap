require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');

test.before(async () => {
  await initSchema();
});

async function registerStudent(prefix) {
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      firstName: prefix,
      lastName: `Pt${stamp}`,
      email: `${prefix.toLowerCase()}_${stamp}@example.com`,
      password: 'pass1234',
    })
    .expect(201);
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identifier: res.body.email, password: 'pass1234' })
    .expect(200);
  return { authToken: login.body.authToken };
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

test('context-comments plant + tutorial', async () => {
  const student = await registerStudent('Ptut');
  const stamp = Date.now();
  const plantIns = await execute(
    'INSERT INTO plants (name, emoji, description) VALUES (?, ?, ?)',
    [`Ctx plant ${stamp}`, '🌿', 'Test']
  );
  const plantId = String(plantIns.insertId);
  const slug = `ctx-tuto-${stamp}`;
  const tutoIns = await execute(
    'INSERT INTO tutorials (title, slug, type, summary, sort_order, is_active) VALUES (?, ?, ?, ?, 0, 1)',
    [`Tuto ${stamp}`, slug, 'html', 'S']
  );
  const tutorialId = String(tutoIns.insertId);

  const plantRes = await request(app)
    .post('/api/context-comments')
    .set(auth(student.authToken))
    .send({ contextType: 'plant', contextId: plantId, body: 'Commentaire plante.' });
  if (plantRes.status !== 201) {
    // eslint-disable-next-line no-console
    console.log('plant fail', plantRes.status, plantRes.body);
  }
  assert.strictEqual(plantRes.status, 201, JSON.stringify(plantRes.body));

  const tutoRes = await request(app)
    .post('/api/context-comments')
    .set(auth(student.authToken))
    .send({ contextType: 'tutorial', contextId: tutorialId, body: 'Commentaire tuto.' });
  if (tutoRes.status !== 201) {
    // eslint-disable-next-line no-console
    console.log('tuto fail', tutoRes.status, tutoRes.body);
  }
  assert.strictEqual(tutoRes.status, 201, JSON.stringify(tutoRes.body));
});
