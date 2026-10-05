'use strict';

/**
 * Instantané des réponses du CRUD des cartes (`/api/settings/admin/maps…`).
 *
 * Écrit AVANT de sortir ces routes de `routes/settings.js` (étape B4 de l'audit du 25/09/2026,
 * § 2.2 et § 3.1 : « le CRUD des cartes vit dans `routes/settings.js` ») : mêmes URL, mêmes
 * corps de réponse, mêmes messages d'erreur — avant et après l'extraction. Le calage GPS a
 * son propre fichier (`settings-maps-georef.test.js`) ; seul son 404 et son corps de réponse
 * sont repris ici.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pJkQAAAAASUVORK5CYII=';

const VALID_ANCHORS = [
  { xp: 10, yp: 10, lat: 48.85, lng: 2.3 },
  { xp: 90, yp: 12, lat: 48.85, lng: 2.31 },
  { xp: 12, yp: 88, lat: 48.84, lng: 2.3 },
];

let token;
const createdMapIds = [];

function asAdmin(req) {
  return req.set('Authorization', `Bearer ${token}`);
}

function newMapId(prefix) {
  const id = `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.slice(0, 31);
  createdMapIds.push(id);
  return id;
}

/** Corps attendu d'une carte sans calage GPS (sérialisation `serializeMap`). */
function expectedMap(overrides) {
  return {
    id: overrides.id,
    label: 'Plan',
    map_image_url: '/map.png',
    sort_order: 0,
    frame_padding_px: null,
    is_active: true,
    pedago_level: null,
    georef: null,
    gps_enabled: false,
    heading_up_enabled: false,
    scale_compass_enabled: false,
    default_category_ids: [],
    hidden_category_ids: [],
    ...overrides,
  };
}

test.before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken();
});

test.beforeEach(async () => {
  token = await ensureAdminTeacherAuthToken();
});

test.after(async () => {
  for (const id of createdMapIds) await execute('DELETE FROM maps WHERE id = ?', [id]);
});

test('POST /admin/maps — erreurs (400, 409, 401)', async () => {
  const id = newMapId('snap');
  const cases = [
    [
      { id: 'A B', label: 'x' },
      400,
      'Identifiant carte invalide (minuscules, chiffres, tirets ; 1 à 31 caractères)',
    ],
    [
      { id: '', label: 'x' },
      400,
      'Identifiant carte invalide (minuscules, chiffres, tirets ; 1 à 31 caractères)',
    ],
    [{ id: 'both', label: 'x' }, 400, 'Identifiant réservé (both)'],
    [{ id }, 400, 'Label requis'],
  ];
  for (const [body, status, error] of cases) {
    const res = await asAdmin(request(app).post('/api/settings/admin/maps')).send(body);
    assert.equal(res.status, status, JSON.stringify(body));
    assert.deepEqual(res.body, { error });
  }
  await asAdmin(request(app).post('/api/settings/admin/maps'))
    .send({ id, label: 'Plan' })
    .expect(201);
  const dup = await asAdmin(request(app).post('/api/settings/admin/maps'))
    .send({ id: id.toUpperCase(), label: 'Doublon' })
    .expect(409);
  assert.deepEqual(dup.body, { error: 'Une carte avec cet identifiant existe déjà' });
  const anon = await request(app).post('/api/settings/admin/maps').send({}).expect(401);
  assert.deepEqual(anon.body, { error: 'Token requis' });
});

test('POST /admin/maps — corps de réponse et valeurs par défaut', async () => {
  const id = newMapId('snap');
  const res = await asAdmin(request(app).post('/api/settings/admin/maps'))
    .send({ id: ` ${id.toUpperCase()} `, label: ' Plan ', sort_order: -3, is_active: 'false' })
    .expect(201);
  assert.deepEqual(res.body, expectedMap({ id, is_active: false }));
  const row = await queryOne('SELECT sort_order, is_active FROM maps WHERE id = ?', [id]);
  assert.equal(Number(row.sort_order), 0);
  assert.equal(Number(row.is_active), 0);
  // Ordre omis → 999 ; image fournie conservée ; actif par défaut.
  const id2 = newMapId('snap');
  const res2 = await asAdmin(request(app).post('/api/settings/admin/maps'))
    .send({ id: id2, label: 'Plan B', map_image_url: '/maps/map-foret.svg' })
    .expect(201);
  assert.deepEqual(
    res2.body,
    expectedMap({
      id: id2,
      label: 'Plan B',
      sort_order: 999,
      map_image_url: '/maps/map-foret.svg',
    }),
  );
});

test('PUT /admin/maps/:id — erreurs et corps de réponse', async () => {
  const id = newMapId('snap');
  await asAdmin(request(app).post('/api/settings/admin/maps'))
    .send({ id, label: 'Plan', map_image_url: '/map.png' })
    .expect(201);
  const missing = await asAdmin(request(app).put('/api/settings/admin/maps/inconnue'))
    .send({})
    .expect(404);
  assert.deepEqual(missing.body, { error: 'Carte introuvable' });
  const badLevel = await asAdmin(request(app).put(`/api/settings/admin/maps/${id}`))
    .send({ pedago_level: 'maternelle' })
    .expect(400);
  assert.deepEqual(badLevel.body, { error: 'pedago_level invalide (college|lycee|universite)' });
  const noLabel = await asAdmin(request(app).put(`/api/settings/admin/maps/${id}`))
    .send({ label: ' ' })
    .expect(400);
  assert.deepEqual(noLabel.body, { error: 'Label requis' });

  const updated = await asAdmin(request(app).put(`/api/settings/admin/maps/${id}`))
    .send({
      label: ' Plan 2 ',
      sort_order: '7',
      frame_padding_px: 50,
      is_active: 1,
      pedago_level: 'lycee',
      map_image_url: '',
    })
    .expect(200);
  assert.deepEqual(
    updated.body,
    expectedMap({
      id,
      label: 'Plan 2',
      sort_order: 7,
      frame_padding_px: 32,
      pedago_level: 'lycee',
    }),
  );
  // Marge non numérique : conservée ; chaîne vide : effacée ; niveau vide : effacé.
  const keptPadding = await asAdmin(request(app).put(`/api/settings/admin/maps/${id}`))
    .send({ frame_padding_px: 'abc' })
    .expect(200);
  assert.equal(keptPadding.body.frame_padding_px, 32);
  assert.equal(keptPadding.body.pedago_level, 'lycee');
  const cleared = await asAdmin(request(app).put(`/api/settings/admin/maps/${id}`))
    .send({ frame_padding_px: '', pedago_level: '', is_active: '0' })
    .expect(200);
  assert.deepEqual(
    cleared.body,
    expectedMap({ id, label: 'Plan 2', sort_order: 7, is_active: false }),
  );
});

test('POST /admin/maps/:id/image — erreurs et nouvelle URL', async () => {
  const id = newMapId('snap');
  await asAdmin(request(app).post('/api/settings/admin/maps'))
    .send({ id, label: 'Plan' })
    .expect(201);
  const missing = await asAdmin(request(app).post('/api/settings/admin/maps/inconnue/image'))
    .send({})
    .expect(404);
  assert.deepEqual(missing.body, { error: 'Carte introuvable' });
  const noData = await asAdmin(request(app).post(`/api/settings/admin/maps/${id}/image`))
    .send({})
    .expect(400);
  assert.deepEqual(noData.body, { error: 'image_data requis' });
  const res = await asAdmin(request(app).post(`/api/settings/admin/maps/${id}/image`))
    .send({ image_data: TINY_PNG_DATA_URL })
    .expect(200);
  assert.match(res.body.map_image_url, new RegExp(`^/uploads/maps/${id}-\\d+\\.jpg$`));
  assert.deepEqual(
    res.body,
    expectedMap({ id, sort_order: 999, map_image_url: res.body.map_image_url }),
  );
});

test('PUT /admin/maps/:id/georef — 404 et corps de réponse', async () => {
  const id = newMapId('snap');
  await asAdmin(request(app).post('/api/settings/admin/maps'))
    .send({ id, label: 'Plan' })
    .expect(201);
  const missing = await asAdmin(request(app).put('/api/settings/admin/maps/inconnue/georef'))
    .send({})
    .expect(404);
  assert.deepEqual(missing.body, { error: 'Carte introuvable' });
  const res = await asAdmin(request(app).put(`/api/settings/admin/maps/${id}/georef`))
    .send({ anchors: VALID_ANCHORS, gps_enabled: true })
    .expect(200);
  assert.deepEqual(Object.keys(res.body).sort(), Object.keys(expectedMap({ id })).sort());
  assert.equal(res.body.gps_enabled, true);
  assert.equal(res.body.scale_compass_enabled, true);
  assert.equal(res.body.heading_up_enabled, false);
  assert.ok(Array.isArray(res.body.georef));
  assert.equal(res.body.georef.length, 3);
});

test('GET /admin — la carte y est sérialisée comme par le CRUD', async () => {
  const id = newMapId('snap');
  const createdRes = await asAdmin(request(app).post('/api/settings/admin/maps'))
    .send({ id, label: 'Plan listé', sort_order: 42 })
    .expect(201);
  const admin = await asAdmin(request(app).get('/api/settings/admin')).expect(200);
  assert.ok(Array.isArray(admin.body.settings));
  const listed = admin.body.maps.find((m) => m.id === id);
  assert.deepEqual(listed, createdRes.body);
});
