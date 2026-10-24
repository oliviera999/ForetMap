'use strict';

/**
 * Compléments réservés (`location_notes`) et routes d'écriture de la **Visite**.
 *
 * La permission `visit.manage` gère la couche Visite (textes, ordre, photos) ; elle ne suffit
 * pas à **lire ni réécrire** les compléments réservés d'un lieu. Ceux-ci restent l'affaire de
 * qui gère le lieu sur la carte : `zones.manage` pour une zone, `map.manage_markers` pour un
 * repère. Les lecteurs légitimes par audience (rôle ou groupe visé par la note) gardent leur
 * lecture.
 *
 * Les profils livrés (administrateur, n3boss) portent les trois permissions : seuls les
 * profils sur mesure sont concernés, d'où les profils de test ci-dessous.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const crypto = require('node:crypto');

const { initSchema, initDatabase, queryOne, queryAll, execute } = require('../database');
const { app } = require('../server');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { visitContentCache } = require('../routes/visit');
const fx = require('./helpers/fmFixtures');

const stamp = `${Date.now()}`.slice(-7);
const SECRET_STAFF = `CONSIGNE_PERSONNEL_${stamp}`;
const SECRET_FRAME = `CONSIGNE_ENCADREMENT_${stamp}`;
const SECRET_GROUP = `CONSIGNE_GROUPE_${stamp}`;

const POLYGON = [
  { xp: 10, yp: 10 },
  { xp: 40, yp: 10 },
  { xp: 40, yp: 40 },
];

/** Profils sur mesure : la Visite seule, ou avec la gestion d'un type de lieu. */
const PROFILES = Object.freeze({
  visitOnly: { slug: `visit_only_${stamp}`, permissions: ['visit.manage'] },
  visitZones: { slug: `visit_zones_${stamp}`, permissions: ['visit.manage', 'zones.manage'] },
  visitMarkers: {
    slug: `visit_markers_${stamp}`,
    permissions: ['visit.manage', 'map.manage_markers'],
  },
});

let adminToken;
let mapId;
let groupId;
let zoneId;
let markerId;
const tokens = {};
const createdUserIds = [];
const createdRoleIds = [];

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

async function createProfileUser(profile, { inGroup = false } = {}) {
  await execute(
    `INSERT INTO roles (slug, display_name, emoji, min_done_tasks, display_order, \`rank\`, is_system)
     VALUES (?, ?, '🧪', 0, 9990, 360, 0)`,
    [profile.slug, `Test ${profile.slug}`],
  );
  const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [profile.slug]);
  createdRoleIds.push(role.id);
  for (const key of profile.permissions) {
    await execute('INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)', [
      role.id,
      key,
    ]);
  }
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO users
      (id, user_type, email, first_name, last_name, display_name, auth_provider, is_active,
       assigned_role_id, created_at, updated_at)
     VALUES (?, 'teacher', ?, 'Profil', ?, ?, 'local', 1, ?, NOW(), NOW())`,
    [id, `${profile.slug}@example.test`, profile.slug, `Profil ${profile.slug}`, role.id],
  );
  createdUserIds.push(id);
  await execute(
    `INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES ('teacher', ?, ?, 1)`,
    [id, role.id],
  );
  if (inGroup) {
    await execute(
      "INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'teacher')",
      [groupId, id],
    );
  }
  return signAuthToken({
    product: 'foret',
    userType: 'teacher',
    userId: id,
    canonicalUserId: id,
    roleId: role.id,
    roleSlug: profile.slug,
  });
}

/** Trois compléments : un pour les personnels, un pour l'encadrement (défaut), un de groupe. */
function notesPayload(suffix = '') {
  return [
    { title: 'Personnels', body: `${SECRET_STAFF}${suffix}`, audience_role_slugs: ['personnel'] },
    { title: 'Encadrement', body: `${SECRET_FRAME}${suffix}` },
    { title: 'Groupe', body: `${SECRET_GROUP}${suffix}`, audience_group_ids: [groupId] },
  ];
}

async function storedNoteBodies(kind, id) {
  const rows = await queryAll(
    'SELECT body FROM location_notes WHERE location_kind = ? AND location_id = ? ORDER BY sort_order',
    [kind, id],
  );
  return rows.map((r) => r.body);
}

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  adminToken = await ensureAdminTeacherAuthToken({ elevated: true });
  mapId = (await fx.createMap({ label: 'Carte compléments Visite' })).id;
  groupId = crypto.randomUUID();
  await execute(
    "INSERT INTO `groups` (id, slug, name, kind, is_active) VALUES (?, ?, ?, 'class', 1)",
    [groupId, `visit-notes-${stamp}`, `Groupe compléments ${stamp}`],
  );
  tokens.visitOnly = await createProfileUser(PROFILES.visitOnly, { inGroup: true });
  tokens.visitZones = await createProfileUser(PROFILES.visitZones);
  tokens.visitMarkers = await createProfileUser(PROFILES.visitMarkers);

  const zone = await request(app)
    .post('/api/zones')
    .set(bearer(adminToken))
    .send({ name: `Local ${stamp}`, points: POLYGON, map_id: mapId, notes: notesPayload() })
    .expect(201);
  zoneId = zone.body.id;
  const marker = await request(app)
    .post('/api/map/markers')
    .set(bearer(adminToken))
    .send({ label: `Vanne ${stamp}`, x_pct: 20, y_pct: 30, map_id: mapId, notes: notesPayload() })
    .expect(201);
  markerId = marker.body.id;
  await request(app)
    .post('/api/visit/sync')
    .set(bearer(adminToken))
    .send({ map_id: mapId, direction: 'map_to_visit', zone_ids: [zoneId], marker_ids: [markerId] })
    .expect(200);
});

test.beforeEach(() => {
  if (visitContentCache && typeof visitContentCache.clear === 'function') visitContentCache.clear();
});

test.after(async () => {
  await execute('DELETE FROM location_notes WHERE location_id IN (?, ?)', [zoneId, markerId]);
  await execute('DELETE FROM visit_zones WHERE map_id = ?', [mapId]);
  await execute('DELETE FROM visit_markers WHERE map_id = ?', [mapId]);
  await execute('DELETE FROM zones WHERE map_id = ?', [mapId]);
  await execute('DELETE FROM map_markers WHERE map_id = ?', [mapId]);
  await execute('DELETE FROM maps WHERE id = ?', [mapId]);
  for (const id of createdUserIds) {
    await execute('DELETE FROM group_members WHERE user_id = ?', [id]);
    await execute('DELETE FROM user_roles WHERE user_id = ?', [id]);
    await execute('DELETE FROM users WHERE id = ?', [id]);
  }
  for (const id of createdRoleIds) {
    await execute('DELETE FROM role_permissions WHERE role_id = ?', [id]);
    await execute('DELETE FROM roles WHERE id = ?', [id]);
  }
  await execute('DELETE FROM `groups` WHERE id = ?', [groupId]);
});

test('visit.manage seul : réécrire les compléments d’une zone ou d’un repère est refusé', async () => {
  for (const [kind, id, path] of [
    ['zone', zoneId, `/api/visit/zones/${zoneId}`],
    ['marker', markerId, `/api/visit/markers/${markerId}`],
  ]) {
    const before = await storedNoteBodies(kind, id);
    const res = await request(app)
      .put(path)
      .set(bearer(tokens.visitOnly))
      .send({ notes: [{ title: 'Remplacé', body: 'Texte de remplacement' }] });
    assert.equal(res.status, 403, `${kind} : écriture refusée`);
    assert.deepEqual(await storedNoteBodies(kind, id), before, `${kind} : compléments intacts`);
    // Vider les compléments n'est pas plus permis.
    const cleared = await request(app).put(path).set(bearer(tokens.visitOnly)).send({ notes: [] });
    assert.equal(cleared.status, 403);
    assert.equal((await storedNoteBodies(kind, id)).length, 3);
  }
  // Créer un lieu de Visite avec des compléments : refusé avant toute écriture.
  const created = await request(app)
    .post('/api/visit/zones')
    .set(bearer(tokens.visitOnly))
    .send({
      map_id: mapId,
      name: `Interdit ${stamp}`,
      points: POLYGON,
      notes: [{ body: 'Texte' }],
    });
  assert.equal(created.status, 403);
  const leftover = await queryOne('SELECT id FROM zones WHERE name = ? LIMIT 1', [
    `Interdit ${stamp}`,
  ]);
  assert.ok(!leftover, 'aucun lieu créé');
});

test('visit.manage seul : la réponse ne livre que les compléments de son audience', async () => {
  for (const path of [`/api/visit/zones/${zoneId}`, `/api/visit/markers/${markerId}`]) {
    // Une écriture Visite ordinaire (sans `notes`) reste permise…
    const res = await request(app)
      .put(path)
      .set(bearer(tokens.visitOnly))
      .send({ subtitle: `Sous-titre ${stamp}` })
      .expect(200);
    // …mais sa réponse ne vaut pas lecture de tous les compléments.
    const bodies = (res.body.notes || []).map((n) => n.body);
    assert.ok(!bodies.includes(SECRET_STAFF), 'complément des personnels : hors audience');
    assert.ok(!bodies.includes(SECRET_FRAME), 'complément de l’encadrement : hors audience');
    // Lecteur légitime : membre du groupe visé, il garde ce complément-là…
    assert.deepEqual(bodies, [SECRET_GROUP]);
    // …sans la cartographie des audiences, réservée aux gestionnaires du lieu.
    assert.equal(res.body.notes[0].audience_role_slugs, undefined);
    assert.equal(res.body.notes[0].audience_group_ids, undefined);
  }
});

test('gestion d’un type de lieu : zones.manage pour une zone, map.manage_markers pour un repère', async () => {
  // Zone : `zones.manage` suffit, la réponse rend tous les compléments, audiences comprises.
  const zone = await request(app)
    .put(`/api/visit/zones/${zoneId}`)
    .set(bearer(tokens.visitZones))
    .send({ notes: notesPayload('_Z2') })
    .expect(200);
  assert.deepEqual(
    zone.body.notes.map((n) => n.body),
    [`${SECRET_STAFF}_Z2`, `${SECRET_FRAME}_Z2`, `${SECRET_GROUP}_Z2`],
  );
  assert.deepEqual(zone.body.notes[0].audience_role_slugs, ['personnel']);
  // Mais `zones.manage` ne gère pas les repères.
  const markerRefused = await request(app)
    .put(`/api/visit/markers/${markerId}`)
    .set(bearer(tokens.visitZones))
    .send({ notes: notesPayload('_X') });
  assert.equal(markerRefused.status, 403);

  // Repère : `map.manage_markers` suffit…
  const marker = await request(app)
    .put(`/api/visit/markers/${markerId}`)
    .set(bearer(tokens.visitMarkers))
    .send({ notes: notesPayload('_M2') })
    .expect(200);
  assert.equal(marker.body.notes.length, 3);
  // …et ne gère pas les zones : réécriture refusée, réponse sans les compléments réservés.
  const zoneRefused = await request(app)
    .put(`/api/visit/zones/${zoneId}`)
    .set(bearer(tokens.visitMarkers))
    .send({ notes: notesPayload('_X') });
  assert.equal(zoneRefused.status, 403);
  const zoneRead = await request(app)
    .put(`/api/visit/zones/${zoneId}`)
    .set(bearer(tokens.visitMarkers))
    .send({ subtitle: 'Lecture' })
    .expect(200);
  assert.deepEqual(zoneRead.body.notes, []);
  assert.deepEqual(await storedNoteBodies('zone', zoneId), [
    `${SECRET_STAFF}_Z2`,
    `${SECRET_FRAME}_Z2`,
    `${SECRET_GROUP}_Z2`,
  ]);
});

test('administrateur (profil livré) : lecture et écriture inchangées', async () => {
  const res = await request(app)
    .put(`/api/visit/zones/${zoneId}`)
    .set(bearer(adminToken))
    .send({ notes: notesPayload('_A') })
    .expect(200);
  assert.equal(res.body.notes.length, 3);
  assert.deepEqual(res.body.notes[1].audience_role_slugs, []);
});

test('canViewLocationNote : avec le type de lieu, seule la permission de ce type ouvre tout', () => {
  const {
    canManageLocationNotes,
    canViewLocationNote,
    projectLocationNotesForViewer,
  } = require('../lib/locationAudience');
  const note = { body: 'Consigne', audience_role_slugs: ['personnel'], audience_group_ids: [] };
  const markersOnly = { roleSlug: 'profil_maison', permissions: ['map.manage_markers'] };
  const visitOnly = { roleSlug: 'profil_maison', permissions: ['visit.manage'] };
  assert.equal(canManageLocationNotes(markersOnly, 'marker'), true);
  assert.equal(canManageLocationNotes(markersOnly, 'zone'), false);
  assert.equal(canManageLocationNotes(visitOnly, 'zone'), false);
  assert.equal(canManageLocationNotes(visitOnly, 'marker'), false);
  assert.equal(canViewLocationNote(note, markersOnly, { kind: 'zone' }), false);
  assert.equal(canViewLocationNote(note, markersOnly, { kind: 'marker' }), true);
  // Sans type (surfaces qui mêlent zones et repères) : règle historique inchangée.
  assert.equal(canViewLocationNote(note, markersOnly), true);
  // Lecteur visé par l'audience : il lit, quel que soit le type.
  const staff = { roleSlug: 'personnel', permissions: [] };
  assert.equal(canViewLocationNote(note, staff, { kind: 'zone' }), true);
  assert.deepEqual(projectLocationNotesForViewer([note], staff, { kind: 'zone' }), [
    { body: 'Consigne' },
  ]);
});
