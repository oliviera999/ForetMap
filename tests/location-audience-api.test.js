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

test('visite : restricted_note absent pour anonyme, présent pour personnel audience', async () => {
  const { signAuthToken } = require('../middleware/requireTeacher');
  const { queryOne, execute } = require('../database');

  const secret = `SECRET_TEL_${Date.now()}`;
  const zoneRes = await auth(request(app).post('/api/visit/zones'))
    .send({
      map_id: mapId,
      name: 'Salle secrétariat',
      points: POLYGON,
      short_description: 'Accueil',
      visible_role_slugs: [],
      restricted_note: secret,
      restricted_note_role_slugs: ['personnel'],
    })
    .expect(201);
  const markerRes = await auth(request(app).post('/api/visit/markers'))
    .send({
      map_id: mapId,
      label: 'Bureau direction',
      x_pct: 33,
      y_pct: 44,
      short_description: 'Point info',
      visible_role_slugs: [],
      restricted_note: secret,
      restricted_note_role_slugs: ['personnel'],
    })
    .expect(201);

  const anon = await request(app).get(`/api/visit/content?map_id=${mapId}`).expect(200);
  const anonZone = (anon.body.zones || []).find((z) => z.id === zoneRes.body.id);
  const anonMarker = (anon.body.markers || []).find((m) => m.id === markerRes.body.id);
  assert.ok(anonZone, 'zone publique visible anonyme');
  assert.ok(anonMarker, 'repère public visible anonyme');
  assert.equal(anonZone.restricted_note, undefined);
  assert.equal(anonMarker.restricted_note, undefined);
  assert.equal(anonZone.visible_role_slugs, undefined);

  const personnelRole = await queryOne("SELECT id FROM roles WHERE slug = 'personnel' LIMIT 1");
  assert.ok(personnelRole?.id, 'rôle personnel requis');
  const personnelUserId = `u-personnel-${Date.now()}`;
  const email = `personnel.${Date.now()}@test.local`;
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, password_hash, display_name, first_name, last_name, is_active)
     VALUES (?, 'student', ?, ?, 'x', 'Personnel Test', 'P', 'T', 1)`,
    [personnelUserId, email, `perso_${Date.now()}`],
  );
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1)',
    ['student', personnelUserId, personnelRole.id],
  );
  const personnelToken = signAuthToken({
    userType: 'student',
    userId: personnelUserId,
    canonicalUserId: personnelUserId,
    roleId: personnelRole.id,
    roleSlug: 'personnel',
    roleDisplayName: 'Personnel',
  });

  const staff = await request(app)
    .get(`/api/visit/content?map_id=${mapId}`)
    .set('Authorization', 'Bearer ' + personnelToken)
    .expect(200);
  const staffZone = (staff.body.zones || []).find((z) => z.id === zoneRes.body.id);
  const staffMarker = (staff.body.markers || []).find((m) => m.id === markerRes.body.id);
  assert.equal(staffZone.restricted_note, secret);
  assert.equal(staffMarker.restricted_note, secret);
  assert.equal(staffZone.restricted_note_role_slugs, undefined);
});

test('visite : visible_role_slugs hors audience → absent pour anonyme', async () => {
  const zoneRes = await auth(request(app).post('/api/visit/zones'))
    .send({
      map_id: mapId,
      name: 'Zone staff only',
      points: [
        { xp: 50, yp: 50 },
        { xp: 60, yp: 50 },
        { xp: 60, yp: 60 },
        { xp: 50, yp: 60 },
      ],
      visible_role_slugs: ['personnel', 'prof'],
    })
    .expect(201);

  const anon = await request(app).get(`/api/visit/content?map_id=${mapId}`).expect(200);
  assert.ok(!(anon.body.zones || []).some((z) => z.id === zoneRes.body.id));
});

test('sync map→visite : restricted_note ne fuit pas dans les champs publics', async () => {
  const { queryOne } = require('../database');
  const { publicVisitFieldsLeakRestrictedNote } = require('../lib/visitMapToVisitFields');

  const secret = `FUITE_INTERDITE_${Date.now()}`;
  const zoneRes = await auth(request(app).post('/api/zones'))
    .send({
      name: `Zone sync audience ${Date.now()}`,
      points: POLYGON,
      map_id: mapId,
      description: 'Texte public description',
      restricted_note: secret,
      restricted_note_role_slugs: ['personnel', 'admin'],
    })
    .expect(201);
  const markerRes = await auth(request(app).post('/api/map/markers'))
    .send({
      label: `Repère sync audience ${Date.now()}`,
      x_pct: 55,
      y_pct: 66,
      map_id: mapId,
      note: 'Note publique repère',
      emoji: '📌',
      restricted_note: secret,
      restricted_note_role_slugs: ['personnel'],
    })
    .expect(201);

  await auth(request(app).post('/api/visit/sync'))
    .send({
      map_id: mapId,
      direction: 'map_to_visit',
      zone_ids: [zoneRes.body.id],
      marker_ids: [markerRes.body.id],
    })
    .expect(200);

  const vz = await queryOne('SELECT * FROM visit_zones WHERE id = ?', [zoneRes.body.id]);
  const vm = await queryOne('SELECT * FROM visit_markers WHERE id = ?', [markerRes.body.id]);
  assert.ok(vz && vm);
  assert.equal(vz.short_description, 'Texte public description');
  assert.equal(vm.short_description, 'Note publique repère');
  assert.match(String(vz.restricted_note || ''), new RegExp(secret));
  assert.match(String(vm.restricted_note || ''), new RegExp(secret));
  assert.equal(publicVisitFieldsLeakRestrictedNote(vz, secret), false);
  assert.equal(publicVisitFieldsLeakRestrictedNote(vm, secret), false);

  const anon = await request(app).get(`/api/visit/content?map_id=${mapId}`).expect(200);
  const anonZone = (anon.body.zones || []).find((z) => z.id === zoneRes.body.id);
  assert.ok(anonZone);
  assert.equal(anonZone.restricted_note, undefined);
  assert.equal(anonZone.visit_short_description, 'Texte public description');
});
