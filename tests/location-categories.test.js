require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const { initSchema, initDatabase, execute, queryAll, queryOne } = require('../database');
const { app } = require('../server');
const request = require('supertest');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

let teacherToken;
const createdCategoryIds = [];
const createdZoneIds = [];
const createdMarkerIds = [];

const POLYGON = [
  { xp: 10, yp: 10 },
  { xp: 20, yp: 10 },
  { xp: 20, yp: 20 },
];

function auth(req) {
  return req.set('Authorization', 'Bearer ' + teacherToken);
}

async function createCategory(payload) {
  const res = await auth(request(app).post('/api/map-categories')).send(payload).expect(201);
  createdCategoryIds.push(res.body.id);
  return res.body;
}

async function createZone(payload) {
  const res = await auth(request(app).post('/api/zones'))
    .send({ name: 'Zone cat test', points: POLYGON, map_id: 'foret', ...payload })
    .expect(201);
  createdZoneIds.push(res.body.id);
  return res.body;
}

async function createMarker(payload) {
  const res = await auth(request(app).post('/api/map/markers'))
    .send({ label: 'Repère cat test', x_pct: 10, y_pct: 10, map_id: 'foret', ...payload })
    .expect(201);
  createdMarkerIds.push(res.body.id);
  return res.body;
}

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  teacherToken = await ensureAdminTeacherAuthToken({ elevated: true });
});

test.beforeEach(async () => {
  teacherToken = await ensureAdminTeacherAuthToken({ elevated: true });
});

test.after(async () => {
  for (const id of createdZoneIds) await execute('DELETE FROM zones WHERE id = ?', [id]);
  for (const id of createdMarkerIds) await execute('DELETE FROM map_markers WHERE id = ?', [id]);
  for (const id of createdCategoryIds) {
    await execute('DELETE FROM location_categories WHERE id = ?', [id]);
  }
});

// ─── Catalogue ───────────────────────────────────────────────────────────────

test('la migration installe la catégorie « Infrastructure » globale', async () => {
  const row = await queryOne('SELECT * FROM location_categories WHERE id = ?', [
    'cat-infrastructure',
  ]);
  assert.ok(row, 'catégorie de reprise absente');
  assert.strictEqual(row.map_id, null);
  assert.strictEqual(Number(row.is_infrastructure), 1);
});

test('GET /api/map-categories est public et ne renvoie que les catégories actives', async () => {
  const active = await createCategory({ label: 'Verger actif ' + Date.now() });
  const inactive = await createCategory({
    label: 'Verger inactif ' + Date.now(),
    is_active: false,
  });
  const res = await request(app).get('/api/map-categories').expect(200);
  const ids = res.body.map((c) => c.id);
  assert.ok(ids.includes(active.id));
  assert.ok(!ids.includes(inactive.id), 'une catégorie désactivée ne doit pas être publiée');
});

test('GET /api/map-categories/manage inclut les catégories désactivées (prof)', async () => {
  const inactive = await createCategory({ label: 'Masquée ' + Date.now(), is_active: false });
  const res = await auth(request(app).get('/api/map-categories/manage')).expect(200);
  assert.ok(res.body.map((c) => c.id).includes(inactive.id));
});

test('GET /api/map-categories/manage exige une authentification prof', async () => {
  await request(app).get('/api/map-categories/manage').expect(401);
});

test('le filtre map_id renvoie les catégories globales et celles de la carte', async () => {
  const globale = await createCategory({ label: 'Globale ' + Date.now() });
  const surN3 = await createCategory({ label: 'Sur N3 ' + Date.now(), map_id: 'n3' });
  const res = await request(app).get('/api/map-categories?map_id=foret').expect(200);
  const ids = res.body.map((c) => c.id);
  assert.ok(ids.includes(globale.id), 'une catégorie globale vaut pour toutes les cartes');
  assert.ok(!ids.includes(surN3.id), 'une catégorie propre à n3 ne doit pas sortir sur foret');
});

test('le filtre kind respecte applies_to', async () => {
  const zonesOnly = await createCategory({
    label: 'Zones seules ' + Date.now(),
    applies_to: 'zone',
  });
  const res = await request(app).get('/api/map-categories?kind=marker').expect(200);
  assert.ok(!res.body.map((c) => c.id).includes(zonesOnly.id));
});

test('POST /api/map-categories refuse un label vide, une couleur et un applies_to invalides', async () => {
  await auth(request(app).post('/api/map-categories')).send({ label: '  ' }).expect(400);
  await auth(request(app).post('/api/map-categories'))
    .send({ label: 'Couleur cassée', color: 'rouge' })
    .expect(400);
  await auth(request(app).post('/api/map-categories'))
    .send({ label: 'Portée cassée', applies_to: 'batiment' })
    .expect(400);
});

test('POST /api/map-categories refuse un slug déjà pris sur le même périmètre', async () => {
  const label = 'Doublon ' + Date.now();
  await createCategory({ label });
  await auth(request(app).post('/api/map-categories')).send({ label }).expect(409);
  // Le même slug reste libre sur une autre carte.
  const surCarte = await createCategory({ label, map_id: 'n3' });
  assert.strictEqual(surCarte.map_id, 'n3');
});

test('POST /api/map-categories exige une carte existante', async () => {
  await auth(request(app).post('/api/map-categories'))
    .send({ label: 'Carte fantôme', map_id: 'carte-inexistante' })
    .expect(400);
});

test('POST /api/map-categories sans authentification → 401', async () => {
  await request(app).post('/api/map-categories').send({ label: 'Anonyme' }).expect(401);
});

// ─── Affectation aux zones ───────────────────────────────────────────────────

test('une zone porte ses catégories et expose category_ids', async () => {
  const cat = await createCategory({ label: 'Potager ' + Date.now() });
  const zone = await createZone({ category_ids: [cat.id] });
  assert.deepStrictEqual(zone.category_ids, [cat.id]);
  assert.strictEqual(zone.categories[0].label, cat.label);
  assert.strictEqual(zone.is_infrastructure, false);

  const list = await request(app).get('/api/zones?map_id=foret').expect(200);
  const fromList = list.body.find((z) => z.id === zone.id);
  assert.deepStrictEqual(fromList.category_ids, [cat.id]);

  const detail = await request(app).get(`/api/zones/${zone.id}`).expect(200);
  assert.deepStrictEqual(detail.body.category_ids, [cat.id]);
});

test('une catégorie is_infrastructure met à jour le miroir déprécié zones.special', async () => {
  const cat = await createCategory({ label: 'Mare ' + Date.now(), is_infrastructure: true });
  const zone = await createZone({ category_ids: [cat.id] });
  assert.strictEqual(zone.is_infrastructure, true);
  assert.strictEqual(zone.special, true);
  const row = await queryOne('SELECT special FROM zones WHERE id = ?', [zone.id]);
  assert.strictEqual(Number(row.special), 1);

  const cleared = await auth(request(app).put(`/api/zones/${zone.id}`))
    .send({ category_ids: [] })
    .expect(200);
  assert.strictEqual(cleared.body.is_infrastructure, false);
  const after = await queryOne('SELECT special FROM zones WHERE id = ?', [zone.id]);
  assert.strictEqual(Number(after.special), 0);
});

test('PUT sans category_ids conserve les affectations existantes', async () => {
  const cat = await createCategory({ label: 'Conservée ' + Date.now() });
  const zone = await createZone({ category_ids: [cat.id] });
  const res = await auth(request(app).put(`/api/zones/${zone.id}`))
    .send({ name: 'Zone renommée' })
    .expect(200);
  assert.deepStrictEqual(res.body.category_ids, [cat.id]);
});

test('une catégorie « repères seuls » est refusée sur une zone', async () => {
  const cat = await createCategory({
    label: 'Repères seuls ' + Date.now(),
    applies_to: 'marker',
  });
  const zone = await createZone({ category_ids: [cat.id] });
  assert.deepStrictEqual(zone.category_ids, []);
});

test("une catégorie d'une autre carte est refusée", async () => {
  const cat = await createCategory({ label: 'Réservée n3 ' + Date.now(), map_id: 'n3' });
  const zone = await createZone({ map_id: 'foret', category_ids: [cat.id] });
  assert.deepStrictEqual(zone.category_ids, []);
});

test('déplacer une zone sur une autre carte retire les catégories devenues hors périmètre', async () => {
  const cat = await createCategory({ label: 'Foret only ' + Date.now(), map_id: 'foret' });
  const zone = await createZone({ map_id: 'foret', category_ids: [cat.id] });
  assert.deepStrictEqual(zone.category_ids, [cat.id]);
  const moved = await auth(request(app).put(`/api/zones/${zone.id}`))
    .send({ map_id: 'n3' })
    .expect(200);
  assert.deepStrictEqual(moved.body.category_ids, []);
});

// ─── Affectation aux repères ─────────────────────────────────────────────────

test('un repère porte ses catégories (parité avec les zones)', async () => {
  const cat = await createCategory({ label: 'Point deau ' + Date.now() });
  const marker = await createMarker({ category_ids: [cat.id] });
  assert.deepStrictEqual(marker.category_ids, [cat.id]);

  const list = await request(app).get('/api/map/markers?map_id=foret').expect(200);
  const fromList = list.body.find((m) => m.id === marker.id);
  assert.deepStrictEqual(fromList.category_ids, [cat.id]);

  const updated = await auth(request(app).put(`/api/map/markers/${marker.id}`))
    .send({ category_ids: [] })
    .expect(200);
  assert.deepStrictEqual(updated.body.category_ids, []);
});

test('une catégorie « zones seules » est refusée sur un repère', async () => {
  const cat = await createCategory({ label: 'Zones seules bis ' + Date.now(), applies_to: 'zone' });
  const marker = await createMarker({ category_ids: [cat.id] });
  assert.deepStrictEqual(marker.category_ids, []);
});

// ─── Cycle de vie d'une catégorie ────────────────────────────────────────────

test('restreindre applies_to retire les affectations devenues invalides', async () => {
  const cat = await createCategory({ label: 'À restreindre ' + Date.now() });
  const zone = await createZone({ category_ids: [cat.id] });
  await auth(request(app).put(`/api/map-categories/${cat.id}`))
    .send({ applies_to: 'marker' })
    .expect(200);
  const detail = await request(app).get(`/api/zones/${zone.id}`).expect(200);
  assert.deepStrictEqual(detail.body.category_ids, []);
});

test('retirer is_infrastructure réaligne le miroir zones.special', async () => {
  const cat = await createCategory({
    label: 'Infra bascule ' + Date.now(),
    is_infrastructure: true,
  });
  const zone = await createZone({ category_ids: [cat.id] });
  assert.strictEqual(
    Number((await queryOne('SELECT special FROM zones WHERE id = ?', [zone.id])).special),
    1,
  );
  await auth(request(app).put(`/api/map-categories/${cat.id}`))
    .send({ is_infrastructure: false })
    .expect(200);
  const after = await queryOne('SELECT special FROM zones WHERE id = ?', [zone.id]);
  assert.strictEqual(Number(after.special), 0);
});

test('supprimer une catégorie détache les lieux et réaligne le miroir', async () => {
  const cat = await createCategory({ label: 'À supprimer ' + Date.now(), is_infrastructure: true });
  const zone = await createZone({ category_ids: [cat.id] });
  await auth(request(app).delete(`/api/map-categories/${cat.id}`)).expect(200);
  const rows = await queryAll('SELECT category_id FROM zone_categories WHERE zone_id = ?', [
    zone.id,
  ]);
  assert.strictEqual(rows.length, 0, 'la jonction doit partir en cascade');
  const after = await queryOne('SELECT special FROM zones WHERE id = ?', [zone.id]);
  assert.strictEqual(Number(after.special), 0);
});

test('PUT/DELETE sur une catégorie inconnue → 404', async () => {
  await auth(request(app).put('/api/map-categories/inconnue')).send({ label: 'X' }).expect(404);
  await auth(request(app).delete('/api/map-categories/inconnue')).expect(404);
});
