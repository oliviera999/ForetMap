require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initDatabase, queryOne, execute } = require('../database');
const { setStudentPrimaryRole } = require('./helpers/studentRoles');

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
  // Rôle élève + appartenance à un groupe n3beur AVANT le login, sinon le
  // syncStudentRoleFromGroups du login redémoterait l'élève en `visiteur`.
  await setStudentPrimaryRole(res.body.id, 'eleve_novice');
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
    [loginEmail],
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(teacher?.id, 'Compte admin enseignant introuvable');
  assert.ok(adminRole?.id, 'Rôle admin introuvable');
  if (teacher?.id && adminRole?.id) {
    await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', [
      'teacher',
      teacher.id,
    ]);
    await execute(
      'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
      ['teacher', teacher.id, adminRole.id],
    );
    await execute('UPDATE users SET assigned_role_id = ? WHERE id = ?', [adminRole.id, teacher.id]);
  }
  const login = await request(app)
    .post('/api/auth/login')
    .send({
      identifier: loginEmail,
      password: process.env.TEACHER_ADMIN_PASSWORD,
    })
    .expect(200);
  // Un compte connecté possède directement les droits de son rôle (plus d'élévation par PIN).
  return login.body.authToken;
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
  const res = await request(app).get('/api/forum/threads').set(auth(student.authToken)).expect(503);
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

test('Forum: marqueur non lu — dernier message d’autrui, jamais le sien', async () => {
  await request(app).get('/api/forum/unread-marker').expect(401);

  const author = await registerStudent('UnreadAuthor');
  const reader = await registerStudent('UnreadReader');
  const create = await request(app)
    .post('/api/forum/threads')
    .set(auth(author.authToken))
    .send({ title: `Sujet non lu ${Date.now()}`, body: 'Message qui doit allumer le point.' })
    .expect(201);
  const firstPostId = create.body?.first_post_id;
  assert.ok(firstPostId);

  const forReader = await request(app)
    .get('/api/forum/unread-marker')
    .set(auth(reader.authToken))
    .expect(200);
  assert.strictEqual(forReader.body.latest_post_id, firstPostId);
  assert.ok(forReader.body.latest_post_at);

  const forAuthor = await request(app)
    .get('/api/forum/unread-marker')
    .set(auth(author.authToken))
    .expect(200);
  assert.notStrictEqual(forAuthor.body.latest_post_id, firstPostId);

  // Un message supprimé n'allume plus le point.
  await request(app)
    .delete(`/api/forum/posts/${firstPostId}`)
    .set(auth(author.authToken))
    .expect(200);
  const afterDelete = await request(app)
    .get('/api/forum/unread-marker')
    .set(auth(reader.authToken))
    .expect(200);
  assert.notStrictEqual(afterDelete.body.latest_post_id, firstPostId);
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

  await request(app).delete(`/api/forum/posts/${postId}`).set(auth(owner.authToken)).expect(403);

  await request(app).delete(`/api/forum/posts/${postId}`).set(auth(other.authToken)).expect(200);
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

test('Forum: signalements désactivés par réglage renvoie 403', async () => {
  const teacher = await teacherToken();
  const author = await registerStudent('AuthorForumOff');
  const reporter = await registerStudent('ReporterForumOff');

  const thread = await request(app)
    .post('/api/forum/threads')
    .set(auth(author.authToken))
    .send({ title: `Sujet report off ${Date.now()}`, body: 'Post initial.' })
    .expect(201);
  const threadId = thread.body.thread.id;

  const post = await request(app)
    .post(`/api/forum/threads/${threadId}/posts`)
    .set(auth(author.authToken))
    .send({ body: 'Message à signaler.' })
    .expect(201);

  await request(app)
    .put('/api/settings/admin/ui.modules.reports_enabled')
    .set(auth(teacher))
    .send({ value: false })
    .expect(200);

  const res = await request(app)
    .post(`/api/forum/posts/${post.body.id}/report`)
    .set(auth(reporter.authToken))
    .send({ reason: 'Contenu inadapté.' })
    .expect(403);
  assert.strictEqual(res.body?.code, 'REPORTS_DISABLED');

  await request(app)
    .put('/api/settings/admin/ui.modules.reports_enabled')
    .set(auth(teacher))
    .send({ value: true })
    .expect(200);
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
  let forumRoRole = await queryOne(
    "SELECT id FROM roles WHERE slug = 'eleve_forum_ro_test' LIMIT 1",
  );
  if (!forumRoRole?.id) {
    await execute(
      `INSERT INTO roles (slug, display_name, emoji, min_done_tasks, display_order, \`rank\`, is_system, forum_participate, context_comment_participate)
       VALUES ('eleve_forum_ro_test', 'Test forum lecture seule', '🧪', 0, 9989, 1, 0, 0, 1)`,
    );
    forumRoRole = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_forum_ro_test' LIMIT 1");
  }
  assert.ok(forumRoRole?.id);
  const student = await registerStudent('ForumReadOnly');
  await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', [
    'student',
    student.id,
  ]);
  await execute(
    `INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES ('student', ?, ?, 1)
     ON DUPLICATE KEY UPDATE is_primary = 1`,
    [student.id, forumRoRole.id],
  );
  await execute('UPDATE users SET assigned_role_id = ? WHERE id = ?', [forumRoRole.id, student.id]);
  // Pas de re-login ici : le rôle effectif est résolu en direct (live lookup).
  // Un nouveau login relancerait syncStudentRoleFromGroups qui, via le groupe n3beur
  // de test, restaurerait `eleve_novice` et masquerait le profil lecture seule.
  const token = student.authToken;
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
  const firstPost = detail.body.posts.find(
    (p) => Array.isArray(p.image_urls) && p.image_urls.length > 0,
  );
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

test('Forum: modifier son message — auteur seulement, edited_at renseigné, refus si verrouillé', async () => {
  const author = await registerStudent('EditAuthor');
  const other = await registerStudent('EditOther');
  const teacher = await teacherToken();
  const create = await request(app)
    .post('/api/forum/threads')
    .set(auth(author.authToken))
    .send({ title: `Sujet édition ${Date.now()}`, body: 'Texte initial.' })
    .expect(201);
  const threadId = create.body.thread.id;
  const postId = create.body.first_post_id;

  await request(app)
    .patch(`/api/forum/posts/${postId}`)
    .set(auth(other.authToken))
    .send({ body: 'Pas mon message.' })
    .expect(403);
  // Même un modérateur ne réécrit pas le message d'autrui (il peut seulement le supprimer).
  await request(app)
    .patch(`/api/forum/posts/${postId}`)
    .set(auth(teacher))
    .send({ body: 'Réécriture interdite.' })
    .expect(403);
  await request(app)
    .patch(`/api/forum/posts/${postId}`)
    .set(auth(author.authToken))
    .send({ body: 'x' })
    .expect(400);

  const edited = await request(app)
    .patch(`/api/forum/posts/${postId}`)
    .set(auth(author.authToken))
    .send({ body: 'Texte corrigé.' })
    .expect(200);
  assert.strictEqual(edited.body.body, 'Texte corrigé.');
  assert.ok(edited.body.edited_at, 'edited_at renseigné');

  await request(app)
    .patch(`/api/forum/threads/${threadId}/lock`)
    .set(auth(teacher))
    .send({ locked: true })
    .expect(200);
  await request(app)
    .patch(`/api/forum/posts/${postId}`)
    .set(auth(author.authToken))
    .send({ body: 'Après verrouillage.' })
    .expect(409);
});

test('Forum: épingler — réservé aux modérateurs, sujet épinglé en tête de liste', async () => {
  const student = await registerStudent('PinForum');
  const teacher = await teacherToken();
  const older = await request(app)
    .post('/api/forum/threads')
    .set(auth(student.authToken))
    .send({ title: `Sujet à épingler ${Date.now()}`, body: 'Plus ancien.' })
    .expect(201);
  await request(app)
    .post('/api/forum/threads')
    .set(auth(student.authToken))
    .send({ title: `Sujet récent ${Date.now()}`, body: 'Plus récent.' })
    .expect(201);
  const olderId = older.body.thread.id;

  await request(app)
    .patch(`/api/forum/threads/${olderId}/pin`)
    .set(auth(student.authToken))
    .send({ pinned: true })
    .expect(403);
  const pinned = await request(app)
    .patch(`/api/forum/threads/${olderId}/pin`)
    .set(auth(teacher))
    .send({ pinned: true })
    .expect(200);
  assert.strictEqual(Number(pinned.body.is_pinned), 1);

  const list = await request(app)
    .get('/api/forum/threads?page_size=50')
    .set(auth(student.authToken))
    .expect(200);
  const firstUnpinnedIdx = list.body.items.findIndex((t) => !Number(t.is_pinned));
  const pinnedIdx = list.body.items.findIndex((t) => t.id === olderId);
  assert.ok(pinnedIdx >= 0);
  assert.ok(firstUnpinnedIdx === -1 || pinnedIdx < firstUnpinnedIdx, 'épinglé avant les autres');

  await request(app)
    .patch(`/api/forum/threads/${olderId}/pin`)
    .set(auth(teacher))
    .send({ pinned: false })
    .expect(200);
});

test('Forum: liste — posts_count sans messages supprimés, last_other_post_at hors ses messages', async () => {
  const author = await registerStudent('StatsAuthor');
  const reader = await registerStudent('StatsReader');
  const create = await request(app)
    .post('/api/forum/threads')
    .set(auth(author.authToken))
    .send({ title: `Sujet stats ${Date.now()}`, body: 'Premier.' })
    .expect(201);
  const threadId = create.body.thread.id;
  const reply = await request(app)
    .post(`/api/forum/threads/${threadId}/posts`)
    .set(auth(author.authToken))
    .send({ body: 'Second, bientôt supprimé.' })
    .expect(201);
  await request(app)
    .delete(`/api/forum/posts/${reply.body.id}`)
    .set(auth(author.authToken))
    .expect(200);

  const findRow = async (token) => {
    const list = await request(app)
      .get('/api/forum/threads?page_size=50')
      .set(auth(token))
      .expect(200);
    return list.body.items.find((t) => t.id === threadId);
  };
  const forAuthor = await findRow(author.authToken);
  assert.strictEqual(Number(forAuthor.posts_count), 1);
  assert.strictEqual(forAuthor.last_other_post_at, null, 'ses propres messages ne comptent pas');
  const forReader = await findRow(reader.authToken);
  assert.ok(forReader.last_other_post_at, 'le message de l’auteur compte pour un autre lecteur');
});

test('Forum: signalements — liste et traitement réservés aux modérateurs', async () => {
  const author = await registerStudent('ReportsAuthor');
  const reporter = await registerStudent('ReportsReporter');
  const teacher = await teacherToken();
  const thread = await request(app)
    .post('/api/forum/threads')
    .set(auth(author.authToken))
    .send({ title: `Sujet modération ${Date.now()}`, body: 'Message à modérer.' })
    .expect(201);
  const postId = thread.body.first_post_id;
  const created = await request(app)
    .post(`/api/forum/posts/${postId}/report`)
    .set(auth(reporter.authToken))
    .send({ reason: 'Hors sujet pour la classe.' })
    .expect(201);
  const reportId = created.body.report_id;
  assert.ok(reportId);

  await request(app).get('/api/forum/reports').set(auth(reporter.authToken)).expect(403);
  await request(app)
    .patch(`/api/forum/reports/${reportId}`)
    .set(auth(reporter.authToken))
    .send({ status: 'dismissed' })
    .expect(403);

  const open = await request(app)
    .get('/api/forum/reports?status=open&page_size=100')
    .set(auth(teacher))
    .expect(200);
  const row = open.body.items.find((r) => Number(r.id) === Number(reportId));
  assert.ok(row, 'le signalement figure dans la liste des modérateurs');
  assert.strictEqual(row.reason, 'Hors sujet pour la classe.');
  assert.strictEqual(row.post_id, postId);
  assert.ok(row.thread_title);
  assert.match(String(row.post_excerpt), /Message à modérer/);

  await request(app)
    .patch(`/api/forum/reports/${reportId}`)
    .set(auth(teacher))
    .send({ status: 'nimporte' })
    .expect(400);
  const resolved = await request(app)
    .patch(`/api/forum/reports/${reportId}`)
    .set(auth(teacher))
    .send({ status: 'dismissed' })
    .expect(200);
  assert.strictEqual(resolved.body.status, 'dismissed');

  const stillOpen = await request(app)
    .get('/api/forum/reports?status=open&page_size=100')
    .set(auth(teacher))
    .expect(200);
  assert.ok(!stillOpen.body.items.some((r) => Number(r.id) === Number(reportId)));
  const dismissed = await queryOne(
    'SELECT status, resolved_at, resolved_by_user_type FROM forum_reports WHERE id = ?',
    [reportId],
  );
  assert.strictEqual(dismissed.status, 'dismissed');
  assert.ok(dismissed.resolved_at);
  assert.ok(dismissed.resolved_by_user_type, 'modérateur ayant traité mémorisé');
});

test('Forum: supprimer un message signalé classe ses signalements ouverts comme traités', async () => {
  const author = await registerStudent('DelReportAuthor');
  const reporter = await registerStudent('DelReportReporter');
  const teacher = await teacherToken();
  const thread = await request(app)
    .post('/api/forum/threads')
    .set(auth(author.authToken))
    .send({ title: `Sujet suppression ${Date.now()}`, body: 'Message problématique.' })
    .expect(201);
  const postId = thread.body.first_post_id;
  const created = await request(app)
    .post(`/api/forum/posts/${postId}/report`)
    .set(auth(reporter.authToken))
    .send({ reason: 'Propos déplacés.' })
    .expect(201);

  await request(app).delete(`/api/forum/posts/${postId}`).set(auth(teacher)).expect(200);
  const report = await queryOne('SELECT status FROM forum_reports WHERE id = ?', [
    created.body.report_id,
  ]);
  assert.strictEqual(report.status, 'resolved');
});
