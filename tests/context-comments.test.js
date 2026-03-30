require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');

test.before(async () => {
  await initSchema();
});

async function registerStudent(prefix) {
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      firstName: prefix,
      lastName: `Ctx${stamp}`,
      email: `${prefix.toLowerCase()}_${stamp}@example.com`,
      password: 'pass1234',
    })
    .expect(201);
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
  const requiredPermissions = [
    'zones.manage', 'tasks.manage',
    'context.comments.moderate',
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

async function createContextFixture(token) {
  const zone = await request(app)
    .post('/api/zones')
    .set(auth(token))
    .send({
      name: `Zone commentaires ${Date.now()}`,
      map_id: 'foret',
      points: [{ xp: 18, yp: 18 }, { xp: 26, yp: 18 }, { xp: 22, yp: 26 }],
      stage: 'empty',
    })
    .expect(201);
  const project = await request(app)
    .post('/api/task-projects')
    .set(auth(token))
    .send({
      map_id: 'foret',
      title: `Projet commentaires ${Date.now()}`,
      description: 'Projet de test commentaires contextuels',
    })
    .expect(201);
  const task = await request(app)
    .post('/api/tasks')
    .set(auth(token))
    .send({
      title: `Tâche commentaires ${Date.now()}`,
      map_id: 'foret',
      project_id: project.body.id,
      zone_id: zone.body.id,
      required_students: 1,
    })
    .expect(201);
  return { zoneId: zone.body.id, projectId: project.body.id, taskId: task.body.id };
}

test('Commentaires contextuels: refuse l’accès sans authentification', async () => {
  await request(app).get('/api/context-comments?contextType=task&contextId=t1').expect(401);
});

test('Commentaires contextuels: module désactivé renvoie 503', async () => {
  const teacher = await teacherToken();
  const { taskId } = await createContextFixture(teacher);
  await request(app)
    .put('/api/settings/admin/ui.modules.context_comments_enabled')
    .set(auth(teacher))
    .send({ value: false })
    .expect(200);
  const student = await registerStudent('CtxOff');
  const res = await request(app)
    .get(`/api/context-comments?contextType=task&contextId=${encodeURIComponent(taskId)}`)
    .set(auth(student.authToken))
    .expect(503);
  assert.match(String(res.body?.error || ''), /désactivé/i);
  await request(app)
    .put('/api/settings/admin/ui.modules.context_comments_enabled')
    .set(auth(teacher))
    .send({ value: true })
    .expect(200);
});

test('Commentaires contextuels: cycle création/lecture/suppression sur une tâche', async () => {
  const teacher = await teacherToken();
  const student = await registerStudent('ComTask');
  const { taskId } = await createContextFixture(teacher);

  const created = await request(app)
    .post('/api/context-comments')
    .set(auth(student.authToken))
    .send({ contextType: 'task', contextId: taskId, body: 'Commentaire test sur tâche.' })
    .expect(201);
  assert.ok(created.body?.id);

  const list = await request(app)
    .get(`/api/context-comments?contextType=task&contextId=${encodeURIComponent(taskId)}`)
    .set(auth(student.authToken))
    .expect(200);
  assert.ok(Array.isArray(list.body?.items));
  assert.ok(list.body.items.some((item) => item.id === created.body.id));

  await request(app)
    .delete(`/api/context-comments/${created.body.id}`)
    .set(auth(student.authToken))
    .expect(200);

  const afterDelete = await request(app)
    .get(`/api/context-comments?contextType=task&contextId=${encodeURIComponent(taskId)}`)
    .set(auth(student.authToken))
    .expect(200);
  const deleted = afterDelete.body.items.find((item) => item.id === created.body.id);
  assert.ok(deleted);
  assert.strictEqual(Number(deleted.is_deleted), 1);
  assert.strictEqual(deleted.body, '');
});

test('Commentaires contextuels: pagination triée du plus récent au plus ancien', async () => {
  const teacher = await teacherToken();
  const student = await registerStudent('ComOrder');
  const { taskId } = await createContextFixture(teacher);

  const createdIds = [];
  for (let i = 1; i <= 12; i += 1) {
    const created = await request(app)
      .post('/api/context-comments')
      .set(auth(student.authToken))
      .send({ contextType: 'task', contextId: taskId, body: `Commentaire ordre ${i}` })
      .expect(201);
    await execute(
      'UPDATE context_comments SET created_at = DATE_ADD(created_at, INTERVAL ? SECOND) WHERE id = ?',
      [i, created.body.id]
    );
    createdIds.push(created.body.id);
  }

  const firstPage = await request(app)
    .get(`/api/context-comments?contextType=task&contextId=${encodeURIComponent(taskId)}&page=1&page_size=10`)
    .set(auth(student.authToken))
    .expect(200);
  assert.strictEqual(firstPage.body.items.length, 10);
  assert.strictEqual(firstPage.body.items[0].id, createdIds[11]);
  assert.strictEqual(firstPage.body.items[9].id, createdIds[2]);

  const secondPage = await request(app)
    .get(`/api/context-comments?contextType=task&contextId=${encodeURIComponent(taskId)}&page=2&page_size=10`)
    .set(auth(student.authToken))
    .expect(200);
  assert.strictEqual(secondPage.body.items.length, 2);
  assert.strictEqual(secondPage.body.items[0].id, createdIds[1]);
  assert.strictEqual(secondPage.body.items[1].id, createdIds[0]);
});

test('Commentaires contextuels: un autre élève ne peut pas supprimer un commentaire', async () => {
  const teacher = await teacherToken();
  const author = await registerStudent('ComAuthor');
  const other = await registerStudent('ComOther');
  const { taskId } = await createContextFixture(teacher);

  const created = await request(app)
    .post('/api/context-comments')
    .set(auth(author.authToken))
    .send({ contextType: 'task', contextId: taskId, body: 'Commentaire auteur' })
    .expect(201);

  await request(app)
    .delete(`/api/context-comments/${created.body.id}`)
    .set(auth(other.authToken))
    .expect(403);
});

test('Commentaires contextuels: signalement et prévention des doublons', async () => {
  const teacher = await teacherToken();
  const author = await registerStudent('ComRepAuthor');
  const reporter = await registerStudent('ComRepUser');
  const { zoneId } = await createContextFixture(teacher);

  const created = await request(app)
    .post('/api/context-comments')
    .set(auth(author.authToken))
    .send({ contextType: 'zone', contextId: zoneId, body: 'Commentaire à signaler.' })
    .expect(201);

  await request(app)
    .post(`/api/context-comments/${created.body.id}/report`)
    .set(auth(reporter.authToken))
    .send({ reason: 'Contenu inadapté.' })
    .expect(201);

  await request(app)
    .post(`/api/context-comments/${created.body.id}/report`)
    .set(auth(reporter.authToken))
    .send({ reason: 'Deuxième signalement identique.' })
    .expect(409);
});

test('Commentaires contextuels: valide les contextes task/project/zone', async () => {
  const teacher = await teacherToken();
  const student = await registerStudent('ComCtx');
  const { projectId } = await createContextFixture(teacher);

  const created = await request(app)
    .post('/api/context-comments')
    .set(auth(student.authToken))
    .send({ contextType: 'project', contextId: projectId, body: 'Commentaire projet.' })
    .expect(201);
  assert.strictEqual(created.body.context_type, 'project');

  await request(app)
    .post('/api/context-comments')
    .set(auth(student.authToken))
    .send({ contextType: 'invalid', contextId: projectId, body: 'Commentaire invalide.' })
    .expect(400);
});

test('Commentaires contextuels: réactions emoji toggle et agrégées', async () => {
  const teacher = await teacherToken();
  const author = await registerStudent('ComReactAuthor');
  const reactor = await registerStudent('ComReactUser');
  await setAllowedReactionEmojis('🔥 🤝');
  const { taskId } = await createContextFixture(teacher);

  const created = await request(app)
    .post('/api/context-comments')
    .set(auth(author.authToken))
    .send({ contextType: 'task', contextId: taskId, body: 'Commentaire avec réactions.' })
    .expect(201);

  const reacted = await request(app)
    .post(`/api/context-comments/${created.body.id}/reactions`)
    .set(auth(reactor.authToken))
    .send({ emoji: '🔥' })
    .expect(200);
  assert.strictEqual(reacted.body.reacted, true);

  const listed = await request(app)
    .get(`/api/context-comments?contextType=task&contextId=${encodeURIComponent(taskId)}`)
    .set(auth(reactor.authToken))
    .expect(200);
  const item = listed.body.items.find((c) => c.id === created.body.id);
  assert.ok(item);
  const reaction = item.reactions.find((r) => r.emoji === '🔥');
  assert.ok(reaction);
  assert.strictEqual(Number(reaction.count), 1);
  assert.strictEqual(!!reaction.reacted_by_me, true);

  const unreacted = await request(app)
    .post(`/api/context-comments/${created.body.id}/reactions`)
    .set(auth(reactor.authToken))
    .send({ emoji: '🔥' })
    .expect(200);
  assert.strictEqual(unreacted.body.reacted, false);

  await request(app)
    .post(`/api/context-comments/${created.body.id}/reactions`)
    .set(auth(reactor.authToken))
    .send({ emoji: '😡' })
    .expect(400);

  await setAllowedReactionEmojis('👍 ❤️ 😂 😮 😢 😡 🔥 👏');
});
