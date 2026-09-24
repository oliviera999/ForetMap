require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const { setStudentPrimaryRole } = require('./helpers/studentRoles');
const { ensureAdminTeacherAuthToken, getAdminTeacherUserId } = require('./helpers/adminAuth');
const {
  notifyUsers,
  normalizeTarget,
  shortPersonName,
  formatDayMonth,
  truncate,
  purgeOldNotifications,
} = require('../lib/notifications');

test.before(async () => {
  await initSchema();
});

async function registerStudent(prefix) {
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      firstName: prefix,
      lastName: `Notif${stamp}`,
      email: `${prefix.toLowerCase()}_${stamp}@example.com`,
      password: 'pass1234',
    })
    .expect(201);
  await setStudentPrimaryRole(res.body.id, 'eleve_novice');
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identifier: res.body.email, password: 'pass1234' })
    .expect(200);
  return { id: res.body.id, token: login.body.authToken };
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

test('helpers de formatage : nom court, date, troncature, cible', () => {
  assert.strictEqual(shortPersonName('Léa', 'martin'), 'Léa M.');
  assert.strictEqual(shortPersonName('Léa', ''), 'Léa');
  assert.strictEqual(formatDayMonth('2026-09-24'), '24/09');
  assert.strictEqual(formatDayMonth(null), '');
  assert.strictEqual(truncate('a'.repeat(20), 10), `${'a'.repeat(9)}…`);
  assert.deepStrictEqual(
    normalizeTarget({ type: 'place', id: 'z1', mapId: 'm1', kind: 'marker' }),
    {
      type: 'place',
      id: 'z1',
      mapId: 'm1',
      extra: { kind: 'marker' },
    },
  );
  assert.strictEqual(normalizeTarget({ type: 'inconnu', id: 'x' }), null);
});

test('notifyUsers : destinataire notifié, auteur exclu, doublon écarté', async () => {
  const a = await registerStudent('NotifA');
  const b = await registerStudent('NotifB');
  const first = await notifyUsers({
    userIds: [a.id, b.id],
    actorUserId: b.id,
    kind: 'test_kind',
    title: 'Titre précis',
    body: 'Corps',
    target: { type: 'task', id: 'task-xyz', mapId: 'foret' },
    dedupeKey: 'test:dedupe:1',
  });
  assert.strictEqual(first.inserted, 1);
  assert.deepStrictEqual(first.userIds, [a.id]);
  const again = await notifyUsers({
    userIds: [a.id],
    kind: 'test_kind',
    title: 'Titre précis',
    dedupeKey: 'test:dedupe:1',
  });
  assert.strictEqual(again.inserted, 0);
  const rowsB = await queryAll('SELECT id FROM notifications WHERE user_id = ?', [b.id]);
  assert.strictEqual(rowsB.length, 0);
});

test('GET /api/notifications : liste du compte connecté avec cible', async () => {
  const student = await registerStudent('NotifList');
  await notifyUsers({
    userIds: [student.id],
    kind: 'place_message',
    title: 'Message sur « Mare »',
    target: { type: 'place', id: 'zone-1', mapId: 'foret', kind: 'zone' },
  });
  const res = await request(app).get('/api/notifications').set(auth(student.token)).expect(200);
  assert.strictEqual(res.body.unread_count, 1);
  assert.strictEqual(res.body.items.length, 1);
  const item = res.body.items[0];
  assert.strictEqual(item.title, 'Message sur « Mare »');
  assert.strictEqual(item.read, false);
  assert.deepStrictEqual(item.target, {
    type: 'place',
    id: 'zone-1',
    mapId: 'foret',
    kind: 'zone',
  });
});

test('GET /api/notifications : 401 sans session', async () => {
  await request(app).get('/api/notifications').expect(401);
});

test('lecture, tout lire et suppression limités au propriétaire', async () => {
  const owner = await registerStudent('NotifOwner');
  const other = await registerStudent('NotifOther');
  await notifyUsers({ userIds: [owner.id], kind: 'k', title: 'Un' });
  await notifyUsers({ userIds: [owner.id], kind: 'k', title: 'Deux' });
  const list = await request(app).get('/api/notifications').set(auth(owner.token)).expect(200);
  const [latest, older] = list.body.items;
  assert.strictEqual(latest.title, 'Deux');

  await request(app)
    .post(`/api/notifications/${latest.id}/read`)
    .set(auth(other.token))
    .expect(404);
  await request(app)
    .post(`/api/notifications/${latest.id}/read`)
    .set(auth(owner.token))
    .expect(200);
  const afterRead = await queryOne('SELECT read_at FROM notifications WHERE id = ?', [latest.id]);
  assert.ok(afterRead.read_at);

  await request(app).delete(`/api/notifications/${older.id}`).set(auth(other.token)).expect(404);
  await request(app).delete(`/api/notifications/${older.id}`).set(auth(owner.token)).expect(200);

  await notifyUsers({ userIds: [owner.id], kind: 'k', title: 'Trois' });
  const all = await request(app)
    .post('/api/notifications/read-all')
    .set(auth(owner.token))
    .expect(200);
  assert.strictEqual(all.body.updated, 1);
  const final = await request(app).get('/api/notifications').set(auth(owner.token)).expect(200);
  assert.strictEqual(final.body.unread_count, 0);
  assert.strictEqual(final.body.items.length, 2);
});

test('pagination par `before` et id invalide', async () => {
  const token = await ensureAdminTeacherAuthToken();
  const teacherId = await getAdminTeacherUserId();
  await notifyUsers({ userIds: [teacherId], kind: 'k', title: 'P1' });
  await notifyUsers({ userIds: [teacherId], kind: 'k', title: 'P2' });
  const page1 = await request(app).get('/api/notifications?limit=1').set(auth(token)).expect(200);
  assert.strictEqual(page1.body.items.length, 1);
  const page2 = await request(app)
    .get(`/api/notifications?limit=1&before=${page1.body.items[0].id}`)
    .set(auth(token))
    .expect(200);
  assert.strictEqual(page2.body.items.length, 1);
  assert.notStrictEqual(page2.body.items[0].id, page1.body.items[0].id);
  await request(app).post('/api/notifications/abc/read').set(auth(token)).expect(404);
});

test('purge : supprime les notifications plus anciennes que la rétention', async () => {
  const student = await registerStudent('NotifPurge');
  await notifyUsers({ userIds: [student.id], kind: 'k', title: 'Vieille' });
  await execute(
    'UPDATE notifications SET created_at = DATE_SUB(NOW(), INTERVAL 90 DAY) WHERE user_id = ?',
    [student.id],
  );
  await notifyUsers({ userIds: [student.id], kind: 'k', title: 'Récente' });
  const { purged } = await purgeOldNotifications({ olderThanDays: 60 });
  assert.ok(purged >= 1);
  const rows = await queryAll('SELECT title FROM notifications WHERE user_id = ?', [student.id]);
  assert.deepStrictEqual(
    rows.map((r) => r.title),
    ['Récente'],
  );
});
