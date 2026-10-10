'use strict';

/**
 * Dossier sûreté d'octobre 2026 — filet de non-régression des constats confirmés par sonde
 * locale avant la demande d'avis à l'officier de sécurité :
 *
 * - **R1** — `GET /api/zones/:id/photos` et `GET /api/map/markers/:id/photos` servaient
 *   photos et légendes de n'importe quel lieu, sans session ni code : lieu retiré du plan
 *   public, lieu réservé aux personnels, plan fermé par code.
 * - **R2** — `GET /api/map-routes` sans `?surface=` n'appliquait que la garde du plan et aucun
 *   filtre de surface : un anonyme (plan ouvert) ou le porteur du code recevait les parcours
 *   réservés aux personnels et à la carte de travail.
 * - **R4** — la Visite laissait son audience remplacer celle de la carte (`COALESCE`) ; l'éditeur
 *   écrivant `'[]'` pour « aucune restriction », un lieu réservé aux personnels sur la carte
 *   était servi à l'anonyme par `GET /api/visit/content`.
 *
 * Même montage que `tests/security-surfaces.test.js` : une carte déclarée comme carte du plan
 * public (fermé par code), un terrain public pour la Visite, la surface `plan` simulée par
 * l'en-tête `X-Foretmap-Product` (honoré hors production).
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const { initSchema, initDatabase, execute, queryOne } = require('../database');
const { app } = require('../server');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { setSetting, invalidateSettingsCache } = require('../lib/settings');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');
const { clearMapAccessCache } = require('../lib/mapAccess');
const fx = require('./helpers/fmFixtures');
const { planContentCache } = require('../routes/plan');
const { visitContentCache } = require('../routes/visit');

const PLAN_CODE = 'code-surete-test-2026';

let adminToken;
let planMapId;
let visitMapId;
const snapshots = [];
const created = { zones: [], markers: [], users: [], routes: [] };
/** Lieux du plan : public, retiré du plan, réservé aux personnels. */
const place = {};

function onPlan(req) {
  return req.set('X-Foretmap-Product', 'plan');
}

async function planCookie() {
  const res = await onPlan(request(app).post('/api/plan/access'))
    .send({ code: PLAN_CODE })
    .expect(200);
  const cookie = res.headers['set-cookie'];
  assert.ok(cookie, 'le bon code doit poser le laissez-passer');
  return cookie;
}

async function addZonePhoto(zoneId, caption) {
  await execute(
    'INSERT INTO zone_photos (zone_id, caption, sort_order, uploaded_at, image_path) VALUES (?, ?, 0, NOW(3), ?)',
    [zoneId, caption, `zones/${zoneId}/1.jpg`],
  );
}

async function addMarkerPhoto(markerId, caption) {
  await execute(
    'INSERT INTO marker_photos (marker_id, caption, sort_order, uploaded_at, image_path) VALUES (?, ?, 0, NOW(3), ?)',
    [markerId, caption, `markers/${markerId}/1.jpg`],
  );
}

/** Compte connecté de profil `slug`, sans groupe (donc sans périmètre de carte). */
async function createAccountToken(slug) {
  const { signAuthToken } = require('../middleware/requireTeacher');
  const role = await queryOne('SELECT id, display_name FROM roles WHERE slug = ? LIMIT 1', [slug]);
  assert.ok(role?.id, `rôle ${slug} requis`);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const userId = `u-surete-${stamp}`;
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, password_hash, display_name, first_name, last_name, is_active)
     VALUES (?, 'student', ?, ?, 'x', 'Lecteur sûreté', 'L', 'S', 1)`,
    [userId, `surete.${stamp}@test.local`, `surete_${stamp}`],
  );
  created.users.push(userId);
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1)',
    ['student', userId, role.id],
  );
  await execute('UPDATE users SET assigned_role_id = ? WHERE id = ?', [role.id, userId]);
  clearMapAccessCache();
  return signAuthToken({
    userType: 'student',
    userId,
    canonicalUserId: userId,
    roleId: role.id,
    roleSlug: slug,
    roleDisplayName: role.display_name,
  });
}

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  adminToken = await ensureAdminTeacherAuthToken({ elevated: true });

  planMapId = (await fx.createMap({ label: 'Plan du lycée (sûreté)' })).id;
  visitMapId = (await fx.createMap({ label: 'Terrain public (sûreté)' })).id;

  for (const key of [
    'ui.plan.map_id',
    'ui.plan.access_mode',
    'security.plan_access_code_hash',
    'ui.visit.selectable_map_ids',
  ]) {
    snapshots.push(await snapshotSetting(key));
  }
  const by = { userType: 'teacher', userId: 'test' };
  await setSetting('ui.plan.map_id', planMapId, by);
  await setSetting('ui.plan.access_mode', 'code', by);
  await setSetting('security.plan_access_code_hash', await bcrypt.hash(PLAN_CODE, 10), by);
  invalidateSettingsCache();

  place.public = (await fx.createZone({ mapId: planMapId, name: 'Accueil' })).id;
  place.retired = (
    await fx.createZone({ mapId: planMapId, name: 'Accès technique', hiddenSurfaces: ['plan'] })
  ).id;
  place.reserved = (await fx.createZone({ mapId: planMapId, name: 'Local réservé' })).id;
  await execute('UPDATE zones SET visible_role_slugs = ? WHERE id = ?', [
    JSON.stringify(['personnel']),
    place.reserved,
  ]);
  place.retiredMarker = (
    await fx.createMarker({ mapId: planMapId, label: 'Portail', hiddenSurfaces: ['plan'] })
  ).id;
  created.zones.push(place.public, place.retired, place.reserved);
  created.markers.push(place.retiredMarker);
  await addZonePhoto(place.public, 'PHOTO-PUBLIQUE');
  await addZonePhoto(place.retired, 'PHOTO-LIEU-RETIRE');
  await addZonePhoto(place.reserved, 'PHOTO-LIEU-RESERVE');
  await addMarkerPhoto(place.retiredMarker, 'PHOTO-REPERE-RETIRE');

  // Un parcours publié par surface : plan, personnels seulement, carte de travail seulement,
  // Visite (sur le terrain public).
  for (const [key, mapId, surfaces] of [
    ['plan', planMapId, 'plan'],
    ['staff', planMapId, 'staff'],
    ['map', planMapId, 'map'],
    ['visit', visitMapId, 'visit'],
  ]) {
    const id = `route-surete-${key}-${Date.now()}`;
    await execute(
      `INSERT INTO map_routes (id, map_id, slug, title, description, audience, surfaces, is_published, sort_order)
       VALUES (?, ?, ?, ?, '', '', ?, 1, 1)`,
      [id, mapId, id, `PARCOURS-${key.toUpperCase()}`, surfaces],
    );
    created.routes.push(id);
  }

  // Terrain public de la Visite : un lieu réservé aux personnels sur la carte, que l'éditeur de
  // Visite a laissé « sans restriction » (`'[]'`) ; un lieu ouvert sur la carte mais restreint
  // en Visite ; un lieu ouvert partout.
  place.visitMapReserved = (await fx.createZone({ mapId: visitMapId, name: 'Réservé carte' })).id;
  await execute('UPDATE zones SET visible_role_slugs = ? WHERE id = ?', [
    JSON.stringify(['personnel']),
    place.visitMapReserved,
  ]);
  await addVisitZone(place.visitMapReserved, visitMapId, '[]');
  place.visitOnlyReserved = (await fx.createZone({ mapId: visitMapId, name: 'Réservé visite' })).id;
  await addVisitZone(place.visitOnlyReserved, visitMapId, JSON.stringify(['personnel']));
  place.visitOpen = (await fx.createZone({ mapId: visitMapId, name: 'Ouvert' })).id;
  await addVisitZone(place.visitOpen, visitMapId, '[]');
  created.zones.push(place.visitMapReserved, place.visitOnlyReserved, place.visitOpen);
});

/** Lieu de Visite (ligne `visit_zones`) recopié d'une zone, avec son audience propre. */
async function addVisitZone(zoneId, mapId, visitRoleSlugs) {
  await execute(
    `INSERT INTO visit_zones (id, map_id, name, points, subtitle, visible_role_slugs, is_active, sort_order)
     VALUES (?, ?, ?, '[]', '', ?, 1, 0)`,
    [zoneId, mapId, zoneId, visitRoleSlugs],
  );
}

/** Titres des parcours d'une réponse de catalogue. */
function routeTitles(res) {
  return (Array.isArray(res.body) ? res.body : []).map((r) => r.title).sort();
}

test.beforeEach(async () => {
  adminToken = await ensureAdminTeacherAuthToken({ elevated: true });
  planContentCache.clear();
  visitContentCache.clear();
});

test.after(async () => {
  for (const id of created.routes) {
    await execute('DELETE FROM map_route_steps WHERE route_id = ?', [id]);
    await execute('DELETE FROM map_routes WHERE id = ?', [id]);
  }
  for (const id of created.zones) {
    await execute('DELETE FROM zone_photos WHERE zone_id = ?', [id]);
    await execute('DELETE FROM visit_zones WHERE id = ?', [id]);
    await execute('DELETE FROM zones WHERE id = ?', [id]);
  }
  for (const id of created.markers) {
    await execute('DELETE FROM marker_photos WHERE marker_id = ?', [id]);
    await execute('DELETE FROM visit_markers WHERE id = ?', [id]);
    await execute('DELETE FROM map_markers WHERE id = ?', [id]);
  }
  for (const id of [planMapId, visitMapId]) {
    await execute('DELETE FROM maps WHERE id = ?', [id]);
  }
  for (const id of created.users) {
    await execute('DELETE FROM user_roles WHERE user_id = ?', [id]);
    await execute('DELETE FROM users WHERE id = ?', [id]);
  }
  for (const snap of snapshots) await restoreSetting(snap);
  invalidateSettingsCache();
});

test('R1 — plan fermé par code : sans laissez-passer, aucune photo de lieu ne sort', async () => {
  for (const id of [place.public, place.retired, place.reserved]) {
    const res = await onPlan(request(app).get(`/api/zones/${id}/photos`));
    assert.equal(res.status, 401, `photos de ${id} servies sans code`);
  }
  const marker = await onPlan(request(app).get(`/api/map/markers/${place.retiredMarker}/photos`));
  assert.equal(marker.status, 401);
});

test('R1 — porteur du code : photos du lieu public seulement', async () => {
  const cookie = await planCookie();
  const ok = await onPlan(request(app).get(`/api/zones/${place.public}/photos`)).set(
    'Cookie',
    cookie,
  );
  assert.equal(ok.status, 200);
  assert.equal(ok.body.length, 1);
  assert.equal(ok.body[0].caption, 'PHOTO-PUBLIQUE');

  for (const id of [place.retired, place.reserved]) {
    const res = await onPlan(request(app).get(`/api/zones/${id}/photos`)).set('Cookie', cookie);
    assert.equal(res.status, 404, `photos de ${id} servies au porteur du code du plan`);
    assert.ok(!JSON.stringify(res.body).includes('PHOTO-'), 'aucune légende ne doit sortir');
  }
  const marker = await onPlan(
    request(app).get(`/api/map/markers/${place.retiredMarker}/photos`),
  ).set('Cookie', cookie);
  assert.equal(marker.status, 404);
});

test('R1 — visite libre (ForêtMap, sans compte) : la carte du plan ne livre aucune photo', async () => {
  const res = await request(app).get(`/api/zones/${place.public}/photos`);
  assert.equal(res.status, 404);
  const unknown = await request(app).get('/api/zones/zone-inexistante/photos');
  assert.equal(unknown.status, 404);
});

test('R1 — compte élève : la photo d’un lieu réservé aux personnels ne sort pas', async () => {
  const token = await createAccountToken('eleve_novice');
  const res = await request(app)
    .get(`/api/zones/${place.reserved}/photos`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 404);
  const data = await request(app)
    .get(`/api/zones/${place.reserved}/photos/1/data`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(data.status, 404, 'le fichier suit la même règle que la liste');
});

test('R1 — gestionnaire des lieux : la garde ne lui ferme rien', async () => {
  for (const id of [place.public, place.retired, place.reserved]) {
    const res = await request(app)
      .get(`/api/zones/${id}/photos`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200, `l'administrateur doit lire les photos de ${id}`);
    assert.equal(res.body.length, 1);
  }
});

test('R2 — catalogue des parcours, adresse du plan, porteur du code : parcours du plan seulement', async () => {
  const cookie = await planCookie();
  const res = await onPlan(request(app).get('/api/map-routes')).set('Cookie', cookie);
  assert.equal(res.status, 200);
  const titles = routeTitles(res);
  assert.ok(titles.includes('PARCOURS-PLAN'));
  assert.ok(!titles.includes('PARCOURS-STAFF'), 'parcours des personnels servi au porteur du code');
  assert.ok(!titles.includes('PARCOURS-MAP'), 'parcours de la carte de travail servi au plan');
});

test('R2 — catalogue des parcours, adresse du plan ouverte à tous : rien de réservé ne sort', async () => {
  const by = { userType: 'teacher', userId: 'test' };
  await setSetting('ui.plan.access_mode', 'public', by);
  invalidateSettingsCache();
  try {
    const res = await onPlan(request(app).get('/api/map-routes'));
    assert.equal(res.status, 200);
    const titles = routeTitles(res);
    assert.ok(!titles.includes('PARCOURS-STAFF'));
    assert.ok(!titles.includes('PARCOURS-MAP'));
  } finally {
    await setSetting('ui.plan.access_mode', 'code', by);
    invalidateSettingsCache();
  }
});

test('R2 — ForêtMap sans compte : seuls les parcours de la Visite sortent', async () => {
  const res = await request(app).get('/api/map-routes');
  assert.equal(res.status, 200);
  const titles = routeTitles(res);
  assert.ok(titles.includes('PARCOURS-VISIT'));
  for (const t of ['PARCOURS-PLAN', 'PARCOURS-STAFF', 'PARCOURS-MAP']) {
    assert.ok(!titles.includes(t), `${t} servi à un anonyme sur ForêtMap`);
  }
});

test('R2 — un personnel lit toujours les parcours qui lui sont destinés (?surface=staff)', async () => {
  const token = await createAccountToken('personnel');
  const res = await request(app)
    .get('/api/map-routes?surface=staff')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.ok(routeTitles(res).includes('PARCOURS-STAFF'));
});

/** Identifiants des zones d'une charge de Visite. */
function visitZoneIds(res) {
  return (res.body?.zones || []).map((z) => z.id);
}

test('R4 — Visite sans compte : un lieu réservé sur la carte reste réservé', async () => {
  const res = await request(app).get(`/api/visit/content?map_id=${visitMapId}`);
  assert.equal(res.status, 200);
  const ids = visitZoneIds(res);
  assert.ok(ids.includes(place.visitOpen), 'le lieu ouvert doit rester servi');
  assert.ok(!ids.includes(place.visitMapReserved), 'lieu réservé sur la carte servi en Visite');
  assert.ok(!ids.includes(place.visitOnlyReserved), 'la Visite peut toujours restreindre');
  for (const zone of res.body.zones) {
    assert.ok(!('map_visible_role_slugs' in zone), 'l’audience de carte ne sort pas');
  }
});

test('R4 — Visite, compte personnel : les deux lieux réservés lui sont servis', async () => {
  const token = await createAccountToken('personnel');
  const res = await request(app)
    .get(`/api/visit/content?map_id=${visitMapId}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  const ids = visitZoneIds(res);
  assert.ok(ids.includes(place.visitMapReserved));
  assert.ok(ids.includes(place.visitOnlyReserved));
});
