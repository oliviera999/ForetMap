'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { initSchema, initDatabase } = require('../database');
const { app } = require('../server');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const fx = require('./helpers/fmFixtures');
const { visitContentCache } = require('../routes/visit');

let teacherToken;
let mapId;

function auth(req) {
  return req.set('Authorization', 'Bearer ' + teacherToken);
}

const POLYGON = [
  { xp: 10, yp: 10 },
  { xp: 40, yp: 10 },
  { xp: 40, yp: 40 },
  { xp: 10, yp: 40 },
];

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  teacherToken = await ensureAdminTeacherAuthToken({ elevated: true });
  const map = await fx.createMap({ label: 'Carte audience' });
  mapId = map.id;
});

test.beforeEach(async () => {
  teacherToken = await ensureAdminTeacherAuthToken({ elevated: true });
  if (visitContentCache && typeof visitContentCache.clear === 'function') {
    visitContentCache.clear();
  }
});

test('lieu restreint absent pour anonyme, visible pour gestionnaire', async () => {
  const createRes = await auth(request(app).post('/api/zones'))
    .send({
      name: 'Salle staff',
      points: POLYGON,
      map_id: mapId,
      visible_role_slugs: ['prof', 'admin'],
      restricted_note: 'Clé dans le tiroir',
      restricted_note_role_slugs: ['prof'],
    })
    .expect(201);
  const zoneId = createRes.body.id;
  assert.deepEqual(createRes.body.visible_role_slugs, ['prof', 'admin']);
  assert.equal(createRes.body.restricted_note, 'Clé dans le tiroir');

  const anonList = await request(app).get(`/api/zones?map_id=${mapId}`).expect(200);
  assert.ok(!anonList.body.some((z) => z.id === zoneId));

  const teacherList = await auth(request(app).get(`/api/zones?map_id=${mapId}`)).expect(200);
  const row = teacherList.body.find((z) => z.id === zoneId);
  assert.ok(row);
  assert.equal(row.restricted_note, 'Clé dans le tiroir');
});

test('complément réservé omis pour lecteur hors audience du complément', async () => {
  const createRes = await auth(request(app).post('/api/map/markers'))
    .send({
      label: 'Arbre public',
      x_pct: 15,
      y_pct: 20,
      map_id: mapId,
      note: 'Note publique',
      visible_role_slugs: [],
      restricted_note: 'Mission 2nde',
      restricted_note_role_slugs: ['prof'],
    })
    .expect(201);

  const anon = await request(app).get(`/api/map/markers?map_id=${mapId}`).expect(200);
  const publicRow = anon.body.find((m) => m.id === createRes.body.id);
  assert.ok(publicRow);
  assert.equal(publicRow.note, 'Note publique');
  assert.equal(publicRow.restricted_note, undefined);
});

test('visite anonyme : lieu avec visiteur dans audience seulement', async () => {
  const forVisitor = await auth(request(app).post('/api/map/markers'))
    .send({
      label: 'Point visiteur',
      x_pct: 12,
      y_pct: 18,
      map_id: mapId,
      visible_role_slugs: ['visiteur'],
      visit_subtitle: 'Bonjour',
    })
    .expect(201);
  const forStaff = await auth(request(app).post('/api/map/markers'))
    .send({
      label: 'Point staff',
      x_pct: 22,
      y_pct: 28,
      map_id: mapId,
      visible_role_slugs: ['prof'],
      visit_subtitle: 'Interne',
    })
    .expect(201);

  const visit = await request(app).get(`/api/visit/content?map_id=${mapId}`).expect(200);
  const ids = (visit.body.markers || []).map((m) => m.id);
  assert.ok(ids.includes(forVisitor.body.id), 'visiteur voit le point public-visiteur');
  assert.ok(!ids.includes(forStaff.body.id), 'visiteur ne voit pas le point staff');
});

test('écriture : rôle inconnu → 400', async () => {
  await auth(request(app).post('/api/zones'))
    .send({
      name: 'Bad',
      points: POLYGON,
      map_id: mapId,
      visible_role_slugs: ['gl_mj'],
    })
    .expect(400);
});
