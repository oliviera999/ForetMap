'use strict';

/**
 * Audit ForetMap du 19/11/2026 — lot 7 (terrain : lieux, catégories, parcours, plans).
 *
 * Chaque bloc rejoue le scénario de l'audit (`docs/AUDIT_BUGS_FORETMAP_2026-11-19.md` § 5) :
 * il échoue sur le code d'avant la correction et passe après.
 *
 * - C1  : parcours d'un plan fermé par code lisibles sans code par la Visite.
 * - C12 : `?surface=staff` — le filtre des étapes ignorait le lecteur du porteur de code.
 * - C11 : lieu supprimé ou changé de carte → étapes orphelines, parcours non réenregistrable.
 * - C4  : catégorie désactivée retirée par tout PUT du lieu.
 * - C8  : entrées non textuelles → 500 (nom, libellé, `x_pct`, `image_data`).
 * - C9  : coordonnées d'un repère non bornées en modification.
 * - C10 : image de carte trop lourde → 500 au lieu d'un message.
 * - C6  : signalement d'un lieu d'une carte sélectionnable du plan des personnels → 404.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const { initSchema, initDatabase, execute, queryAll, queryOne } = require('../database');
const { app } = require('../server');
const { ensureRbacBootstrap, getRoleBySlug, setPrimaryRole } = require('../lib/rbac');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { setSetting, invalidateSettingsCache } = require('../lib/settings');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');
const fx = require('./helpers/fmFixtures');
const { planContentCache } = require('../routes/plan');

const SETTING_KEYS = [
  'ui.plan.map_id',
  'ui.plan.access_mode',
  'security.plan_access_code_hash',
  'ui.staff_plan.access_mode',
  'ui.staff_plan.selectable_map_ids',
  'ui.staff_plan.code_role_slug',
  'security.staff_plan_access_code_hash',
  'ui.modules.context_comments_enabled',
];

const snapshots = [];
const createdMapIds = [];
const createdUserIds = [];
let adminToken = '';
/** Carte des plans gardés (`ui.plan.map_id`). */
let planMap;
/** Carte de travail ordinaire. */
let workMap;
/** Seconde carte de travail (changement de carte d'un lieu). */
let otherMap;

const actor = { userType: 'teacher', userId: 'test' };

function asAdmin(req) {
  return req.set('Authorization', `Bearer ${adminToken}`);
}

async function newMap(label) {
  const map = await fx.createMap({ label });
  createdMapIds.push(map.id);
  return map;
}

/** Compte « Personnel » : un agent sans aucun droit au-delà du plan des personnels. */
async function createPersonnelAccount() {
  const userId = crypto.randomUUID();
  const email = `lot7_${Date.now()}_${Math.floor(Math.random() * 10000)}@ecole.local`;
  await execute(
    `INSERT INTO users
      (id, user_type, email, pseudo, first_name, last_name, display_name, password_hash,
       auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, ?, 'Agent', 'Lot7', 'Agent Lot7', 'x', 'local', 1, NOW(), NOW())`,
    [userId, email, `lot7_${userId.slice(0, 8)}`],
  );
  const role = await getRoleBySlug('personnel');
  assert.ok(role?.id, 'Profil « personnel » introuvable');
  await setPrimaryRole('teacher', userId, role.id);
  createdUserIds.push(userId);
  return { userId, token: await signAuthToken({ product: 'foret', userType: 'teacher', userId }) };
}

/** Crée un parcours publié via l'API (comme l'éditeur). */
async function createRoute(body) {
  const res = await asAdmin(request(app).post('/api/map-routes'))
    .send({ is_published: true, ...body })
    .expect(201);
  return res.body;
}

async function routeSteps(routeId) {
  return queryAll(
    'SELECT target_type, target_id FROM map_route_steps WHERE route_id = ? ORDER BY position',
    [routeId],
  );
}

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  for (const key of SETTING_KEYS) snapshots.push(await snapshotSetting(key));
  adminToken = await ensureAdminTeacherAuthToken({ elevated: true });
  planMap = await newMap('Lot 7 — plan gardé');
  workMap = await newMap('Lot 7 — carte de travail');
  otherMap = await newMap('Lot 7 — autre carte');
  await setSetting('ui.plan.map_id', planMap.id, actor);
  await setSetting('ui.plan.access_mode', 'public', actor);
  await setSetting('security.plan_access_code_hash', '', { userType: 'admin', userId: 'test' });
  invalidateSettingsCache();
});

test.beforeEach(async () => {
  adminToken = await ensureAdminTeacherAuthToken({ elevated: true });
  planContentCache.clear();
  invalidateSettingsCache();
});

test.after(async () => {
  for (const mapId of createdMapIds) {
    await execute(
      'DELETE s FROM map_route_steps s JOIN map_routes r ON r.id = s.route_id WHERE r.map_id = ?',
      [mapId],
    );
    await execute('DELETE FROM map_routes WHERE map_id = ?', [mapId]);
    await execute(
      'DELETE zc FROM zone_categories zc JOIN zones z ON z.id = zc.zone_id WHERE z.map_id = ?',
      [mapId],
    );
    await execute(
      'DELETE mc FROM marker_categories mc JOIN map_markers m ON m.id = mc.marker_id WHERE m.map_id = ?',
      [mapId],
    );
    await execute('DELETE FROM location_categories WHERE map_id = ?', [mapId]);
    // Miroirs visite des lieux (`mirrorLocationToVisit`), liés à la carte par clé étrangère.
    await execute('DELETE FROM visit_zones WHERE map_id = ?', [mapId]);
    await execute('DELETE FROM visit_markers WHERE map_id = ?', [mapId]);
    await execute('DELETE FROM zones WHERE map_id = ?', [mapId]);
    await execute('DELETE FROM map_markers WHERE map_id = ?', [mapId]);
    await execute('DELETE FROM maps WHERE id = ?', [mapId]);
  }
  for (const userId of createdUserIds) {
    await execute('DELETE FROM context_comments WHERE author_user_id = ?', [userId]);
    await execute('DELETE FROM user_roles WHERE user_id = ?', [userId]);
    await execute('DELETE FROM users WHERE id = ?', [userId]);
  }
  for (const snapshot of snapshots) await restoreSetting(snapshot);
});

// ── C1 — parcours d'un plan fermé par code ───────────────────────────────────────────────

test('C1 : un parcours de la carte d’un plan fermé par code ne sort pas par la Visite', async () => {
  const zone = await fx.createZone({ mapId: planMap.id, name: 'Loge' });
  const route = await createRoute({
    map_id: planMap.id,
    title: 'Tour des nouveaux personnels lot7',
    surfaces: ['map', 'visit', 'plan'],
    steps: [
      { target_type: 'zone', target_id: zone.id, step_text: 'Badge requis, code porte 4321' },
    ],
  });
  const hash = await bcrypt.hash('FERME-LOT7', 10);
  await setSetting('ui.plan.access_mode', 'code', actor);
  await setSetting('security.plan_access_code_hash', hash, { userType: 'admin', userId: 'test' });
  invalidateSettingsCache();
  try {
    const leaks = (body) =>
      (Array.isArray(body) ? body : []).some(
        (r) => r.id === route.id || JSON.stringify(r).includes('code porte 4321'),
      );
    // Hôte ForetMap, anonyme : la surface décidée est `visit`.
    const anon = await request(app).get('/api/map-routes').expect(200);
    assert.equal(leaks(anon.body), false, 'catalogue anonyme : le parcours du plan ne sort pas');
    const visit = await request(app).get('/api/map-routes?surface=visit').expect(200);
    assert.equal(leaks(visit.body), false, '?surface=visit : le parcours du plan ne sort pas');
    // Hôte du plan, surface forcée à `visit`.
    const onPlanHost = await request(app)
      .get('/api/map-routes?surface=visit')
      .set('X-Foretmap-Product', 'plan')
      .expect(200);
    assert.equal(leaks(onPlanHost.body), false, 'hôte du plan + ?surface=visit');
    // La carte du plan, demandée explicitement sur la Visite : « Carte introuvable ».
    await request(app).get(`/api/map-routes?map_id=${planMap.id}&surface=visit`).expect(400);
    // La surface du plan, elle, reste fermée par le code.
    await request(app).get('/api/map-routes?surface=plan').expect(401);
  } finally {
    await setSetting('ui.plan.access_mode', 'public', actor);
    await setSetting('security.plan_access_code_hash', '', { userType: 'admin', userId: 'test' });
    invalidateSettingsCache();
  }
  // Plan ouvert : le porteur de la surface plan le lit toujours.
  const onPlan = await request(app)
    .get(`/api/map-routes?map_id=${planMap.id}&surface=plan`)
    .expect(200);
  assert.ok(onPlan.body.some((r) => r.id === route.id));
});

test('C1 : le détail public ne sert pas un parcours « visit » posé sur la carte du plan', async () => {
  const zone = await fx.createZone({ mapId: planMap.id, name: 'Accueil plan' });
  const visitOnly = await createRoute({
    map_id: planMap.id,
    title: 'Seulement visite lot7',
    surfaces: ['visit'],
    steps: [{ target_type: 'zone', target_id: zone.id, step_text: 'Texte réservé' }],
  });
  await request(app).get(`/api/map-routes/${visitOnly.id}`).expect(404);
  await request(app).get(`/api/map-routes/${visitOnly.slug}`).expect(404);

  // Le même parcours publié aussi sur le plan sort par la porte du plan (garde passée).
  const both = await createRoute({
    map_id: planMap.id,
    title: 'Plan et visite lot7',
    surfaces: ['visit', 'plan'],
    steps: [{ target_type: 'zone', target_id: zone.id, step_text: 'Texte du plan' }],
  });
  const detail = await request(app).get(`/api/map-routes/${both.id}`).expect(200);
  assert.equal(detail.body.id, both.id);
  assert.equal(detail.body.steps.length, 1);
});

// ── C12 — `?surface=staff` et lecteur du porteur de code ─────────────────────────────────

test('C12 : ?surface=staff garde les étapes destinées au rôle du porteur de code', async () => {
  const reserved = await fx.createZone({ mapId: planMap.id, name: 'Local agents' });
  await execute('UPDATE zones SET visible_role_slugs = ? WHERE id = ?', [
    JSON.stringify(['personnel']),
    reserved.id,
  ]);
  const route = await createRoute({
    map_id: planMap.id,
    title: 'Tournée des agents lot7',
    surfaces: ['staff'],
    steps: [{ target_type: 'zone', target_id: reserved.id, step_text: 'Pour les agents' }],
  });
  await setSetting('ui.staff_plan.access_mode', 'code', actor);
  await setSetting('ui.staff_plan.code_role_slug', 'personnel', actor);
  await asAdmin(request(app).post('/api/settings/admin/staff-plan-access-code'))
    .send({ code: 'code-lot7-agents' })
    .expect(200);
  invalidateSettingsCache();
  try {
    const granted = await request(app)
      .post('/api/staff-plan/access')
      .send({ code: 'code-lot7-agents' })
      .expect(200);
    const pass = []
      .concat(granted.headers['set-cookie'] || [])
      .find((c) => c.startsWith('staff_plan_access='));
    assert.ok(pass, 'laissez-passer du plan des personnels posé');
    const res = await request(app)
      .get(`/api/map-routes?map_id=${planMap.id}&surface=staff`)
      .set('Cookie', String(pass).split(';')[0])
      .expect(200);
    const found = res.body.find((r) => r.id === route.id);
    assert.ok(found, 'le parcours staff est servi au porteur de code');
    assert.equal(found.steps.length, 1, 'l’étape réservée au rôle du porteur reste');
    assert.equal(found.steps[0].step_text, 'Pour les agents');
  } finally {
    await setSetting('ui.staff_plan.access_mode', 'disabled', actor);
    invalidateSettingsCache();
  }
});

// ── C11 — étapes orphelines ──────────────────────────────────────────────────────────────

test('C11 : supprimer un lieu retire ses étapes, le parcours reste enregistrable', async () => {
  const keep = await fx.createZone({ mapId: workMap.id, name: 'Reste' });
  const doomed = await fx.createZone({ mapId: workMap.id, name: 'Supprimée' });
  const route = await createRoute({
    map_id: workMap.id,
    title: 'Parcours suppression lot7',
    surfaces: ['map'],
    steps: [
      { target_type: 'zone', target_id: keep.id },
      { target_type: 'zone', target_id: doomed.id },
    ],
  });
  await asAdmin(request(app).delete(`/api/zones/${doomed.id}`)).expect(200);
  const steps = await routeSteps(route.id);
  assert.deepEqual(
    steps.map((s) => s.target_id),
    [keep.id],
    'l’étape du lieu supprimé disparaît avec lui',
  );
  // Réenregistrer le parcours tel que la gestion le relit : plus de 400 « ce lieu n'existe pas ».
  const managed = await asAdmin(
    request(app).get(`/api/map-routes/manage?map_id=${workMap.id}`),
  ).expect(200);
  const current = managed.body.find((r) => r.id === route.id);
  await asAdmin(request(app).put(`/api/map-routes/${route.id}`))
    .send({ title: 'Parcours suppression lot7 bis', steps: current.steps })
    .expect(200);
});

test('C11 : changer un repère de carte retire ses étapes des parcours de l’ancienne carte', async () => {
  const marker = await fx.createMarker({ mapId: workMap.id, label: 'Déménage' });
  const stay = await fx.createMarker({ mapId: workMap.id, label: 'Reste là' });
  const route = await createRoute({
    map_id: workMap.id,
    title: 'Parcours déménagement lot7',
    surfaces: ['map'],
    steps: [
      { target_type: 'marker', target_id: marker.id },
      { target_type: 'marker', target_id: stay.id },
    ],
  });
  await asAdmin(request(app).put(`/api/map/markers/${marker.id}`))
    .send({ map_id: otherMap.id })
    .expect(200);
  const steps = await routeSteps(route.id);
  assert.deepEqual(
    steps.map((s) => s.target_id),
    [stay.id],
  );
  const managed = await asAdmin(
    request(app).get(`/api/map-routes/manage?map_id=${workMap.id}`),
  ).expect(200);
  const current = managed.body.find((r) => r.id === route.id);
  await asAdmin(request(app).put(`/api/map-routes/${route.id}`))
    .send({ steps: current.steps })
    .expect(200);
});

// ── C4 — catégorie désactivée ───────────────────────────────────────────────────────────

test('C4 : un PUT sans category_ids conserve l’affectation à une catégorie désactivée', async () => {
  const zone = await fx.createZone({ mapId: workMap.id, name: 'Potager lot7' });
  const marker = await fx.createMarker({ mapId: workMap.id, label: 'Composteur lot7' });
  const category = await fx.createLocationCategory({
    mapId: workMap.id,
    label: 'Saison passée',
    zoneIds: [zone.id],
    markerIds: [marker.id],
  });
  const fresh = await fx.createLocationCategory({ mapId: workMap.id, label: 'Inactive neuve' });
  await execute('UPDATE location_categories SET is_active = 0 WHERE id IN (?, ?)', [
    category.id,
    fresh.id,
  ]);

  await asAdmin(request(app).put(`/api/zones/${zone.id}`))
    .send({ description: 'Mise à jour du texte' })
    .expect(200);
  await asAdmin(request(app).put(`/api/map/markers/${marker.id}`))
    .send({ note: 'Mise à jour de la note' })
    .expect(200);
  const zoneCats = await queryAll('SELECT category_id FROM zone_categories WHERE zone_id = ?', [
    zone.id,
  ]);
  const markerCats = await queryAll(
    'SELECT category_id FROM marker_categories WHERE marker_id = ?',
    [marker.id],
  );
  assert.deepEqual(
    zoneCats.map((r) => r.category_id),
    [category.id],
  );
  assert.deepEqual(
    markerCats.map((r) => r.category_id),
    [category.id],
  );

  // Redemandée explicitement : conservée. Une catégorie inactive ne s'AJOUTE pas.
  await asAdmin(request(app).put(`/api/zones/${zone.id}`))
    .send({ category_ids: [category.id, fresh.id] })
    .expect(200);
  const after = await queryAll('SELECT category_id FROM zone_categories WHERE zone_id = ?', [
    zone.id,
  ]);
  assert.deepEqual(
    after.map((r) => r.category_id),
    [category.id],
  );

  // Réactivée : l'affectation est toujours là.
  await execute('UPDATE location_categories SET is_active = 1 WHERE id = ?', [category.id]);
  const list = await asAdmin(request(app).get(`/api/zones?map_id=${workMap.id}`)).expect(200);
  const row = list.body.find((z) => z.id === zone.id);
  assert.ok(row.category_ids.includes(category.id));
});

// ── C8 / C9 — validation des écritures de lieux ─────────────────────────────────────────

test('C8 : nom ou libellé non textuel → 400 (et non 500)', async () => {
  const points = [
    { xp: 10, yp: 10 },
    { xp: 20, yp: 10 },
    { xp: 20, yp: 20 },
  ];
  await asAdmin(request(app).post('/api/zones'))
    .send({ map_id: workMap.id, name: 123, points })
    .expect(400);
  await asAdmin(request(app).post('/api/map/markers'))
    .send({ map_id: workMap.id, label: { texte: 'x' }, x_pct: 10, y_pct: 10 })
    .expect(400);
  const marker = await fx.createMarker({ mapId: workMap.id, label: 'Libellé intact' });
  await asAdmin(request(app).put(`/api/map/markers/${marker.id}`))
    .send({ label: { texte: 'x' } })
    .expect(400);
  const row = await queryOne('SELECT label FROM map_markers WHERE id = ?', [marker.id]);
  assert.equal(row.label, 'Libellé intact');
});

test('C8 : x_pct non numérique en PUT → 400 avant toute écriture des catégories', async () => {
  const marker = await fx.createMarker({ mapId: workMap.id, label: 'Repère catégorisé' });
  const category = await fx.createLocationCategory({
    mapId: workMap.id,
    label: 'Gardée',
    markerIds: [marker.id],
  });
  await asAdmin(request(app).put(`/api/map/markers/${marker.id}`))
    .send({ x_pct: 'abc', category_ids: [] })
    .expect(400);
  const cats = await queryAll('SELECT category_id FROM marker_categories WHERE marker_id = ?', [
    marker.id,
  ]);
  assert.deepEqual(
    cats.map((r) => r.category_id),
    [category.id],
    'aucune écriture partielle des catégories',
  );
});

test('C8 : image_data non textuelle → 400, aucune ligne photo créée', async () => {
  const zone = await fx.createZone({ mapId: workMap.id, name: 'Photo lot7' });
  const marker = await fx.createMarker({ mapId: workMap.id, label: 'Photo repère lot7' });
  const res = await asAdmin(request(app).post(`/api/zones/${zone.id}/photos`))
    .send({ image_data: 12345 })
    .expect(400);
  assert.match(res.body.error, /Image invalide/);
  await asAdmin(request(app).post(`/api/map/markers/${marker.id}/photos`))
    .send({ image_data: { a: 1 } })
    .expect(400);
  const zp = await queryAll('SELECT id FROM zone_photos WHERE zone_id = ?', [zone.id]);
  const mp = await queryAll('SELECT id FROM marker_photos WHERE marker_id = ?', [marker.id]);
  assert.equal(zp.length, 0);
  assert.equal(mp.length, 0);
});

test('C9 : coordonnées d’un repère bornées 0–100 en modification', async () => {
  const marker = await fx.createMarker({ mapId: workMap.id, label: 'Borné' });
  const before = await queryOne('SELECT x_pct, y_pct FROM map_markers WHERE id = ?', [marker.id]);
  await asAdmin(request(app).put(`/api/map/markers/${marker.id}`))
    .send({ x_pct: 250 })
    .expect(400);
  await asAdmin(request(app).put(`/api/map/markers/${marker.id}`))
    .send({ y_pct: -40 })
    .expect(400);
  const unchanged = await queryOne('SELECT x_pct, y_pct FROM map_markers WHERE id = ?', [
    marker.id,
  ]);
  assert.equal(Number(unchanged.x_pct), Number(before.x_pct));
  assert.equal(Number(unchanged.y_pct), Number(before.y_pct));
  await asAdmin(request(app).put(`/api/map/markers/${marker.id}`))
    .send({ x_pct: 42.5, y_pct: '17' })
    .expect(200);
  const moved = await queryOne('SELECT x_pct, y_pct FROM map_markers WHERE id = ?', [marker.id]);
  assert.equal(Number(moved.x_pct), 42.5);
  assert.equal(Number(moved.y_pct), 17);
});

// ── C10 — image de carte trop lourde ─────────────────────────────────────────────────────

test('C10 : image de carte au-delà de la borne → 413 « Fichier trop volumineux »', async () => {
  const previous = process.env.FORETMAP_MAX_UPLOAD_BYTES;
  process.env.FORETMAP_MAX_UPLOAD_BYTES = String(64 * 1024);
  try {
    const big = Buffer.alloc(100 * 1024, 0);
    big[0] = 0xff;
    big[1] = 0xd8;
    big[2] = 0xff;
    const res = await asAdmin(request(app).post(`/api/settings/admin/maps/${workMap.id}/image`))
      .send({ image_data: `data:image/jpeg;base64,${big.toString('base64')}` })
      .expect(413);
    assert.match(res.body.error, /Fichier trop volumineux/);
    const map = await queryOne('SELECT map_image_url FROM maps WHERE id = ?', [workMap.id]);
    assert.ok(!String(map.map_image_url || '').includes(workMap.id), 'image inchangée');
  } finally {
    if (previous === undefined) delete process.env.FORETMAP_MAX_UPLOAD_BYTES;
    else process.env.FORETMAP_MAX_UPLOAD_BYTES = previous;
  }
});

// ── C6 — signalement depuis une carte sélectionnable du plan des personnels ─────────────

test('C6 : signaler un lieu d’une carte sélectionnable du plan des personnels', async () => {
  const selectable = await newMap('Lot 7 — bâtiment B');
  const place = await fx.createZone({ mapId: selectable.id, name: 'Salle B12' });
  const notDeclared = await newMap('Lot 7 — carte non déclarée');
  const hidden = await fx.createZone({ mapId: notDeclared.id, name: 'Hors plan' });
  await setSetting('ui.staff_plan.selectable_map_ids', selectable.id, actor);
  await setSetting('ui.modules.context_comments_enabled', true, actor);
  invalidateSettingsCache();
  const personnel = await createPersonnelAccount();
  const send = (body) =>
    request(app)
      .post('/api/staff-plan/report')
      .set('Authorization', `Bearer ${personnel.token}`)
      .send(body);

  // Sans la carte : seule la carte par défaut est fouillée (comportement conservé).
  await send({ contextType: 'zone', contextId: place.id, body: 'Prise cassée' }).expect(404);
  // Carte hors liste blanche : « Carte introuvable », pas de fouille.
  const outside = await send({
    contextType: 'zone',
    contextId: hidden.id,
    body: 'Prise cassée',
    mapId: notDeclared.id,
  }).expect(404);
  assert.equal(outside.body.error, 'Carte introuvable');
  // Carte sélectionnable affichée : le lieu est trouvé.
  const created = await send({
    contextType: 'zone',
    contextId: place.id,
    body: 'Prise cassée près du tableau',
    mapId: selectable.id,
  }).expect(201);
  assert.equal(created.body.report.context_id, place.id);
  await execute('DELETE FROM context_comments WHERE id = ?', [created.body.id]);
});
