'use strict';

/**
 * Lot 8 — Parcours de carte : lecture publique filtrée par surface, gestion `zones.manage`,
 * étapes remplacées en bloc, export PDF avec QR code, et publication sur la charge du plan.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { initSchema, initDatabase, execute, queryAll } = require('../database');
const { app } = require('../server');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { setSetting, invalidateSettingsCache } = require('../lib/settings');
const fx = require('./helpers/fmFixtures');
const { planContentCache } = require('../routes/plan');
const { slugifyRouteTitle, normalizeRouteSteps, routeDeepLink } = require('../lib/mapRoutes');

let teacherToken;
let map;
let zone;
let marker;
const createdRouteIds = [];

function auth(req) {
  return req.set('Authorization', 'Bearer ' + teacherToken);
}

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  teacherToken = await ensureAdminTeacherAuthToken({ elevated: true });
  map = await fx.createMap({ label: 'Carte parcours' });
  zone = await fx.createZone({ mapId: map.id, name: 'Accueil' });
  marker = await fx.createMarker({ mapId: map.id, label: 'Infirmerie' });
  await setSetting('ui.plan.map_id', map.id, { userType: 'teacher', userId: 'test' });
  invalidateSettingsCache();
});

test.beforeEach(async () => {
  teacherToken = await ensureAdminTeacherAuthToken({ elevated: true });
  planContentCache.clear();
});

test.after(async () => {
  for (const id of createdRouteIds) await execute('DELETE FROM map_routes WHERE id = ?', [id]);
  await execute('DELETE FROM map_routes WHERE map_id = ?', [map.id]);
  await execute('DELETE FROM zones WHERE map_id = ?', [map.id]);
  await execute('DELETE FROM map_markers WHERE map_id = ?', [map.id]);
  await execute('DELETE FROM maps WHERE id = ?', [map.id]);
  await setSetting('ui.plan.map_id', 'lyautey', { userType: 'teacher', userId: 'test' });
  invalidateSettingsCache();
});

test('helpers purs : slug, étapes, lien profond', () => {
  assert.equal(slugifyRouteTitle('Portes ouvertes — élèves'), 'portes-ouvertes-eleves');
  assert.equal(slugifyRouteTitle('   '), '');
  assert.deepEqual(normalizeRouteSteps(undefined), { ok: true, value: null });
  assert.equal(normalizeRouteSteps('nope').ok, false);
  assert.equal(normalizeRouteSteps([{ target_type: 'salle', target_id: 'x' }]).ok, false);
  assert.equal(normalizeRouteSteps([{ target_type: 'zone' }]).ok, false);
  const ok = normalizeRouteSteps([
    { target_type: 'zone', target_id: 'z1', step_title: ' Départ ' },
    { target_type: 'marker', target_id: 'm1' },
  ]);
  assert.deepEqual(
    ok.value.map((s) => [s.position, s.target_type, s.step_title]),
    [
      [0, 'zone', 'Départ'],
      [1, 'marker', ''],
    ],
  );
  assert.equal(
    routeDeepLink('https://plan.test/', 'portes ouvertes'),
    'https://plan.test/?parcours=portes%20ouvertes',
  );
});

test('création, étapes, publication et lecture publique filtrée par surface', async () => {
  const created = await auth(request(app).post('/api/map-routes'))
    .send({
      map_id: map.id,
      title: 'Tour du lycée',
      audience: 'Nouveaux professeurs',
      description: 'Le tour en cinq arrêts.',
      steps: [
        { target_type: 'zone', target_id: zone.id, step_title: 'Départ', step_text: 'Le badge.' },
        { target_type: 'marker', target_id: marker.id },
      ],
    })
    .expect(201);
  createdRouteIds.push(created.body.id);
  assert.equal(created.body.slug, 'tour-du-lycee');
  assert.deepEqual(created.body.surfaces, ['plan'], 'publié sur le plan par défaut');
  assert.equal(created.body.is_published, false, 'brouillon par défaut');
  assert.equal(created.body.steps.length, 2);
  assert.equal(created.body.steps[0].step_title, 'Départ');

  // Brouillon : absent du catalogue public, présent dans la vue de gestion.
  const publicList = await request(app).get(`/api/map-routes?map_id=${map.id}`).expect(200);
  assert.ok(!publicList.body.some((r) => r.id === created.body.id));
  const manageList = await auth(request(app).get(`/api/map-routes/manage?map_id=${map.id}`)).expect(
    200,
  );
  assert.ok(manageList.body.some((r) => r.id === created.body.id));

  const published = await auth(request(app).put(`/api/map-routes/${created.body.id}`))
    .send({ is_published: true })
    .expect(200);
  assert.equal(published.body.is_published, true);
  assert.equal(published.body.steps.length, 2, 'steps omis = étapes conservées');

  const onPlan = await request(app)
    .get(`/api/map-routes?map_id=${map.id}&surface=plan`)
    .expect(200);
  assert.ok(onPlan.body.some((r) => r.id === created.body.id));
  const onVisit = await request(app)
    .get(`/api/map-routes?map_id=${map.id}&surface=visit`)
    .expect(200);
  assert.ok(!onVisit.body.some((r) => r.id === created.body.id));
  await request(app).get('/api/map-routes?surface=zzz').expect(400);

  // Détail accessible par slug (c'est ce que porte le lien profond du QR code).
  const bySlug = await request(app).get('/api/map-routes/tour-du-lycee').expect(200);
  assert.equal(bySlug.body.id, created.body.id);
  await request(app).get('/api/map-routes/inconnu').expect(404);
});

test('étapes remplacées en bloc, validation et slug unique par carte', async () => {
  const route = await auth(request(app).post('/api/map-routes'))
    .send({ map_id: map.id, title: 'Sécurité', steps: [] })
    .expect(201);
  createdRouteIds.push(route.body.id);

  const replaced = await auth(request(app).put(`/api/map-routes/${route.body.id}`))
    .send({
      steps: [
        { target_type: 'marker', target_id: marker.id, step_title: 'Point de rassemblement' },
      ],
    })
    .expect(200);
  assert.equal(replaced.body.steps.length, 1);
  assert.equal(replaced.body.steps[0].step_title, 'Point de rassemblement');

  await auth(request(app).put(`/api/map-routes/${route.body.id}`))
    .send({ steps: [{ target_type: 'batiment', target_id: 'x' }] })
    .expect(400);
  await auth(request(app).post('/api/map-routes'))
    .send({ map_id: map.id, title: 'Sécurité' })
    .expect(409);
  await auth(request(app).post('/api/map-routes')).send({ title: 'Sans carte' }).expect(400);
  await auth(request(app).post('/api/map-routes'))
    .send({ map_id: map.id, title: 'Mauvaise surface', surfaces: ['sol'] })
    .expect(400);
});

test('écriture refusée sans permission, suppression en cascade', async () => {
  await request(app)
    .post('/api/map-routes')
    .send({ map_id: map.id, title: 'Anonyme' })
    .expect((res) => assert.ok(res.status === 401 || res.status === 403));

  const route = await auth(request(app).post('/api/map-routes'))
    .send({
      map_id: map.id,
      title: 'À supprimer',
      steps: [{ target_type: 'zone', target_id: zone.id }],
    })
    .expect(201);
  await auth(request(app).delete(`/api/map-routes/${route.body.id}`)).expect(200);
  await request(app).get(`/api/map-routes/${route.body.id}`).expect(404);
  // Les étapes partent avec le parcours (contrainte de clé étrangère).
  const orphans = await queryAll('SELECT id FROM map_route_steps WHERE route_id = ?', [
    route.body.id,
  ]);
  assert.equal(orphans.length, 0);
});

test('export PDF : document et QR code du lien profond', async () => {
  const route = await auth(request(app).post('/api/map-routes'))
    .send({
      map_id: map.id,
      title: 'Portes ouvertes',
      is_published: true,
      steps: [{ target_type: 'zone', target_id: zone.id, step_text: 'Point de départ.' }],
    })
    .expect(201);
  createdRouteIds.push(route.body.id);

  const res = await auth(request(app).get(`/api/map-routes/${route.body.id}/pdf`))
    .buffer()
    .parse((response, callback) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => callback(null, Buffer.concat(chunks)));
    })
    .expect(200);
  assert.match(res.headers['content-type'], /application\/pdf/);
  assert.match(res.headers['content-disposition'], /parcours-portes-ouvertes\.pdf/);
  assert.equal(res.body.subarray(0, 4).toString(), '%PDF');
  assert.ok(res.body.length > 1000, 'le PDF porte du contenu');

  await request(app).get(`/api/map-routes/${route.body.id}/pdf`).expect(401);
});

test('GET /api/plan/content publie les parcours de la surface plan', async () => {
  const route = await auth(request(app).post('/api/map-routes'))
    .send({
      map_id: map.id,
      title: 'Découverte',
      is_published: true,
      steps: [
        { target_type: 'zone', target_id: zone.id },
        { target_type: 'marker', target_id: marker.id },
      ],
    })
    .expect(201);
  createdRouteIds.push(route.body.id);
  const draft = await auth(request(app).post('/api/map-routes'))
    .send({ map_id: map.id, title: 'Brouillon' })
    .expect(201);
  createdRouteIds.push(draft.body.id);

  planContentCache.clear();
  const content = await request(app).get('/api/plan/content').expect(200);
  const published = content.body.routes.find((r) => r.id === route.body.id);
  assert.ok(published, 'parcours publié attendu dans la charge du plan');
  assert.equal(published.steps.length, 2);
  assert.equal(published.steps[0].position, 0);
  assert.ok(!content.body.routes.some((r) => r.id === draft.body.id), 'brouillon exclu');
});
