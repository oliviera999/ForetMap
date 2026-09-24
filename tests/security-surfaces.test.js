'use strict';

/**
 * Politique d'accès par surface — filet de non-régression des lots A à E de
 * `docs/AUDIT_SECURITE_2026-09-22.md`.
 *
 * Ce fichier est le « tableau des routes » du §8 de l'audit, rendu exécutable. Il vérifie,
 * pour chaque route de lieux et chaque surface, qu'une requête **sans authentification et
 * sans code** obtient un refus ou des données filtrées — et, symétriquement, que le porteur
 * du bon code obtient bien ce à quoi il a droit (une garde qui enferme tout le monde dehors
 * n'est pas une garde, c'est une panne).
 *
 * Les trois constats qu'il ferme :
 * - **S1** — le code du plan ne fermait que `/api/plan/content` : `/api/zones?map_id=…`
 *   rendait les zones de la même carte à un anonyme.
 * - **S2** — `hidden_surfaces` n'était appliqué que si le client demandait `?surface=`.
 * - **S4** — omettre `?map_id=` élargissait la réponse à toutes les cartes.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const { initSchema, initDatabase, execute } = require('../database');
const { app } = require('../server');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { setSetting, invalidateSettingsCache } = require('../lib/settings');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');
const fx = require('./helpers/fmFixtures');
const { planContentCache } = require('../routes/plan');

/** Code du plan utilisé par la suite (jamais stocké en clair : seul son hachage l'est). */
const PLAN_CODE = 'code-de-test-4242';

let teacherToken;
/** Carte « plan » : déclarée comme carte du plan public, donc **réservée** à cette surface. */
let planMapId;
/** Carte « visite » : aucune déclaration de plan, donc servie sur la surface publique. */
let visitMapId;
const snapshots = [];
const created = { zones: [], markers: [], users: [], groups: [] };

function asTeacher(req) {
  return req.set('Authorization', `Bearer ${teacherToken}`);
}

/** Requête sur le produit `plan` (host planlyautey en production). */
function onPlan(req) {
  return req.set('X-Foretmap-Product', 'plan');
}

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  teacherToken = await ensureAdminTeacherAuthToken({ elevated: true });

  planMapId = (await fx.createMap({ label: 'Plan (surface gardée)' })).id;
  visitMapId = (await fx.createMap({ label: 'Terrain (surface publique)' })).id;

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

  // Un lieu par carte, plus un repère explicitement masqué sur le plan : c'est lui que le
  // test de non-régression S2 traque.
  created.zones.push((await fx.createZone({ mapId: planMapId, name: 'Zone du plan' })).id);
  created.zones.push((await fx.createZone({ mapId: visitMapId, name: 'Zone du terrain' })).id);
  created.markers.push((await fx.createMarker({ mapId: planMapId, label: 'Accueil' })).id);
  created.markers.push(
    (
      await fx.createMarker({
        mapId: planMapId,
        label: 'Infirmerie',
        hiddenSurfaces: ['plan'],
      })
    ).id,
  );
});

test.beforeEach(async () => {
  teacherToken = await ensureAdminTeacherAuthToken({ elevated: true });
  planContentCache.clear();
});

test.after(async () => {
  for (const id of created.zones) await execute('DELETE FROM zones WHERE id = ?', [id]);
  for (const id of created.markers) await execute('DELETE FROM map_markers WHERE id = ?', [id]);
  for (const id of [planMapId, visitMapId]) {
    await execute('DELETE FROM visit_zones WHERE map_id = ?', [id]);
    await execute('DELETE FROM zones WHERE map_id = ?', [id]);
    await execute('DELETE FROM map_markers WHERE map_id = ?', [id]);
    await execute('DELETE FROM maps WHERE id = ?', [id]);
  }
  for (const id of created.groups) {
    await execute('DELETE FROM group_scopes WHERE group_id = ?', [id]);
    await execute('DELETE FROM group_members WHERE group_id = ?', [id]);
    await execute('DELETE FROM `groups` WHERE id = ?', [id]);
  }
  for (const id of created.users) {
    await execute('DELETE FROM user_roles WHERE user_id = ?', [id]);
    await execute('DELETE FROM users WHERE id = ?', [id]);
  }
  for (const snap of snapshots) await restoreSetting(snap);
  invalidateSettingsCache();
});

/** Routes de lieux portant un `map_id`, sondées par la matrice ci-dessous. */
const LOCATION_ROUTES = Object.freeze([
  { path: (mapId) => `/api/zones?map_id=${mapId}`, label: 'GET /api/zones' },
  { path: (mapId) => `/api/map/markers?map_id=${mapId}`, label: 'GET /api/map/markers' },
  { path: (mapId) => `/api/map-categories?map_id=${mapId}`, label: 'GET /api/map-categories' },
]);

test('surface plan : sans code, aucune route de lieux ne répond (S1)', async () => {
  for (const route of LOCATION_ROUTES) {
    const res = await onPlan(request(app).get(route.path(planMapId)));
    assert.equal(res.status, 401, `${route.label} doit refuser sans code`);
    assert.equal(res.body.access_required, true, `${route.label} doit demander le code`);
  }
  // Le catalogue des cartes aussi : il porte le géoréférencement (S6).
  const maps = await onPlan(request(app).get('/api/maps'));
  assert.equal(maps.status, 401);
  // …et le point d'entrée composite, qui lui était déjà gardé — on le re-vérifie pour que la
  // matrice reste complète si un jour il change de garde.
  const content = await onPlan(request(app).get(`/api/plan/content?map_id=${planMapId}`));
  assert.equal(content.status, 401);
});

test('surface plan : avec le bon code, les routes répondent (la garde n’enferme pas dehors)', async () => {
  const access = await onPlan(request(app).post('/api/plan/access'))
    .send({ code: PLAN_CODE })
    .expect(200);
  const cookie = access.headers['set-cookie'];
  assert.ok(cookie, 'le code valide doit poser le laissez-passer');

  for (const route of LOCATION_ROUTES) {
    const res = await onPlan(request(app).get(route.path(planMapId))).set('Cookie', cookie);
    assert.equal(res.status, 200, `${route.label} doit répondre avec le laissez-passer`);
  }
});

test('non-régression S2 : un lieu masqué sur le plan ne sort jamais, quel que soit ?surface=', async () => {
  const access = await onPlan(request(app).post('/api/plan/access'))
    .send({ code: PLAN_CODE })
    .expect(200);
  const cookie = access.headers['set-cookie'];

  // `?surface=` absent, égal, contradictoire : le repère masqué doit rester invisible dans
  // les trois cas. C'est exactement le contournement mesuré le 22/09 (44 repères sans le
  // paramètre, 42 avec `?surface=plan`).
  for (const query of ['', '&surface=plan', '&surface=map', '&surface=staff', '&surface=visit']) {
    const res = await onPlan(request(app).get(`/api/map/markers?map_id=${planMapId}${query}`)).set(
      'Cookie',
      cookie,
    );
    assert.equal(res.status, 200);
    const hidden = res.body.filter((m) => (m.hidden_surfaces || []).includes('plan'));
    assert.equal(hidden.length, 0, `?surface=${query || '(absent)'} laisse sortir un lieu masqué`);
    assert.ok(
      res.body.some((m) => m.label === 'Accueil'),
      'le repère visible doit rester servi',
    );
  }
});

test('non-régression S4 : omettre map_id n’élargit pas la réponse', async () => {
  // Anonyme sur le produit ForêtMap : surface `visit`. La carte du plan n'y est pas déclarée,
  // elle ne doit donc apparaître ni nommément ni dans la liste complète.
  const scoped = await request(app).get(`/api/zones?map_id=${visitMapId}`).expect(200);
  const all = await request(app).get('/api/zones').expect(200);
  const mapsInAll = new Set(all.body.map((z) => z.map_id));
  assert.ok(!mapsInAll.has(planMapId), 'la carte du plan sort de /api/zones sans map_id');
  assert.ok(
    scoped.body.every((z) => z.map_id === visitMapId),
    'une lecture ciblée ne doit rendre que la carte demandée',
  );
});

test('surface visite : la carte réservée au plan est introuvable (S1, lot B)', async () => {
  for (const route of LOCATION_ROUTES) {
    const res = await request(app).get(route.path(planMapId));
    assert.equal(res.status, 400, `${route.label} doit refuser la carte du plan à un anonyme`);
    assert.equal(res.body.error, 'Carte introuvable');
  }
  // `/api/visit/content` avait la fuite la plus large : aucune liste blanche du tout.
  const visitContent = await request(app).get(`/api/visit/content?map_id=${planMapId}`);
  assert.equal(visitContent.status, 400);
  assert.equal(visitContent.body.error, 'Carte introuvable');
});

test('surface visite : les terrains d’apprentissage restent ouverts sans compte', async () => {
  // Le correctif ne doit pas fermer la Visite publique, qui est la raison d'être du produit.
  for (const route of LOCATION_ROUTES) {
    const res = await request(app).get(route.path(visitMapId));
    assert.equal(res.status, 200, `${route.label} doit rester ouverte sur un terrain public`);
  }
  await request(app).get(`/api/visit/content?map_id=${visitMapId}`).expect(200);
});

/**
 * Lecteur connecté **sans** permission de gestion des lieux (profil `personnel`), rattaché
 * facultativement à un groupe dont le périmètre cartes est `scopeMapIds`.
 */
async function createNonManagerToken({ scopeMapIds = null } = {}) {
  const { signAuthToken } = require('../middleware/requireTeacher');
  const { queryOne } = require('../database');
  const { clearMapAccessCache } = require('../lib/mapAccess');
  const role = await queryOne("SELECT id FROM roles WHERE slug = 'personnel' LIMIT 1");
  assert.ok(role?.id, 'rôle personnel requis');
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const userId = `u-visit-${stamp}`;
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, password_hash, display_name, first_name, last_name, is_active)
     VALUES (?, 'student', ?, ?, 'x', 'Lecteur Visite', 'L', 'V', 1)`,
    [userId, `visit.${stamp}@test.local`, `visit_${stamp}`],
  );
  created.users.push(userId);
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1)',
    ['student', userId, role.id],
  );
  await execute('UPDATE users SET assigned_role_id = ? WHERE id = ?', [role.id, userId]);
  if (scopeMapIds) {
    const groupId = `g-visit-${stamp}`;
    await execute(
      "INSERT INTO `groups` (id, slug, name, kind, is_active) VALUES (?, ?, ?, 'class', 1)",
      [groupId, groupId, 'Groupe visite (test)'],
    );
    created.groups.push(groupId);
    await execute(
      "INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student')",
      [groupId, userId],
    );
    for (const mapId of scopeMapIds) {
      await execute('INSERT INTO group_scopes (group_id, map_id) VALUES (?, ?)', [groupId, mapId]);
    }
  }
  clearMapAccessCache();
  return signAuthToken({
    userType: 'student',
    userId,
    canonicalUserId: userId,
    roleId: role.id,
    roleSlug: 'personnel',
    roleDisplayName: 'Personnel',
  });
}

test('visite connectée : une carte listée par /api/maps est lisible en visite', async () => {
  // Régression « Carte introuvable » en mode visite (prof sans classe, complexe déclaré sur le
  // plan) : `/api/maps` listait la carte au compte connecté, `/api/visit/content` la refusait,
  // et la vue gardait les lieux de la carte précédente sur le fond de la nouvelle.
  const token = await createNonManagerToken();
  const bearer = (req) => req.set('Authorization', `Bearer ${token}`);
  const maps = await bearer(request(app).get('/api/maps')).expect(200);
  assert.ok(
    maps.body.some((m) => m.id === planMapId),
    'carte listée au compte connecté',
  );
  const content = await bearer(request(app).get(`/api/visit/content?map_id=${planMapId}`));
  assert.equal(content.status, 200, content.body?.error);
  // L'anonyme, lui, reste dehors (lot B).
  await request(app).get(`/api/visit/content?map_id=${planMapId}`).expect(400);
});

test('visite connectée : le périmètre du compte continue de borner la carte', async () => {
  const token = await createNonManagerToken({ scopeMapIds: [visitMapId] });
  const bearer = (req) => req.set('Authorization', `Bearer ${token}`);
  const maps = await bearer(request(app).get('/api/maps')).expect(200);
  assert.ok(!maps.body.some((m) => m.id === planMapId), 'carte hors périmètre non listée');
  const refused = await bearer(request(app).get(`/api/visit/content?map_id=${planMapId}`));
  assert.equal(refused.status, 400);
  assert.equal(refused.body.error, 'Carte introuvable');
  await bearer(request(app).get(`/api/visit/content?map_id=${visitMapId}`)).expect(200);
});

test('visite connectée sur le produit plan : la liste blanche publique s’applique', async () => {
  // Hors surface de travail, être connecté n'élargit rien : la Visite reste bornée.
  const token = await createNonManagerToken();
  const res = await onPlan(request(app).get(`/api/visit/content?map_id=${planMapId}`)).set(
    'Authorization',
    `Bearer ${token}`,
  );
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Carte introuvable');
});

test('un gestionnaire lit la carte du plan depuis la console ForêtMap', async () => {
  // La garde borne les **surfaces publiques**, pas la gestion : sans cela, l'onglet « Lieux »
  // ne pourrait plus éditer les lieux du plan.
  const res = await asTeacher(request(app).get(`/api/zones?map_id=${planMapId}`)).expect(200);
  assert.ok(res.body.some((z) => z.name === 'Zone du plan'));
  // …y compris les lieux masqués, qu'il doit voir pour les corriger.
  const markers = await asTeacher(request(app).get(`/api/map/markers?map_id=${planMapId}`)).expect(
    200,
  );
  assert.ok(markers.body.some((m) => m.label === 'Infirmerie'));
});

test('géoréférencement : la carte du plan sort du catalogue public (S6)', async () => {
  // S6 visait les ancres lat/lng de `lyautey`, servies anonymement à toutes les surfaces.
  // On ne retire pas le géoréférencement surface par surface — les quatre s'en servent pour
  // se localiser, la Visite comprise : c'est la sortie de la carte du catalogue qui protège.
  const res = await request(app).get('/api/maps').expect(200);
  const ids = res.body.map((m) => m.id);
  assert.ok(!ids.includes(planMapId), 'la carte du plan ne doit pas figurer au catalogue public');
  assert.ok(ids.includes(visitMapId), 'un terrain public doit rester au catalogue');
});

test('la surface ne se choisit pas depuis le client (S3)', async () => {
  // `?surface=` ne peut que rétrécir : demander la surface de gestion depuis un anonyme ne
  // doit pas ouvrir la carte réservée au plan.
  const res = await request(app).get(`/api/zones?map_id=${planMapId}&surface=map`);
  assert.equal(res.status, 400);
  // Une surface inconnue reste un 400 de validation, pas un passe-droit.
  await request(app).get('/api/zones?surface=carte').expect(400);
});
