'use strict';

/**
 * « Signaler un problème ou proposer une correction » depuis le plan des personnels.
 *
 * Le cas central est celui du profil **`personnel`** : c'est le public visé par proflyautey
 * (`lib/rbac.js` lui donne `staff_plan.access` et rien d'autre), et c'est aussi un profil en
 * lecture seule que `routes/context-comments.js` refuse. Le bouton était donc affiché à des
 * gens à qui l'envoi répondait 403. Ces assertions tiennent les deux bouts : l'envoi passe par
 * la porte de cette surface, et le routeur des commentaires de la console reste fermé.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const crypto = require('node:crypto');

const { initSchema, initDatabase, execute, queryOne } = require('../database');
const { app } = require('../server');
const { ensureRbacBootstrap, getRoleBySlug, setPrimaryRole } = require('../lib/rbac');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { setSetting, invalidateSettingsCache } = require('../lib/settings');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');
const fx = require('./helpers/fmFixtures');
const { planContentCache } = require('../routes/plan');

let mapId = '';
let personnelToken = '';
let personnelUserId = '';
let adminToken = '';
const snapshots = [];
const ids = { staffPlace: '', adminOnlyPlace: '', zone: '' };

/** Compte « Personnel » : un agent du lycée, sans aucun droit au-delà du plan. */
async function createPersonnelAccount() {
  const userId = crypto.randomUUID();
  const email = `personnel_${Date.now()}_${Math.floor(Math.random() * 10000)}@ecole.local`;
  await execute(
    `INSERT INTO users
      (id, user_type, email, pseudo, first_name, last_name, display_name, password_hash,
       auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, ?, 'Agent', 'Lyautey', 'Agent Lyautey', 'x', 'local', 1, NOW(), NOW())`,
    [userId, email, `agent_${userId.slice(0, 8)}`],
  );
  const role = await getRoleBySlug('personnel');
  assert.ok(role?.id, 'Profil « personnel » introuvable');
  await setPrimaryRole('teacher', userId, role.id);
  const token = await signAuthToken({ product: 'foret', userType: 'teacher', userId });
  return { userId, token };
}

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  adminToken = await ensureAdminTeacherAuthToken({ elevated: true });

  const map = await fx.createMap({ label: 'Plan signalement de test' });
  mapId = map.id;
  for (const key of ['ui.plan.map_id', 'ui.modules.context_comments_enabled']) {
    snapshots.push(await snapshotSetting(key));
  }
  await setSetting('ui.plan.map_id', mapId, { userType: 'teacher', userId: 'test' });
  invalidateSettingsCache();

  const staffPlace = await fx.createMarker({ mapId, label: 'Porte du gymnase' });
  ids.staffPlace = staffPlace.id;
  const zone = await fx.createZone({ mapId, name: 'Cour intérieure' });
  ids.zone = zone.id;
  const adminOnly = await fx.createMarker({ mapId, label: 'Coffre' });
  ids.adminOnlyPlace = adminOnly.id;
  await execute('UPDATE map_markers SET visible_role_slugs = ? WHERE id = ?', [
    JSON.stringify(['admin']),
    adminOnly.id,
  ]);

  const personnel = await createPersonnelAccount();
  personnelToken = personnel.token;
  personnelUserId = personnel.userId;
});

test.beforeEach(() => {
  planContentCache.clear();
  invalidateSettingsCache();
});

test.after(async () => {
  await execute('DELETE FROM context_comments WHERE author_user_id = ?', [personnelUserId]);
  await execute('DELETE FROM user_roles WHERE user_id = ?', [personnelUserId]);
  await execute('DELETE FROM users WHERE id = ?', [personnelUserId]);
  await execute('DELETE FROM map_markers WHERE map_id = ?', [mapId]);
  await execute('DELETE FROM zones WHERE map_id = ?', [mapId]);
  await execute('DELETE FROM maps WHERE id = ?', [mapId]);
  for (const snap of snapshots) await restoreSetting(snap);
  invalidateSettingsCache();
});

function asPersonnel(req) {
  return req.set('Authorization', `Bearer ${personnelToken}`);
}

test('profil « personnel » : le plan lui annonce le bouton, et l’envoi aboutit', async () => {
  const content = await asPersonnel(request(app).get('/api/staff-plan/content')).expect(200);
  assert.equal(content.body.viewer.via, 'account');
  assert.equal(content.body.viewer.role_slug, 'personnel');
  assert.equal(content.body.viewer.can_report, true);

  const sent = await asPersonnel(request(app).post('/api/staff-plan/report'))
    .send({
      contextType: 'marker',
      contextId: ids.staffPlace,
      body: 'La porte est condamnée depuis la rentrée.',
    })
    .expect(201);
  assert.ok(sent.body.id);
  assert.equal(sent.body.place_label, 'Porte du gymnase');

  const stored = await queryOne(
    'SELECT context_type, context_id, body, author_user_id FROM context_comments WHERE id = ? LIMIT 1',
    [sent.body.id],
  );
  assert.equal(stored.context_type, 'marker');
  assert.equal(stored.context_id, ids.staffPlace);
  assert.equal(stored.author_user_id, personnelUserId);
});

test('une zone se signale aussi, et le message ressort dans le journal des lieux', async () => {
  const sent = await asPersonnel(request(app).post('/api/staff-plan/report'))
    .send({ contextType: 'zone', contextId: ids.zone, body: 'Le portillon ne ferme plus.' })
    .expect(201);

  const recent = await request(app)
    .get('/api/context-comments/recent?limit=50')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const hit = recent.body.items.find((item) => item.id === sent.body.id);
  assert.ok(hit, 'le message déposé depuis le plan sort dans /recent');
  assert.equal(hit.context_type, 'zone');
  assert.equal(hit.place_label, 'Cour intérieure');
  assert.equal(hit.body, 'Le portillon ne ferme plus.');
  assert.ok(hit.author_display_name, 'le journal nomme l’auteur');
  assert.ok(recent.body.total >= 1);
  // Les chemins d'images ne sortent jamais bruts, ici comme sur la liste d'un contexte.
  assert.equal(hit.image_paths_json, undefined);
});

test('le routeur des commentaires de la console reste fermé à un profil lecture seule', async () => {
  const res = await asPersonnel(request(app).post('/api/context-comments'))
    .send({ contextType: 'marker', contextId: ids.staffPlace, body: 'Essai direct' })
    .expect(403);
  assert.match(String(res.body.error || ''), /visiteur ou personnel/);
});

test('lieu hors de portée du lecteur : introuvable, et rien n’est écrit', async () => {
  await asPersonnel(request(app).post('/api/staff-plan/report'))
    .send({ contextType: 'marker', contextId: ids.adminOnlyPlace, body: 'Message indiscret' })
    .expect(404);
  const row = await queryOne('SELECT COUNT(*) AS c FROM context_comments WHERE context_id = ?', [
    ids.adminOnlyPlace,
  ]);
  assert.equal(Number(row.c), 0);
});

test('sans compte : pas de signalement (un porteur de code n’a pas d’identité)', async () => {
  await request(app)
    .post('/api/staff-plan/report')
    .send({ contextType: 'marker', contextId: ids.staffPlace, body: 'Anonyme' })
    .expect(401);
});

test('message vide ou type de lieu inconnu : 400', async () => {
  await asPersonnel(request(app).post('/api/staff-plan/report'))
    .send({ contextType: 'marker', contextId: ids.staffPlace, body: ' ' })
    .expect(400);
  await asPersonnel(request(app).post('/api/staff-plan/report'))
    .send({ contextType: 'task', contextId: ids.staffPlace, body: 'Hors périmètre' })
    .expect(400);
});

test('module commentaires éteint : bouton retiré et envoi refusé', async () => {
  await setSetting('ui.modules.context_comments_enabled', false, {
    userType: 'teacher',
    userId: 'test',
  });
  invalidateSettingsCache();
  try {
    const content = await asPersonnel(request(app).get('/api/staff-plan/content')).expect(200);
    assert.equal(content.body.viewer.can_report, false);
    await asPersonnel(request(app).post('/api/staff-plan/report'))
      .send({ contextType: 'marker', contextId: ids.staffPlace, body: 'Module éteint' })
      .expect(503);
  } finally {
    await setSetting('ui.modules.context_comments_enabled', true, {
      userType: 'teacher',
      userId: 'test',
    });
    invalidateSettingsCache();
  }
});

test('journal des lieux : réservé aux comptes qui ouvrent la console', async () => {
  await asPersonnel(request(app).get('/api/context-comments/recent')).expect(403);
  await request(app).get('/api/context-comments/recent').expect(401);
});
