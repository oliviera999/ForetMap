'use strict';

/**
 * Périmètre cartes de bout en bout : ce qu'un élève borné par son groupe (ou par son
 * affiliation) voit et ne voit plus, et ce qui reste délibérément non borné — lecture sans
 * session (visite publique) et comptes profs.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const crypto = require('node:crypto');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { clearMapAccessCache } = require('../lib/mapAccess');
const { invalidateMapsListCache } = require('../routes/maps');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

const stamp = Date.now();
const MAP_IN = `scope-in-${stamp}`;
const MAP_OUT = `scope-out-${stamp}`;
const ZONE_IN = `zone-in-${stamp}`;
const ZONE_OUT = `zone-out-${stamp}`;
const MARKER_OUT = `marker-out-${stamp}`;

/** Élève novice (aucune permission prof) rattaché à `groupId`, avec l'affiliation demandée. */
async function createStudent({ affiliation = 'both', groupId = null } = {}) {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO users
      (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name,
       affiliation, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', NULL, NULL, NULL, 'Scope', ?, ?, ?, NULL, 'local', 1, NOW(), NOW())`,
    [id, `Eleve${stamp}`, `Scope Eleve${stamp}`, affiliation],
  );
  const role = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_novice' LIMIT 1");
  assert.ok(role?.id);
  await execute(
    `INSERT INTO user_roles (user_type, user_id, role_id, is_primary)
     VALUES ('student', ?, ?, 1)
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), is_primary = 1`,
    [id, role.id],
  );
  if (groupId) {
    await execute(
      `INSERT INTO group_members (group_id, user_id, user_type, role_in_group)
       VALUES (?, ?, 'student', 'member')
       ON DUPLICATE KEY UPDATE role_in_group = 'member'`,
      [groupId, id],
    );
  }
  clearMapAccessCache();
  const token = await signAuthToken({
    product: 'foret',
    userType: 'student',
    userId: id,
    roleSlug: 'eleve_novice',
    permissions: [],
  });
  return { id, token };
}

let groupId;
let adminToken;

test.before(async () => {
  await initSchema();
  adminToken = await ensureAdminTeacherAuthToken({ elevated: true });

  await execute(
    'INSERT INTO maps (id, label, map_image_url, sort_order, is_active) VALUES (?, ?, NULL, 900, 1), (?, ?, NULL, 901, 1)',
    [MAP_IN, `Périmètre dedans ${stamp}`, MAP_OUT, `Périmètre dehors ${stamp}`],
  );
  await execute('INSERT INTO zones (id, map_id, name) VALUES (?, ?, ?), (?, ?, ?)', [
    ZONE_IN,
    MAP_IN,
    `Zone dedans ${stamp}`,
    ZONE_OUT,
    MAP_OUT,
    `Zone dehors ${stamp}`,
  ]);
  await execute(
    'INSERT INTO map_markers (id, map_id, x_pct, y_pct, label, created_at) VALUES (?, ?, 10, 10, ?, ?)',
    [MARKER_OUT, MAP_OUT, `Repère dehors ${stamp}`, new Date()],
  );

  groupId = `grp-scope-${stamp}`;
  await execute(
    "INSERT INTO `groups` (id, slug, name, kind, is_active) VALUES (?, ?, ?, 'class', 1)",
    [groupId, `grp-scope-${stamp}`, `Classe périmètre ${stamp}`],
  );
  await execute('INSERT INTO group_scopes (group_id, map_id, project_id) VALUES (?, ?, NULL)', [
    groupId,
    MAP_IN,
  ]);

  invalidateMapsListCache();
  clearMapAccessCache();
});

test.after(async () => {
  await execute('DELETE FROM group_scopes WHERE group_id = ?', [groupId]);
  await execute('DELETE FROM group_members WHERE group_id = ?', [groupId]);
  await execute('DELETE FROM `groups` WHERE id = ?', [groupId]);
  await execute('DELETE FROM map_markers WHERE map_id IN (?, ?)', [MAP_IN, MAP_OUT]);
  await execute('DELETE FROM zones WHERE map_id IN (?, ?)', [MAP_IN, MAP_OUT]);
  await execute('DELETE FROM users WHERE first_name = ? AND last_name = ?', [
    'Scope',
    `Eleve${stamp}`,
  ]);
  await execute('DELETE FROM maps WHERE id IN (?, ?)', [MAP_IN, MAP_OUT]);
  invalidateMapsListCache();
  clearMapAccessCache();
});

test('Périmètre cartes: GET /api/maps ne renvoie que les cartes du groupe', async () => {
  const student = await createStudent({ groupId });
  const res = await request(app)
    .get('/api/maps')
    .set('Authorization', `Bearer ${student.token}`)
    .expect(200);
  const ids = res.body.map((m) => m.id);
  assert.ok(ids.includes(MAP_IN), 'la carte du périmètre doit rester visible');
  assert.ok(!ids.includes(MAP_OUT), 'la carte hors périmètre doit disparaître');
});

test('Périmètre cartes: prof et lecture anonyme ne sont pas bornés', async () => {
  const teacher = await request(app)
    .get('/api/maps')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const teacherIds = teacher.body.map((m) => m.id);
  assert.ok(teacherIds.includes(MAP_IN) && teacherIds.includes(MAP_OUT));

  const anonymous = await request(app).get('/api/maps').expect(200);
  const anonymousIds = anonymous.body.map((m) => m.id);
  assert.ok(anonymousIds.includes(MAP_IN) && anonymousIds.includes(MAP_OUT));
});

test("Périmètre cartes: un élève sans groupe ni affiliation n'est pas borné", async () => {
  const student = await createStudent({});
  const res = await request(app)
    .get('/api/maps')
    .set('Authorization', `Bearer ${student.token}`)
    .expect(200);
  const ids = res.body.map((m) => m.id);
  assert.ok(ids.includes(MAP_IN) && ids.includes(MAP_OUT));
});

test("Périmètre cartes: l'affiliation borne aussi côté serveur", async () => {
  const student = await createStudent({ affiliation: MAP_IN });
  const res = await request(app)
    .get('/api/maps')
    .set('Authorization', `Bearer ${student.token}`)
    .expect(200);
  const ids = res.body.map((m) => m.id);
  assert.deepStrictEqual(ids, [MAP_IN]);
});

test('Périmètre cartes: les zones hors périmètre sont refusées et masquées', async () => {
  const student = await createStudent({ groupId });
  const auth = { Authorization: `Bearer ${student.token}` };

  await request(app).get(`/api/zones?map_id=${MAP_IN}`).set(auth).expect(200);

  const refused = await request(app).get(`/api/zones?map_id=${MAP_OUT}`).set(auth).expect(403);
  assert.strictEqual(refused.body.code, 'MAP_OUT_OF_SCOPE');

  // Sans `map_id`, la liste complète est ramenée au périmètre : la garde ne doit pas
  // tenir à la présence du paramètre.
  const list = await request(app).get('/api/zones').set(auth).expect(200);
  const zoneIds = list.body.map((z) => z.id);
  assert.ok(zoneIds.includes(ZONE_IN));
  assert.ok(!zoneIds.includes(ZONE_OUT));

  // Accès direct par identifiant : la carte est relue en base.
  await request(app).get(`/api/zones/${ZONE_IN}`).set(auth).expect(200);
  const detail = await request(app).get(`/api/zones/${ZONE_OUT}`).set(auth).expect(403);
  assert.strictEqual(detail.body.code, 'MAP_OUT_OF_SCOPE');

  // La visite publique (sans session) garde l'accès complet.
  await request(app).get(`/api/zones/${ZONE_OUT}`).expect(200);
});

test('Périmètre cartes: les repères hors périmètre sont refusés et masqués', async () => {
  const student = await createStudent({ groupId });
  const auth = { Authorization: `Bearer ${student.token}` };

  const refused = await request(app)
    .get(`/api/map/markers?map_id=${MAP_OUT}`)
    .set(auth)
    .expect(403);
  assert.strictEqual(refused.body.code, 'MAP_OUT_OF_SCOPE');

  const list = await request(app).get('/api/map/markers').set(auth).expect(200);
  assert.ok(!list.body.map((m) => m.id).includes(MARKER_OUT));
});
