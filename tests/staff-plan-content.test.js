'use strict';

/**
 * Plan des personnels (proflyautey, surface `staff`) : porte d'entrée, filtrage par rôle et
 * étanchéité vis-à-vis du plan public.
 *
 * Ces assertions sont le filet de sécurité du produit : elles vérifient qu'un lieu retiré du
 * plan public y reste retiré, qu'un complément confidentiel ne sort que pour qui y a droit, et
 * qu'un porteur de code — qui n'a pas de compte — ne voit pas ce qui est réservé à
 * l'encadrement.
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
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');
const fx = require('./helpers/fmFixtures');
const { planContentCache } = require('../routes/plan');

let teacherToken;
let mapId;
const snapshots = [];

/** Lieux de la campagne, posés une fois pour toutes en `before`. */
const ids = {
  publicPlace: '',
  staffOnlyPlace: '',
  adminOnlyPlace: '',
  category: '',
};

function auth(req) {
  return req.set('Authorization', `Bearer ${teacherToken}`);
}

/** Valeur brute d'un `Set-Cookie` de la réponse, pour la rejouer sur la requête suivante. */
function cookieFrom(res, name) {
  const raw = [].concat(res.headers['set-cookie'] || []);
  const hit = raw.find((c) => c.startsWith(`${name}=`));
  return hit ? hit.split(';')[0] : '';
}

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  teacherToken = await ensureAdminTeacherAuthToken({ elevated: true });
  const map = await fx.createMap({ label: 'Plan personnels de test' });
  mapId = map.id;

  for (const key of [
    'ui.plan.map_id',
    'ui.staff_plan.access_mode',
    'security.staff_plan_access_code_hash',
    'ui.staff_plan.code_role_slug',
  ]) {
    snapshots.push(await snapshotSetting(key));
  }
  await setSetting('ui.plan.map_id', mapId, { userType: 'teacher', userId: 'test' });
  invalidateSettingsCache();

  // Un repère ordinaire : visible partout.
  const publicPlace = await fx.createMarker({ mapId, label: 'Accueil' });
  ids.publicPlace = publicPlace.id;

  // Un repère retiré du plan public mais gardé côté personnels : le cas d'usage central.
  const staffOnly = await fx.createMarker({
    mapId,
    label: 'Local technique',
    hiddenSurfaces: ['plan'],
    note: 'Chaufferie',
  });
  ids.staffOnlyPlace = staffOnly.id;
  await execute('UPDATE map_markers SET restricted_note = ? WHERE id = ?', [
    'Clé au bureau des agents.',
    staffOnly.id,
  ]);

  // Un repère réservé à l'encadrement : même un personnel authentifié ne doit pas le voir.
  const adminOnly = await fx.createMarker({ mapId, label: 'Coffre' });
  ids.adminOnlyPlace = adminOnly.id;
  await execute('UPDATE map_markers SET visible_role_slugs = ? WHERE id = ?', [
    JSON.stringify(['admin']),
    adminOnly.id,
  ]);

  const category = await fx.createLocationCategory({
    mapId,
    label: 'Bâtiments',
    surfaces: ['map', 'visit', 'plan', 'staff'],
    markerIds: [ids.publicPlace, ids.staffOnlyPlace, ids.adminOnlyPlace],
  });
  ids.category = category.id;
});

test.beforeEach(async () => {
  teacherToken = await ensureAdminTeacherAuthToken({ elevated: true });
  planContentCache.clear();
  invalidateSettingsCache();
});

test.after(async () => {
  await execute('DELETE FROM map_markers WHERE map_id = ?', [mapId]);
  await execute('DELETE FROM location_categories WHERE map_id = ?', [mapId]);
  await execute('DELETE FROM maps WHERE id = ?', [mapId]);
  for (const snap of snapshots) await restoreSetting(snap);
  invalidateSettingsCache();
});

test('sans compte ni code : 401 auth_required, et le code n’est pas proposé par défaut', async () => {
  const res = await request(app).get('/api/staff-plan/content').expect(401);
  assert.equal(res.body.auth_required, true);
  // `ui.staff_plan.access_mode` vaut `disabled` à la livraison : la feature existe, éteinte.
  assert.equal(res.body.code_available, false);
  assert.match(res.headers['cache-control'], /no-store/);
  assert.match(String(res.headers['x-robots-tag'] || ''), /noindex/);
});

test('entrée par code refusée tant qu’un administrateur ne l’a pas activée', async () => {
  await request(app).post('/api/staff-plan/access').send({ code: 'peu-importe' }).expect(403);
});

test('compte autorisé : voit les lieux retirés du plan public et leur complément réservé', async () => {
  const res = await auth(request(app).get('/api/staff-plan/content')).expect(200);
  const labels = res.body.markers.map((m) => m.label);
  assert.ok(labels.includes('Accueil'));
  assert.ok(labels.includes('Local technique'), 'le lieu masqué sur le plan public sort ici');

  const staffPlace = res.body.markers.find((m) => m.id === ids.staffOnlyPlace);
  assert.equal(staffPlace.restricted_note, 'Clé au bureau des agents.');

  assert.equal(res.body.viewer.via, 'account');
  assert.equal(res.body.viewer.can_report, true);
  assert.match(res.headers['cache-control'], /private/);
  assert.match(res.headers['cache-control'], /no-store/);
});

test('le plan public ignore tout de la surface personnels', async () => {
  const res = await request(app).get('/api/plan/content').expect(200);
  const labels = res.body.markers.map((m) => m.label);
  assert.ok(labels.includes('Accueil'));
  assert.ok(!labels.includes('Local technique'), 'lieu masqué sur `plan` : jamais servi ici');
  assert.ok(!labels.includes('Coffre'), 'lieu réservé à l’admin : jamais servi au public');
  // Aucun complément confidentiel ne doit fuir dans la charge publique, sur aucun lieu.
  assert.ok(res.body.markers.every((m) => m.restricted_note === undefined));
  // Et rien de la charge publique ne porte la trace d'un lecteur.
  assert.equal(res.body.viewer, undefined);
});

test('porteur de code : entre, mais ne voit pas ce qui est réservé à l’encadrement', async () => {
  await setSetting('ui.staff_plan.access_mode', 'code', { userType: 'teacher', userId: 'test' });
  await request(app)
    .post('/api/settings/admin/staff-plan-access-code')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ code: 'code-de-test-1234' })
    .expect(200);
  invalidateSettingsCache();

  // Le code est désormais proposé sur l'écran d'entrée.
  const closed = await request(app).get('/api/staff-plan/content').expect(401);
  assert.equal(closed.body.code_available, true);

  await request(app).post('/api/staff-plan/access').send({ code: 'mauvais' }).expect(401);

  const granted = await request(app)
    .post('/api/staff-plan/access')
    .send({ code: 'code-de-test-1234' })
    .expect(200);
  assert.equal(granted.body.role_slug, 'personnel');
  const pass = cookieFrom(granted, 'staff_plan_access');
  assert.ok(pass, 'un laissez-passer signé est posé');

  const res = await request(app).get('/api/staff-plan/content').set('Cookie', pass).expect(200);
  assert.equal(res.body.viewer.via, 'code');
  assert.equal(res.body.viewer.role_slug, 'personnel');
  const labels = res.body.markers.map((m) => m.label);
  assert.ok(labels.includes('Local technique'), 'le porteur de code voit la surface personnels');
  assert.ok(
    !labels.includes('Coffre'),
    'un lieu réservé au profil admin reste hors de portée d’un porteur de code',
  );
  // Sans compte : ni édition, ni signalement (les commentaires exigent une identité).
  assert.equal(res.body.viewer.can_edit_locations, false);
  assert.equal(res.body.viewer.can_report, false);
  // Le complément par défaut vise l'encadrement : un `personnel` ne l'obtient pas.
  const staffPlace = res.body.markers.find((m) => m.id === ids.staffOnlyPlace);
  assert.equal(staffPlace.restricted_note, undefined);
});

test('laissez-passer forgé : signature invalide, porte fermée', async () => {
  await setSetting('ui.staff_plan.access_mode', 'code', { userType: 'teacher', userId: 'test' });
  invalidateSettingsCache();
  const res = await request(app)
    .get('/api/staff-plan/content')
    .set('Cookie', 'staff_plan_access=ok.signature-inventee')
    .expect(401);
  assert.equal(res.body.auth_required, true);
});
