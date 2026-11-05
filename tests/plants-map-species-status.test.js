'use strict';

/**
 * `PATCH /api/plants/:id/map-species/:mapId` — statut d'une espèce au registre d'une carte
 * (lot D3 du connecteur) : droits champ par champ, valeurs contrôlées contre les ENUM de
 * `map_species`, 404 sans ligne, garde contre la rétrogradation de `confirme_site`, journal.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { initSchema, queryOne, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { buildSessionPayload } = require('../lib/auth/sessionPayload');
const { setAssignedRole, recomputeUserRole } = require('../lib/effectiveRole');
const fm = require('./helpers/fmFixtures');

const { app } = require('../server');

const U = crypto.randomUUID().slice(0, 8);
const created = { users: [], roles: [], plants: [], maps: [] };

async function accountWithRole(roleId) {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO users (id, user_type, email, first_name, last_name, display_name, password_hash,
                        auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, 'Registre', ?, ?, 'x', 'local', 1, NOW(), NOW())`,
    [id, `registre.${U}.${created.users.length}@example.test`, U, `Registre ${U}`],
  );
  created.users.push(id);
  await setAssignedRole(id, roleId);
  await recomputeUserRole(id);
  const session = await buildSessionPayload('teacher', id);
  return { id, token: await signAuthToken(session.tokenPayload) };
}

async function roleWith(slug, permissions) {
  const res = await execute(
    'INSERT INTO roles (slug, display_name, `rank`, is_system) VALUES (?, ?, 350, 0)',
    [`${slug}_${U}`, `Registre ${slug} ${U}`],
  );
  created.roles.push(res.insertId);
  for (const key of permissions) {
    await execute('INSERT INTO role_permissions (role_id, permission_key) VALUES (?, ?)', [
      res.insertId,
      key,
    ]);
  }
  return res.insertId;
}

let manager;
let validator;
let nobody;
let plant;
let map;

test.before(async () => {
  await initSchema();
  manager = await accountWithRole(await roleWith('gestion', ['plants.manage']));
  validator = await accountWithRole(await roleWith('valid', ['observations.validate']));
  nobody = await accountWithRole(await roleWith('rien', ['stats.read.group']));
  plant = await fm.createPlant({ name: `Registre ${U}` });
  created.plants.push(plant.id);
  map = await fm.createMap({ id: `reg${U}`.slice(0, 32) });
  created.maps.push(map.id);
  await execute('INSERT INTO map_species (map_id, plant_id) VALUES (?, ?)', [map.id, plant.id]);
});

test.after(async () => {
  await execute(
    "DELETE FROM audit_log WHERE action = 'update_map_species_status' AND target_id LIKE ?",
    [`${map.id}:%`],
  );
  for (const id of created.plants) await execute('DELETE FROM plants WHERE id = ?', [id]);
  for (const id of created.maps) await execute('DELETE FROM maps WHERE id = ?', [id]);
  for (const id of created.users) {
    await execute('DELETE FROM user_roles WHERE user_id = ?', [id]);
    await execute('DELETE FROM users WHERE id = ?', [id]);
  }
  for (const id of created.roles) {
    await execute('DELETE FROM role_permissions WHERE role_id = ?', [id]);
    await execute('DELETE FROM roles WHERE id = ?', [id]);
  }
});

function patch(token, body, plantId = plant.id, mapId = map.id) {
  return request(app)
    .patch(`/api/plants/${plantId}/map-species/${mapId}`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

test('droits : sans permission → 403 ; le validateur ne touche pas à la présence', async () => {
  await patch(nobody.token, { validation_status: 'a_confirmer' }).expect(403);
  await patch(validator.token, { presence_status: 'resident' }).expect(403);
  await request(app)
    .patch(`/api/plants/${plant.id}/map-species/${map.id}`)
    .send({ validation_status: 'attendu' })
    .expect(401);
});

test('valeurs contrôlées, corps vide refusé, ligne absente → 404', async () => {
  const bad = await patch(manager.token, { presence_status: 'sedentaire' }).expect(400);
  assert.match(bad.body.error, /presence_status invalide/);
  await patch(manager.token, { validation_status: null }).expect(400);
  await patch(manager.token, {}).expect(400);
  const other = await fm.createPlant({ name: `Hors registre ${U}` });
  created.plants.push(other.id);
  const missing = await patch(manager.token, { validation_status: 'attendu' }, other.id).expect(
    404,
  );
  assert.match(missing.body.error, /registre/);
  assert.equal(
    await queryOne('SELECT 1 AS x FROM map_species WHERE plant_id = ? AND map_id = ?', [
      other.id,
      map.id,
    ]),
    undefined,
    'jamais de création de ligne',
  );
});

test('présence et certitude écrites, journalisées ; confirmation → première mention', async () => {
  const res = await patch(manager.token, { presence_status: 'hivernant' }).expect(200);
  assert.equal(res.body.presence_status, 'hivernant');
  assert.equal(res.body.validation_status, 'attendu');

  const v = await patch(validator.token, { validation_status: 'confirme_site' }).expect(200);
  assert.equal(v.body.validation_status, 'confirme_site');
  const row = await queryOne(
    'SELECT presence_status, validation_status, first_record_at, first_record_by FROM map_species WHERE plant_id = ? AND map_id = ?',
    [plant.id, map.id],
  );
  assert.equal(row.presence_status, 'hivernant');
  assert.equal(row.validation_status, 'confirme_site');
  assert.ok(row.first_record_at, 'première mention datée');
  assert.equal(row.first_record_by, validator.id);

  const audit = await queryOne(
    "SELECT payload_json FROM audit_log WHERE action = 'update_map_species_status' AND target_id = ? ORDER BY id DESC LIMIT 1",
    [`${map.id}:${plant.id}`],
  );
  const payload =
    typeof audit.payload_json === 'string' ? JSON.parse(audit.payload_json) : audit.payload_json;
  assert.equal(payload.before.validation_status, 'attendu');
  assert.equal(payload.after.validation_status, 'confirme_site');

  // Effacer la présence : null admis (colonne facultative).
  const cleared = await patch(manager.token, { presence_status: null }).expect(200);
  assert.equal(cleared.body.presence_status, null);
});

test('rétrograder « confirme_site » : 409 sans allow_downgrade, réservé à plants.manage', async () => {
  const refused = await patch(manager.token, { validation_status: 'a_confirmer' }).expect(409);
  assert.equal(refused.body.code, 'REGISTRY_DOWNGRADE');
  await patch(validator.token, {
    validation_status: 'a_confirmer',
    allow_downgrade: true,
  }).expect(409);
  const ok = await patch(manager.token, {
    validation_status: 'a_confirmer',
    allow_downgrade: true,
  }).expect(200);
  assert.equal(ok.body.validation_status, 'a_confirmer');
});
