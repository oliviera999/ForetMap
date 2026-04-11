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
      affiliation: 'both',
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
  const loginEmail = String(process.env.TEACHER_ADMIN_EMAIL || '').trim();
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [loginEmail]
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(teacher?.id, 'Compte admin enseignant introuvable');
  assert.ok(adminRole?.id, 'Rôle admin introuvable');
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

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function setAllowedReactionEmojis(raw) {
  const token = await teacherToken();
  await request(app)
    .put('/api/settings/admin/ui.reactions.allowed_emojis')
    .set(auth(token))
    .send({ value: String(raw || '').trim() })
    .expect(200);
}

test('Forum: refuse l’accès sans authentification', async () => {
  await request(app).get('/api/forum/threads').expect(401);
});

test('Forum: module désactivé renvoie 503', async () => {
  const token = await teacherToken();
  await request(app)
    .put('/api/settings/admin/ui.modules.forum_enabled')
    .set(auth(token))
    .send({ value: false })
    .expect(200);
  const student = await registerStudent('ForumOff');
  const res = await request(app)
    .get('/api/forum/threads')
    .set(auth(student.authToken))
    .expect(503);
  assert.match(String(res.body?.error || ''), /désactivé/i);
  await request(app)
    .put('/api/settings/admin/ui.modules.forum_enabled')
    .set(auth(token))
    .send({ value: true })
    .expect(200);
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

test('Forum: réactions emoji toggle et agrégées sur les messages', async () => {
  const author = await registerStudent('ReactForumAuthor');
  const reactor = await registerStudent('ReactForumUser');
  await setAllowedReactionEmojis('👍 🤝');

  const thread = await request(app)
    .post('/api/forum/threads')
    .set(auth(author.authToken))
    .send({ title: `Sujet réactions ${Date.now()}`, body: 'Post initial pour réactions.' })
    .expect(201);
  const threadId = thread.body.thread.id;

  const reply = await request(app)
    .post(`/api/forum/threads/${threadId}/posts`)
    .set(auth(author.authToken))
    .send({ body: 'Message à réagir.' })
    .expect(201);
  const postId = reply.body.id;

  const reacted = await request(app)
    .post(`/api/forum/posts/${postId}/reactions`)
    .set(auth(reactor.authToken))
    .send({ emoji: '👍' })
    .expect(200);
  assert.strictEqual(reacted.body.reacted, true);

  const detailAfterReact = await request(app)
    .get(`/api/forum/threads/${threadId}`)
    .set(auth(reactor.authToken))
    .expect(200);
  const reactedPost = detailAfterReact.body.posts.find((p) => p.id === postId);
  assert.ok(reactedPost);
  const reaction = reactedPost.reactions.find((r) => r.emoji === '👍');
  assert.ok(reaction);
  assert.strictEqual(Number(reaction.count), 1);
  assert.strictEqual(!!reaction.reacted_by_me, true);

  const unreacted = await request(app)
    .post(`/api/forum/posts/${postId}/reactions`)
    .set(auth(reactor.authToken))
    .send({ emoji: '👍' })
    .expect(200);
  assert.strictEqual(unreacted.body.reacted, false);

  await request(app)
    .post(`/api/forum/posts/${postId}/reactions`)
    .set(auth(reactor.authToken))
    .send({ emoji: '😡' })
    .expect(400);

  await setAllowedReactionEmojis('👍 ❤️ 😂 😮 😢 😡 🔥 👏');
});

test('Forum: n3beur sans participation — lecture OK, création sujet 403', async () => {
  let forumRoRole = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_forum_ro_test' LIMIT 1");
  if (!forumRoRole?.id) {
    await execute(
      `INSERT INTO roles (slug, display_name, emoji, min_done_tasks, display_order, \`rank\`, is_system, forum_participate, context_comment_participate)
       VALUES ('eleve_forum_ro_test', 'Test forum lecture seule', '🧪', 0, 9989, 1, 0, 0, 1)`
    );
    forumRoRole = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_forum_ro_test' LIMIT 1");
  }
  assert.ok(forumRoRole?.id);
  const student = await registerStudent('ForumReadOnly');
  await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', ['student', student.id]);
  await execute(
    `INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES ('student', ?, ?, 1)
     ON DUPLICATE KEY UPDATE is_primary = 1`,
    [student.id, forumRoRole.id]
  );
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identifier: student.email, password: 'pass1234' })
    .expect(200);
  const token = login.body.authToken;
  await request(app).get('/api/forum/threads').set(auth(token)).expect(200);
  const res = await request(app)
    .post('/api/forum/threads')
    .set(auth(token))
    .send({ title: `Lecture seule ${Date.now()}`, body: 'Ne doit pas être accepté.' })
    .expect(403);
  assert.strictEqual(res.body.code, 'FORUM_READ_ONLY');
});

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5qXg8AAAAASUVORK5CYII=';

test('Forum: premier message et réponse avec photos (image_urls)', async () => {
  const student = await registerStudent('ForumImg');
  const create = await request(app)
    .post('/api/forum/threads')
    .set(auth(student.authToken))
    .send({
      title: `Sujet photo ${Date.now()}`,
      body: 'Message avec une image.',
      images: [TINY_PNG_DATA_URL],
    })
    .expect(201);
  const threadId = create.body?.thread?.id;
  assert.ok(threadId);

  const detail = await request(app)
    .get(`/api/forum/threads/${threadId}`)
    .set(auth(student.authToken))
    .expect(200);
  const firstPost = detail.body.posts.find((p) => Array.isArray(p.image_urls) && p.image_urls.length > 0);
  assert.ok(firstPost);
  assert.match(firstPost.image_urls[0], /^\/uploads\/forum-posts\//);

  await request(app)
    .post(`/api/forum/threads/${threadId}/posts`)
    .set(auth(student.authToken))
    .send({ images: [TINY_PNG_DATA_URL] })
    .expect(201);

  const detail2 = await request(app)
    .get(`/api/forum/threads/${threadId}`)
    .set(auth(student.authToken))
    .expect(200);
  const withSoloPhoto = detail2.body.posts.find((p) => p.body === '(Photo)');
  assert.ok(withSoloPhoto);
  assert.strictEqual(withSoloPhoto.image_urls.length, 1);
});
