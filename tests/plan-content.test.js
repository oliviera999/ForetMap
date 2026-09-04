'use strict';

/**
 * Lot 4 — Plan Lyautey v1 : charge publique `GET /api/plan/content`, surfaces d'affichage
 * (`?surface=` sur zones / repères / catégories) et champs `hidden_surfaces`,
 * `search_aliases`, `surfaces` sur les écritures.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { initSchema, initDatabase, execute } = require('../database');
const { app } = require('../server');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { setSetting, invalidateSettingsCache } = require('../lib/settings');
const fx = require('./helpers/fmFixtures');
const { planContentCache } = require('../routes/plan');

let teacherToken;
let map;
let mapId;
const createdIds = { zones: [], markers: [], categories: [] };

function auth(req) {
  return req.set('Authorization', 'Bearer ' + teacherToken);
}

const POLYGON = [
  { xp: 10, yp: 10 },
  { xp: 20, yp: 10 },
  { xp: 20, yp: 20 },
];

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  teacherToken = await ensureAdminTeacherAuthToken({ elevated: true });
  map = await fx.createMap({ label: 'Plan de test' });
  mapId = map.id;
  await setSetting('ui.plan.map_id', mapId, { userType: 'teacher', userId: 'test' });
  invalidateSettingsCache();
});

test.beforeEach(async () => {
  teacherToken = await ensureAdminTeacherAuthToken({ elevated: true });
  planContentCache.clear();
});

test.after(async () => {
  for (const id of createdIds.zones) await execute('DELETE FROM zones WHERE id = ?', [id]);
  for (const id of createdIds.markers) await execute('DELETE FROM map_markers WHERE id = ?', [id]);
  for (const id of createdIds.categories) {
    await execute('DELETE FROM location_categories WHERE id = ?', [id]);
  }
  await execute('DELETE FROM visit_zones WHERE map_id = ?', [mapId]);
  await execute('DELETE FROM zones WHERE map_id = ?', [mapId]);
  await execute('DELETE FROM map_markers WHERE map_id = ?', [mapId]);
  await execute('DELETE FROM location_categories WHERE map_id = ?', [mapId]);
  await execute('DELETE FROM maps WHERE id = ?', [mapId]);
  await setSetting('ui.plan.map_id', 'lyautey', { userType: 'teacher', userId: 'test' });
  invalidateSettingsCache();
});

test('GET /api/plan/settings expose les réglages ui.plan.* publics', async () => {
  const res = await request(app).get('/api/plan/settings').expect(200);
  assert.equal(res.body.map_id, mapId);
  assert.equal(typeof res.body.title, 'string');
  assert.equal(res.body.access_mode, 'public');
  assert.ok(Array.isArray(res.body.default_category_ids));
  assert.match(res.headers['cache-control'], /max-age=60/);
});

test('GET /api/plan/content : carte réglée, lieux visibles sur le plan seulement, textes publics', async () => {
  const catPlan = await fx.createLocationCategory({
    mapId,
    label: 'Salles',
    surfaces: ['map', 'plan'],
  });
  const catNoPlan = await fx.createLocationCategory({
    mapId,
    label: 'Cultures',
    surfaces: ['map', 'visit'],
  });
  createdIds.categories.push(catPlan.id, catNoPlan.id);

  const visible = await fx.createZone({ mapId, name: 'CDI', searchAliases: 'bibliothèque ; docs' });
  const hiddenByFlag = await fx.createZone({
    mapId,
    name: 'Local technique',
    hiddenSurfaces: ['plan'],
  });
  const hiddenByCategory = await fx.createZone({ mapId, name: 'Potager' });
  const bothCategories = await fx.createZone({ mapId, name: 'Serre' });
  await fx.createLocationCategory({
    mapId,
    label: 'liaison A',
    surfaces: ['plan'],
    zoneIds: [visible.id],
  });
  await execute('INSERT IGNORE INTO zone_categories (zone_id, category_id) VALUES (?, ?)', [
    hiddenByCategory.id,
    catNoPlan.id,
  ]);
  await execute('INSERT IGNORE INTO zone_categories (zone_id, category_id) VALUES (?, ?)', [
    bothCategories.id,
    catNoPlan.id,
  ]);
  await execute('INSERT IGNORE INTO zone_categories (zone_id, category_id) VALUES (?, ?)', [
    bothCategories.id,
    catPlan.id,
  ]);
  await execute(
    `INSERT INTO visit_zones (id, map_id, name, points, subtitle, short_description, details_title, details_text, is_active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
    [
      visible.id,
      mapId,
      'CDI',
      '[]',
      'Centre de documentation',
      'Livres et calme',
      'Horaires',
      '8h-17h',
    ],
  );
  const marker = await fx.createMarker({ mapId, label: 'Infirmerie', xPct: 42, yPct: 58 });
  const hiddenMarker = await fx.createMarker({
    mapId,
    label: 'Secret',
    hiddenSurfaces: 'plan,visit',
  });
  planContentCache.clear();

  const res = await request(app).get('/api/plan/content').expect(200);
  assert.equal(res.body.map.id, mapId);
  assert.equal(res.body.map.label, 'Plan de test');
  assert.equal(typeof res.body.map.gps_enabled, 'boolean');
  assert.equal(res.body.settings.map_id, undefined);
  assert.equal(typeof res.body.settings.title, 'string');

  const zoneIds = res.body.zones.map((z) => z.id);
  assert.ok(zoneIds.includes(visible.id), 'zone visible attendue');
  assert.ok(zoneIds.includes(bothCategories.id), 'une catégorie plan suffit');
  assert.ok(!zoneIds.includes(hiddenByFlag.id), 'hidden_surfaces=plan exclut');
  assert.ok(!zoneIds.includes(hiddenByCategory.id), 'catégorie hors plan exclut');

  const cdi = res.body.zones.find((z) => z.id === visible.id);
  assert.deepEqual(cdi.search_aliases, ['bibliothèque', 'docs']);
  assert.equal(cdi.visit_subtitle, 'Centre de documentation');
  assert.equal(cdi.visit_details_text, '8h-17h');
  assert.equal(cdi.map_lead_photo, null);
  assert.equal(cdi.history, undefined, 'aucune donnée de culture');
  assert.equal(cdi.living_beings_list, undefined);
  assert.equal(cdi.hidden_surfaces, undefined);

  const markerIds = res.body.markers.map((m) => m.id);
  assert.ok(markerIds.includes(marker.id));
  assert.ok(!markerIds.includes(hiddenMarker.id));
  const inf = res.body.markers.find((m) => m.id === marker.id);
  assert.equal(inf.x_pct, 42);
  assert.equal(inf.label, 'Infirmerie');

  const catIds = res.body.categories.map((c) => c.id);
  assert.ok(catIds.includes(catPlan.id));
  assert.ok(!catIds.includes(catNoPlan.id), 'catégorie sans surface plan absente du catalogue');
  assert.match(res.headers['cache-control'], /public, max-age=60/);

  // Cache : même charge tant que rien n'est écrit, périmée après une écriture.
  const again = await request(app).get('/api/plan/content').expect(200);
  assert.deepEqual(again.body, res.body);
  await execute('UPDATE zones SET name = ? WHERE id = ?', ['CDI renommé', visible.id]);
  const after = await request(app).get('/api/plan/content').expect(200);
  assert.equal(after.body.zones.find((z) => z.id === visible.id).name, 'CDI renommé');
});

test('GET /api/plan/content : ?map_id explicite, carte inconnue → 400, catégories masquées par réglage', async () => {
  await request(app).get('/api/plan/content?map_id=nope-plan').expect(400);
  const other = await fx.createMap({ label: 'Autre' });
  const cat = await fx.createLocationCategory({ mapId: other.id, label: 'À cacher' });
  createdIds.categories.push(cat.id);
  await setSetting('ui.plan.hidden_category_ids', cat.id, { userType: 'teacher', userId: 'test' });
  invalidateSettingsCache();
  try {
    const res = await request(app).get(`/api/plan/content?map_id=${other.id}`).expect(200);
    assert.equal(res.body.map.id, other.id);
    assert.ok(!res.body.categories.some((c) => c.id === cat.id));
    assert.deepEqual(res.body.settings.hidden_category_ids, [cat.id]);
  } finally {
    await setSetting('ui.plan.hidden_category_ids', '', { userType: 'teacher', userId: 'test' });
    invalidateSettingsCache();
    await execute('DELETE FROM location_categories WHERE map_id = ?', [other.id]);
    await execute('DELETE FROM maps WHERE id = ?', [other.id]);
  }
});

test('zones : hidden_surfaces / search_aliases en écriture, exposition et ?surface=', async () => {
  const createRes = await auth(request(app).post('/api/zones'))
    .send({
      name: 'Gymnase',
      points: POLYGON,
      map_id: mapId,
      hidden_surfaces: ['visit'],
      search_aliases: 'salle de sport ; gym ; gym',
    })
    .expect(201);
  createdIds.zones.push(createRes.body.id);
  assert.deepEqual(createRes.body.hidden_surfaces, ['visit']);
  assert.equal(createRes.body.search_aliases, 'salle de sport ; gym');

  const list = await request(app).get(`/api/zones?map_id=${mapId}`).expect(200);
  const row = list.body.find((z) => z.id === createRes.body.id);
  assert.deepEqual(row.hidden_surfaces, ['visit']);
  assert.equal(row.search_aliases, 'salle de sport ; gym');

  const onVisit = await request(app).get(`/api/zones?map_id=${mapId}&surface=visit`).expect(200);
  assert.ok(!onVisit.body.some((z) => z.id === createRes.body.id));
  const onPlan = await request(app).get(`/api/zones?map_id=${mapId}&surface=plan`).expect(200);
  assert.ok(onPlan.body.some((z) => z.id === createRes.body.id));
  await request(app).get(`/api/zones?surface=carte`).expect(400);

  // PUT : omis = inchangé ; fourni = remplacé ; valeur inconnue = 400.
  const unchanged = await auth(request(app).put(`/api/zones/${createRes.body.id}`))
    .send({ name: 'Gymnase 2' })
    .expect(200);
  assert.deepEqual(unchanged.body.hidden_surfaces, ['visit']);
  const replaced = await auth(request(app).put(`/api/zones/${createRes.body.id}`))
    .send({ hidden_surfaces: [], search_aliases: '' })
    .expect(200);
  assert.deepEqual(replaced.body.hidden_surfaces, []);
  assert.equal(replaced.body.search_aliases, '');
  await auth(request(app).put(`/api/zones/${createRes.body.id}`))
    .send({ hidden_surfaces: ['carte'] })
    .expect(400);
  await auth(request(app).post('/api/zones'))
    .send({ name: 'X', points: POLYGON, map_id: mapId, hidden_surfaces: 'nope' })
    .expect(400);
});

test('repères : hidden_surfaces / search_aliases en écriture, exposition et ?surface=', async () => {
  const createRes = await auth(request(app).post('/api/map/markers'))
    .send({
      label: 'Accueil',
      x_pct: 5,
      y_pct: 5,
      map_id: mapId,
      hidden_surfaces: 'plan',
      search_aliases: ['loge', 'entrée'],
    })
    .expect(201);
  createdIds.markers.push(createRes.body.id);
  assert.deepEqual(createRes.body.hidden_surfaces, ['plan']);
  assert.equal(createRes.body.search_aliases, 'loge ; entrée');

  const onPlan = await request(app)
    .get(`/api/map/markers?map_id=${mapId}&surface=plan`)
    .expect(200);
  assert.ok(!onPlan.body.some((m) => m.id === createRes.body.id));
  const onMap = await request(app).get(`/api/map/markers?map_id=${mapId}&surface=map`).expect(200);
  const row = onMap.body.find((m) => m.id === createRes.body.id);
  assert.deepEqual(row.hidden_surfaces, ['plan']);

  const updated = await auth(request(app).put(`/api/map/markers/${createRes.body.id}`))
    .send({ hidden_surfaces: [] })
    .expect(200);
  assert.deepEqual(updated.body.hidden_surfaces, []);
  assert.equal(updated.body.search_aliases, 'loge ; entrée');
  await auth(request(app).put(`/api/map/markers/${createRes.body.id}`))
    .send({ hidden_surfaces: 3 })
    .expect(400);
});

test('catégories : zoom_only en écriture et en lecture (désencombrement, lot 5)', async () => {
  const created = await auth(request(app).post('/api/map-categories'))
    .send({ label: 'Sanitaires', map_id: mapId })
    .expect(201);
  createdIds.categories.push(created.body.id);
  assert.equal(created.body.zoom_only, false);

  const restricted = await auth(request(app).put(`/api/map-categories/${created.body.id}`))
    .send({ zoom_only: true })
    .expect(200);
  assert.equal(restricted.body.zoom_only, true);

  const kept = await auth(request(app).put(`/api/map-categories/${created.body.id}`))
    .send({ label: 'Sanitaires 2' })
    .expect(200);
  assert.equal(kept.body.zoom_only, true, 'omis = inchangé');

  const list = await request(app).get(`/api/map-categories?map_id=${mapId}`).expect(200);
  assert.equal(list.body.find((c) => c.id === created.body.id).zoom_only, true);

  const zoomOnlyAtCreate = await auth(request(app).post('/api/map-categories'))
    .send({ label: 'Points d’eau', map_id: mapId, zoom_only: true })
    .expect(201);
  createdIds.categories.push(zoomOnlyAtCreate.body.id);
  assert.equal(zoomOnlyAtCreate.body.zoom_only, true);

  // La charge publique du plan porte le drapeau : le front décide de l'échelle d'apparition.
  planContentCache.clear();
  const planContent = await request(app).get('/api/plan/content').expect(200);
  const category = planContent.body.categories.find((c) => c.id === created.body.id);
  assert.equal(category.zoom_only, true);
});

test('catégories : surfaces en écriture (défaut toutes), exposition et ?surface=', async () => {
  const createdCat = await auth(request(app).post('/api/map-categories'))
    .send({ label: 'Bâtiments', map_id: mapId })
    .expect(201);
  createdIds.categories.push(createdCat.body.id);
  assert.deepEqual(createdCat.body.surfaces, ['map', 'visit', 'plan']);

  const restricted = await auth(request(app).put(`/api/map-categories/${createdCat.body.id}`))
    .send({ surfaces: ['plan'] })
    .expect(200);
  assert.deepEqual(restricted.body.surfaces, ['plan']);
  const kept = await auth(request(app).put(`/api/map-categories/${createdCat.body.id}`))
    .send({ label: 'Bâtiments 2' })
    .expect(200);
  assert.deepEqual(kept.body.surfaces, ['plan']);

  const onPlan = await request(app)
    .get(`/api/map-categories?map_id=${mapId}&surface=plan`)
    .expect(200);
  assert.ok(onPlan.body.some((c) => c.id === createdCat.body.id));
  const onVisit = await request(app)
    .get(`/api/map-categories?map_id=${mapId}&surface=visit`)
    .expect(200);
  assert.ok(!onVisit.body.some((c) => c.id === createdCat.body.id));
  await request(app).get('/api/map-categories?surface=zzz').expect(400);
  await auth(request(app).post('/api/map-categories'))
    .send({ label: 'Mauvaise', surfaces: ['carte'] })
    .expect(400);

  // Un lieu portant seulement cette catégorie disparaît de la carte de travail (surface map).
  const zone = await fx.createZone({ mapId, name: 'Bât. B' });
  await execute('INSERT IGNORE INTO zone_categories (zone_id, category_id) VALUES (?, ?)', [
    zone.id,
    createdCat.body.id,
  ]);
  const onMap = await request(app).get(`/api/zones?map_id=${mapId}&surface=map`).expect(200);
  assert.ok(!onMap.body.some((z) => z.id === zone.id));
  const all = await request(app).get(`/api/zones?map_id=${mapId}`).expect(200);
  assert.ok(
    all.body.some((z) => z.id === zone.id),
    'sans ?surface=, tout est renvoyé',
  );
});

test('garde d’accès par code (lot 8) : charge refusée sans laissez-passer, puis servie', async () => {
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('OUVRE-TOI', 10);
  await setSetting('ui.plan.access_mode', 'code', { userType: 'teacher', userId: 'test' });
  await setSetting('security.plan_access_code_hash', hash, { userType: 'admin', userId: 'test' });
  invalidateSettingsCache();
  planContentCache.clear();
  try {
    // Sans cookie : 401 explicite, que le client sait transformer en écran de saisie.
    const denied = await request(app).get('/api/plan/content').expect(401);
    assert.equal(denied.body.access_required, true);
    assert.match(String(denied.headers['cache-control'] || ''), /no-store/);

    // Mauvais code : refusé, aucun laissez-passer posé.
    await request(app).post('/api/plan/access').send({ code: 'au-hasard' }).expect(401);
    await request(app).post('/api/plan/access').send({}).expect(400);
    await request(app).get('/api/plan/content?code=au-hasard').expect(401);

    // Bon code : cookie signé, puis la charge passe — privée (pas un cache CDN).
    const agent = request.agent(app);
    const granted = await agent.post('/api/plan/access').send({ code: 'OUVRE-TOI' }).expect(200);
    assert.equal(granted.body.ok, true);
    const served = await agent.get('/api/plan/content').expect(200);
    assert.match(String(served.headers['cache-control'] || ''), /private/);

    // Lien profond porteur du code : le QR interne ouvre sans saisie.
    const viaLink = request.agent(app);
    await viaLink.get('/api/plan/content?code=OUVRE-TOI').expect(200);
    await viaLink.get('/api/plan/content').expect(200);

    // Mode `code` sans code configuré : le plan reste ouvert plutôt que muré.
    await setSetting('security.plan_access_code_hash', '', { userType: 'admin', userId: 'test' });
    invalidateSettingsCache();
    await request(app).get('/api/plan/content').expect(200);
  } finally {
    await setSetting('ui.plan.access_mode', 'public', { userType: 'teacher', userId: 'test' });
    await setSetting('security.plan_access_code_hash', '', { userType: 'admin', userId: 'test' });
    invalidateSettingsCache();
    planContentCache.clear();
  }
});
