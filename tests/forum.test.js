require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initDatabase, queryOne, execute } = require('../database');

test.before(async () => {
  await initDatabase();
});

async function registerStudent(prefix) {
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      firstName: prefix,
      lastName: `Forum${stamp}`,
      email: `${prefix.toLowerCase()}_${stamp}@example.com`,
      password: 'pass1234',
    })
    .expect(201);
  assert.ok(res.body?.id);
  assert.ok(res.body?.authToken);
  const noviceRole = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_novice' LIMIT 1");
  assert.ok(noviceRole?.id);
  await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', ['student', res.body.id]);
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
    ['student', res.body.id, noviceRole.id]
  );
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identifier: res.body.email, password: 'pass1234' })
    .expect(200);
  assert.ok(login.body?.authToken);
  res.body.authToken = login.body.authToken;
  return res.body;
}

async function teacherToken() {
  const res = await request(app)
    .post('/api/auth/login')
    .send({
      identifier: process.env.TEACHER_ADMIN_EMAIL,
      password: process.env.TEACHER_ADMIN_PASSWORD,
    })
    .expect(200);
  assert.ok(res.body?.authToken);
  return res.body.authToken;
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

test('Forum: refuse l’accès sans authentification', async () => {
  await request(app).get('/api/forum/threads').expect(401);
});

test('Forum: un élève peut créer un sujet et répondre', async () => {
  const student = await registerStudent('EleveForum');
  const create = await request(app)
    .post('/api/forum/threads')
    .set(auth(student.authToken))
    .send({ title: `Sujet test ${Date.now()}`, body: 'Premier message de test forum.' })
    .expect(201);

  const threadId = create.body?.thread?.id;
  assert.ok(threadId);

  await request(app)
    .post(`/api/forum/threads/${threadId}/posts`)
    .set(auth(student.authToken))
    .send({ body: 'Seconde réponse de test.' })
    .expect(201);

  const detail = await request(app)
    .get(`/api/forum/threads/${threadId}`)
    .set(auth(student.authToken))
    .expect(200);
  assert.strictEqual(detail.body.thread.id, threadId);
  assert.ok(Array.isArray(detail.body.posts));
  assert.ok(detail.body.posts.length >= 2);
});

test('Forum: un prof peut verrouiller un sujet', async () => {
  const student = await registerStudent('LockForum');
  const teacher = await teacherToken();

  const create = await request(app)
    .post('/api/forum/threads')
    .set(auth(student.authToken))
    .send({ title: `Sujet lock ${Date.now()}`, body: 'Message initial.' })
    .expect(201);
  const threadId = create.body.thread.id;

  const lockRes = await request(app)
    .patch(`/api/forum/threads/${threadId}/lock`)
    .set(auth(teacher))
    .send({ locked: true })
    .expect(200);
  assert.strictEqual(Number(lockRes.body.is_locked), 1);

  await request(app)
    .post(`/api/forum/threads/${threadId}/posts`)
    .set(auth(student.authToken))
    .send({ body: 'Réponse bloquée quand verrouillé.' })
    .expect(409);
});

test('Forum: un élève ne peut pas verrouiller un sujet', async () => {
  const student = await registerStudent('NoLockForum');
  const create = await request(app)
    .post('/api/forum/threads')
    .set(auth(student.authToken))
    .send({ title: `Sujet no lock ${Date.now()}`, body: 'Message initial.' })
    .expect(201);
  const threadId = create.body.thread.id;

  await request(app)
    .patch(`/api/forum/threads/${threadId}/lock`)
    .set(auth(student.authToken))
    .send({ locked: true })
    .expect(403);
});

test('Forum: suppression de message selon droits', async () => {
  const owner = await registerStudent('OwnerForum');
  const other = await registerStudent('OtherForum');

  const thread = await request(app)
    .post('/api/forum/threads')
    .set(auth(owner.authToken))
    .send({ title: `Sujet droits ${Date.now()}`, body: 'Post initial.' })
    .expect(201);
  const threadId = thread.body.thread.id;

  const otherPost = await request(app)
    .post(`/api/forum/threads/${threadId}/posts`)
    .set(auth(other.authToken))
    .send({ body: 'Message de l’autre élève.' })
    .expect(201);
  const postId = otherPost.body.id;

  await request(app)
    .delete(`/api/forum/posts/${postId}`)
    .set(auth(owner.authToken))
    .expect(403);

  await request(app)
    .delete(`/api/forum/posts/${postId}`)
    .set(auth(other.authToken))
    .expect(200);
});

test('Forum: signalement de message et prévention des doublons', async () => {
  const author = await registerStudent('AuthorForum');
  const reporter = await registerStudent('ReporterForum');

  const thread = await request(app)
    .post('/api/forum/threads')
    .set(auth(author.authToken))
    .send({ title: `Sujet report ${Date.now()}`, body: 'Post initial signalement.' })
    .expect(201);
  const threadId = thread.body.thread.id;

  const post = await request(app)
    .post(`/api/forum/threads/${threadId}/posts`)
    .set(auth(author.authToken))
    .send({ body: 'Message à signaler.' })
    .expect(201);

  await request(app)
    .post(`/api/forum/posts/${post.body.id}/report`)
    .set(auth(reporter.authToken))
    .send({ reason: 'Contenu inadapté pour le forum de classe.' })
    .expect(201);

  await request(app)
    .post(`/api/forum/posts/${post.body.id}/report`)
    .set(auth(reporter.authToken))
    .send({ reason: 'Second signalement identique.' })
    .expect(409);
});
