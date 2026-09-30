'use strict';

/**
 * Plan e-nov (`enov.*`, surface `enov`, migration 315) : charge `GET /api/enov/content`,
 * catégorie-label (transparente hors de ses surfaces, jamais montrée ailleurs), texte e-nov
 * (écrit par la console, lu sur ce seul plan), garde par code propre, réglages.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { initSchema, initDatabase, execute, queryOne } = require('../database');
const { app } = require('../server');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { setSetting, invalidateSettingsCache } = require('../lib/settings');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');
const fx = require('./helpers/fmFixtures');
const { planContentCache } = require('../routes/plan');
const { enovContentCache } = require('../routes/enov-plan');
const { normalizeEnovDescription, ENOV_DESCRIPTION_MAX_LENGTH } = require('../lib/enovPlan');

/** Réglages touchés par la suite : restaurés tels quels en `after()`. */
const SNAPSHOT_KEYS = [
  'ui.plan.map_id',
  'ui.enov_plan.highlight_category_ids',
  'ui.enov_plan.access_mode',
  'ui.enov_plan.highlight_color',
  'ui.enov_plan.badge_enabled',
  'security.enov_plan_access_code_hash',
];
const snapshots = [];

let teacherToken;
let studentToken;
let mapId;
let label;
let salles;
let cdi;
let loge;
let hall;
let local;
let fablab;

function auth(req, token = teacherToken) {
  return req.set('Authorization', 'Bearer ' + token);
}

function clearCaches() {
  planContentCache.clear();
  enovContentCache.clear();
  invalidateSettingsCache();
}

async function saveSetting(key, value) {
  await setSetting(key, value, { userType: 'teacher', userId: 'test' });
  clearCaches();
}

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  teacherToken = await ensureAdminTeacherAuthToken({ elevated: true });
  for (const key of SNAPSHOT_KEYS) snapshots.push(await snapshotSetting(key));

  const map = await fx.createMap({ label: 'Plan e-nov de test' });
  mapId = map.id;
  await saveSetting('ui.plan.map_id', mapId);

  // Une catégorie ordinaire visible partout, et un label visible sur le seul plan e-nov.
  salles = await fx.createLocationCategory({
    mapId,
    label: 'Salles',
    surfaces: ['map', 'visit', 'plan', 'staff', 'enov'],
  });
  label = await fx.createLocationCategory({
    mapId,
    label: 'e-nov (test)',
    surfaces: ['enov'],
    isDistinction: true,
  });
  await saveSetting('ui.enov_plan.highlight_category_ids', label.id);

  cdi = await fx.createZone({ mapId, name: 'CDI' });
  loge = await fx.createZone({ mapId, name: 'Loge' });
  hall = await fx.createZone({ mapId, name: 'Hall' });
  local = await fx.createZone({ mapId, name: 'Local PPMS', hiddenSurfaces: ['plan', 'enov'] });
  fablab = await fx.createMarker({ mapId, label: 'Fablab' });
  for (const [zoneId, categoryId] of [
    [cdi.id, salles.id],
    [cdi.id, label.id],
    // Loge : jusque-là sans catégorie — seul le label lui est posé.
    [loge.id, label.id],
    [hall.id, salles.id],
    [local.id, label.id],
  ]) {
    await execute('INSERT IGNORE INTO zone_categories (zone_id, category_id) VALUES (?, ?)', [
      zoneId,
      categoryId,
    ]);
  }
  await execute('INSERT IGNORE INTO marker_categories (marker_id, category_id) VALUES (?, ?)', [
    fablab.id,
    label.id,
  ]);
  await execute('UPDATE zones SET enov_description = ? WHERE id = ?', [
    'Espace de robotique ouvert aux élèves.',
    cdi.id,
  ]);
  await execute('UPDATE map_markers SET enov_description = ? WHERE id = ?', [
    'Imprimantes 3D en libre accès.',
    fablab.id,
  ]);

  const res = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Enov', lastName: `Élève${Date.now()}`, password: 'pass1234' })
    .expect(201);
  studentToken = res.body.authToken;
});

test.beforeEach(async () => {
  teacherToken = await ensureAdminTeacherAuthToken({ elevated: true });
  clearCaches();
});

test.after(async () => {
  await execute('DELETE FROM visit_zones WHERE map_id = ?', [mapId]);
  await execute('DELETE FROM visit_markers WHERE map_id = ?', [mapId]);
  await execute('DELETE FROM zones WHERE map_id = ?', [mapId]);
  await execute('DELETE FROM map_markers WHERE map_id = ?', [mapId]);
  await execute('DELETE FROM location_categories WHERE map_id = ?', [mapId]);
  await execute('DELETE FROM maps WHERE id = ?', [mapId]);
  for (const snapshot of snapshots) await restoreSetting(snapshot);
  clearCaches();
});

test('migration 315 : catégorie e-nov semée, label, visible sur le seul plan e-nov', async () => {
  const row = await queryOne(
    'SELECT surfaces, is_distinction, is_active FROM location_categories WHERE id = ?',
    ['cat-enov'],
  );
  assert.ok(row, 'catégorie cat-enov semée');
  assert.equal(row.surfaces, 'enov');
  assert.equal(Number(row.is_distinction), 1);
  assert.equal(Number(row.is_active), 1);
});

test('GET /api/enov/content : tout le plan, lieux e-nov mis en avant, texte e-nov', async () => {
  const res = await request(app).get('/api/enov/content').expect(200);
  assert.equal(res.body.map.id, mapId);
  const zones = new Map(res.body.zones.map((z) => [z.id, z]));
  // Même plan que le plan public : la salle ordinaire y est, le lieu retiré du public non.
  assert.ok(zones.has(hall.id), 'lieu ordinaire présent');
  assert.ok(!zones.has(local.id), 'lieu masqué sur le plan public : masqué ici aussi');
  assert.equal(zones.get(hall.id).is_enov, false);
  assert.equal(zones.get(hall.id).enov_description, '');

  assert.equal(zones.get(cdi.id).is_enov, true);
  assert.equal(zones.get(cdi.id).enov_description, 'Espace de robotique ouvert aux élèves.');
  assert.ok(zones.get(cdi.id).category_ids.includes(label.id));
  assert.equal(zones.get(loge.id).is_enov, true, 'un lieu sans autre catégorie est mis en avant');

  const marker = res.body.markers.find((m) => m.id === fablab.id);
  assert.equal(marker.is_enov, true);
  assert.equal(marker.enov_description, 'Imprimantes 3D en libre accès.');

  assert.ok(
    res.body.categories.some((c) => c.id === label.id),
    'le label est une puce ici',
  );
  assert.deepEqual(res.body.settings.enov.highlight_category_ids, [label.id]);
  assert.match(res.body.settings.enov.highlight_color, /^#[0-9a-f]{6}$/);
  assert.equal(typeof res.body.settings.enov.badge_enabled, 'boolean');
  assert.ok(res.body.settings.enov.innovations_label);
});

test('GET /api/plan/content : le label ne retire aucun lieu et ne sort pas', async () => {
  const res = await request(app).get('/api/plan/content').expect(200);
  const zones = new Map(res.body.zones.map((z) => [z.id, z]));
  // La loge ne porte que le label : elle reste sur le plan public, comme un lieu sans
  // catégorie — sans le drapeau `is_distinction`, elle disparaissait.
  assert.ok(zones.has(loge.id));
  assert.ok(zones.has(cdi.id));
  for (const zone of zones.values()) {
    assert.ok(!zone.category_ids.includes(label.id), `label absent de ${zone.id}`);
    assert.equal(zone.is_enov, undefined);
    assert.equal(zone.enov_description, undefined);
  }
  assert.ok(!res.body.categories.some((c) => c.id === label.id));
  assert.equal(res.body.settings.enov, undefined);
});

test('texte e-nov : écrit par la console, lu par le gestionnaire, jamais par un élève', async () => {
  const saved = await auth(request(app).put(`/api/zones/${hall.id}`))
    .send({ enov_description: '  Salle modulable.  ' })
    .expect(200);
  assert.equal(saved.body.enov_description, 'Salle modulable.');
  const row = await queryOne('SELECT enov_description FROM zones WHERE id = ?', [hall.id]);
  assert.equal(row.enov_description, 'Salle modulable.');

  // Un PUT qui ne cite pas le champ le laisse intact.
  await auth(request(app).put(`/api/zones/${hall.id}`))
    .send({ color: '#86efac90' })
    .expect(200);
  const kept = await queryOne('SELECT enov_description FROM zones WHERE id = ?', [hall.id]);
  assert.equal(kept.enov_description, 'Salle modulable.');

  // Gestionnaire (onglet Lieux) : tout, label compris.
  const managed = await auth(request(app).get(`/api/zones?map_id=${mapId}`)).expect(200);
  const managedCdi = managed.body.find((z) => z.id === cdi.id);
  assert.equal(managedCdi.enov_description, 'Espace de robotique ouvert aux élèves.');
  assert.ok(managedCdi.categories.some((c) => c.id === label.id));

  // Élève sur la carte de travail : ni texte e-nov, ni catégorie e-nov.
  const student = await auth(request(app).get(`/api/zones?map_id=${mapId}`), studentToken);
  if (student.status === 200) {
    const seenCdi = student.body.find((z) => z.id === cdi.id);
    assert.ok(seenCdi, 'la zone reste visible');
    assert.equal(seenCdi.enov_description, undefined);
    assert.ok(!seenCdi.categories.some((c) => c.id === label.id));
    assert.ok(!seenCdi.category_ids.includes(label.id));
    assert.ok(
      student.body.some((z) => z.id === loge.id),
      'la loge reste visible',
    );
  } else {
    // Périmètre de groupe du compte : la carte de test peut lui être fermée — l'absence de
    // fuite est alors garantie par construction.
    assert.equal(student.status, 403);
  }
  const catalog = await auth(
    request(app).get(`/api/map-categories?map_id=${mapId}`),
    studentToken,
  ).expect(200);
  assert.ok(!catalog.body.some((c) => c.id === label.id), 'catalogue élève sans label');

  // Texte borné et vidé proprement.
  assert.equal(normalizeEnovDescription('   '), null);
  assert.equal(
    normalizeEnovDescription('x'.repeat(ENOV_DESCRIPTION_MAX_LENGTH + 10)).length,
    ENOV_DESCRIPTION_MAX_LENGTH,
  );
  const cleared = await auth(request(app).put(`/api/zones/${hall.id}`))
    .send({ enov_description: '' })
    .expect(200);
  assert.equal(cleared.body.enov_description, null);
});

test('catégorie-label : écrite et relue par la console des catégories', async () => {
  const created = await auth(request(app).post('/api/map-categories'))
    .send({ label: 'Label test', map_id: mapId, surfaces: ['enov'], is_distinction: true })
    .expect(201);
  assert.equal(created.body.is_distinction, true);
  const updated = await auth(request(app).put(`/api/map-categories/${created.body.id}`))
    .send({ label: 'Label test 2' })
    .expect(200);
  assert.equal(updated.body.is_distinction, true, 'omis = conservé');
  const off = await auth(request(app).put(`/api/map-categories/${created.body.id}`))
    .send({ is_distinction: false })
    .expect(200);
  assert.equal(off.body.is_distinction, false);
});

test('code d’accès propre au plan e-nov, indépendant du plan public', async () => {
  await auth(request(app).post('/api/settings/admin/enov-plan-access-code'))
    .send({ code: 'jury-enov-2026' })
    .expect(200);
  await saveSetting('ui.enov_plan.access_mode', 'code');

  const closed = await request(app).get('/api/enov/content').expect(401);
  assert.equal(closed.body.access_required, true);
  assert.match(closed.headers['cache-control'], /no-store/);
  // Le plan public, lui, reste ouvert.
  await request(app).get('/api/plan/content').expect(200);
  // Les routes génériques servies sur le host e-nov suivent la même garde.
  await request(app).get('/api/map-categories').set('X-Foretmap-Product', 'enov').expect(401);

  await request(app).post('/api/enov/access').send({ code: 'mauvais-code' }).expect(401);
  const granted = await request(app)
    .post('/api/enov/access')
    .send({ code: 'jury-enov-2026' })
    .expect(200);
  const cookie = granted.headers['set-cookie'];
  assert.ok(String(cookie).includes('enov_plan_access'));
  const open = await request(app).get('/api/enov/content').set('Cookie', cookie).expect(200);
  assert.match(open.headers['cache-control'], /^private/);

  // Lien profond porteur du code (QR remis au jury).
  await request(app).get('/api/enov/content?code=jury-enov-2026').expect(200);

  await request(app).post('/api/enov/logout').expect(200);
  await saveSetting('ui.enov_plan.access_mode', 'public');
  await auth(request(app).post('/api/settings/admin/enov-plan-access-code'))
    .send({ code: '' })
    .expect(200);
});

test('réglages : couleur validée, empreinte du code non écrivable, settings publics', async () => {
  await auth(request(app).put('/api/settings/admin/ui.enov_plan.highlight_color'))
    .send({ value: 'rouge' })
    .expect(400);
  await auth(request(app).put('/api/settings/admin/ui.enov_plan.highlight_color'))
    .send({ value: '#22AA88' })
    .expect(200);
  await auth(request(app).put('/api/settings/admin/security.enov_plan_access_code_hash'))
    .send({ value: 'x' })
    .expect(400);
  clearCaches();
  const res = await request(app).get('/api/enov/settings').expect(200);
  assert.equal(res.body.enov.highlight_color, '#22aa88');
  assert.equal(res.body.map_id, undefined, 'réglage d’exploitation non exposé');
});

test('compteur d’usage : produit enov et événement innovations_open acceptés', async () => {
  const res = await request(app)
    .post('/api/usage')
    .send({ product: 'enov', event: 'innovations_open', key: '3' });
  assert.ok(res.status < 300, `statut ${res.status}`);
  await request(app).post('/api/usage').send({ product: 'enov', event: 'inconnu' }).expect(400);
});
