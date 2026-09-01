require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const { initDatabase, initSchema, queryOne } = require('../database');
const { app } = require('../server');
const request = require('supertest');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
});

const TRIANGLE = [
  { xp: 10, yp: 10 },
  { xp: 20, yp: 10 },
  { xp: 20, yp: 20 },
];

async function createZone(token, body) {
  const res = await request(app)
    .post('/api/zones')
    .set('Authorization', `Bearer ${token}`)
    .send({ points: TRIANGLE, map_id: 'foret', ...body })
    .expect(201);
  return res.body;
}

test('POST /api/zones : emoji explicite stocké et renvoyé', async () => {
  const token = await ensureAdminTeacherAuthToken({ elevated: true });
  const zone = await createZone(token, { name: `🌳 Verger emoji ${Date.now()}`, emoji: '🌳' });
  assert.strictEqual(zone.emoji, '🌳');
  const row = await queryOne('SELECT emoji FROM zones WHERE id = ?', [zone.id]);
  assert.strictEqual(row.emoji, '🌳');
});

test('POST /api/zones sans champ emoji : dérivé du préfixe du nom (anciens clients)', async () => {
  const token = await ensureAdminTeacherAuthToken({ elevated: true });
  const zone = await createZone(token, { name: `💧 Mare legacy ${Date.now()}` });
  assert.strictEqual(zone.emoji, '💧');
});

test('PUT /api/zones/:id : mise à jour, conservation et effacement de la colonne', async () => {
  const token = await ensureAdminTeacherAuthToken({ elevated: true });
  const zone = await createZone(token, { name: `🌳 Zone maj ${Date.now()}`, emoji: '🌳' });

  // Emoji explicite : remplace.
  const updated = await request(app)
    .put(`/api/zones/${zone.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ emoji: '💧' })
    .expect(200);
  assert.strictEqual(updated.body.emoji, '💧');

  // Corps sans emoji ni nom : la colonne est conservée.
  const untouched = await request(app)
    .put(`/api/zones/${zone.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ description: 'notes' })
    .expect(200);
  assert.strictEqual(untouched.body.emoji, '💧');

  // Chaîne vide : effacement explicite.
  const cleared = await request(app)
    .put(`/api/zones/${zone.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ emoji: '' })
    .expect(200);
  assert.strictEqual(cleared.body.emoji, '');
});

test('GET /api/zones : la colonne emoji est exposée dans la liste', async () => {
  const token = await ensureAdminTeacherAuthToken({ elevated: true });
  const zone = await createZone(token, { name: `🔭 Observatoire ${Date.now()}`, emoji: '🔭' });
  const list = await request(app).get('/api/zones').expect(200);
  const found = (Array.isArray(list.body) ? list.body : list.body.zones || []).find(
    (z) => z.id === zone.id,
  );
  assert.ok(found, 'zone créée absente de la liste');
  assert.strictEqual(found.emoji, '🔭');
});
