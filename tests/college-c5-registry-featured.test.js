'use strict';

/**
 * Chantier collège, flux C5 — espèce phare d'une carte (`map_species.is_featured`, socle 378).
 *
 * - `PATCH /api/plants/:id/map-species/:mapId` accepte `is_featured` (booléen, `plants.manage`
 *   seul : le validateur d'observations ne choisit pas les espèces phares), journalisé, relu
 *   par la présence commune (`GET /api/maps/:id/species`) ;
 * - le connecteur (`foretmap_species action=registry_status`) passe par la même route, donc par
 *   la même logique métier.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const fx = require('./helpers/mcpFixtures');
const fm = require('./helpers/fmFixtures');
const { initSchema, queryOne, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { buildSessionPayload } = require('../lib/auth/sessionPayload');
const { setAssignedRole, recomputeUserRole } = require('../lib/effectiveRole');

fx.enableMcpEnv();

const { app } = require('../server');

const U = crypto.randomUUID().slice(0, 8);
const created = { users: [], roles: [], plants: [], maps: [] };

async function accountWithRole(roleId) {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO users (id, user_type, email, first_name, last_name, display_name, password_hash,
                        auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, 'Phare', ?, ?, 'x', 'local', 1, NOW(), NOW())`,
    [id, `phare.${U}.${created.users.length}@example.test`, U, `Phare ${U}`],
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
    [`${slug}_${U}`, `Phare ${slug} ${U}`],
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
let mcpToken;
let plant;
let map;

test.before(async () => {
  await initSchema();
  manager = await accountWithRole(await roleWith('gestion', ['plants.manage']));
  validator = await accountWithRole(await roleWith('valid', ['observations.validate']));
  const admin = await fx.createAccount('admin');
  mcpToken = (await fx.obtainTokens(app, admin)).access_token;
  plant = await fm.createPlant({ name: `Phare ${U}` });
  created.plants.push(plant.id);
  map = await fm.createMap({ id: `ph${U}`.slice(0, 32) });
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
  await fx.cleanupAccounts();
});

test.beforeEach(() => fx.enableMcpEnv());

function patch(token, body) {
  return request(app)
    .patch(`/api/plants/${plant.id}/map-species/${map.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

async function featuredInDb() {
  const row = await queryOne(
    'SELECT is_featured FROM map_species WHERE plant_id = ? AND map_id = ?',
    [plant.id, map.id],
  );
  return Number(row.is_featured) === 1;
}

test('droits : is_featured réservé à plants.manage, valeur booléenne contrôlée', async () => {
  await patch(validator.token, { is_featured: true }).expect(403);
  // Même combiné à un champ que le validateur a le droit d'écrire.
  await patch(validator.token, { validation_status: 'attendu', is_featured: true }).expect(403);
  const bad = await patch(manager.token, { is_featured: 'oui' }).expect(400);
  assert.match(bad.body.error, /is_featured invalide/);
  await patch(manager.token, { is_featured: null }).expect(400);
  assert.equal(await featuredInDb(), false, 'rien écrit');
});

test('écriture seule de is_featured : écrite, journalisée, relue par la présence commune', async () => {
  const res = await patch(manager.token, { is_featured: true }).expect(200);
  assert.equal(res.body.is_featured, true);
  assert.equal(res.body.validation_status, 'attendu', 'certitude inchangée');
  assert.equal(await featuredInDb(), true);

  const audit = await queryOne(
    "SELECT payload_json FROM audit_log WHERE action = 'update_map_species_status' AND target_id = ? ORDER BY id DESC LIMIT 1",
    [`${map.id}:${plant.id}`],
  );
  const payload =
    typeof audit.payload_json === 'string' ? JSON.parse(audit.payload_json) : audit.payload_json;
  assert.equal(payload.before.is_featured, false);
  assert.equal(payload.after.is_featured, true);

  const presence = await request(app)
    .get(`/api/maps/${map.id}/species`)
    .set('Authorization', `Bearer ${manager.token}`)
    .expect(200);
  const entry = presence.body.species.find((s) => s.plant_id === plant.id);
  assert.equal(entry.is_featured, true);

  // 0 / 1 admis (forme SQL) ; retour à false.
  const off = await patch(manager.token, { is_featured: 0 }).expect(200);
  assert.equal(off.body.is_featured, false);
  assert.equal(await featuredInDb(), false);
});

test('connecteur : registry_status écrit is_featured par la route (logique métier)', async () => {
  const on = await fx.callTool(app, mcpToken, 'foretmap_species', {
    action: 'registry_status',
    plant_id: plant.id,
    map_id: map.id,
    is_featured: true,
  });
  assert.equal(on.isError, false, on.text);
  assert.equal(on.data.registry.is_featured, true);
  assert.equal(await featuredInDb(), true);

  const off = await fx.callTool(app, mcpToken, 'foretmap_species', {
    action: 'registry_status',
    plant_id: plant.id,
    map_id: map.id,
    is_featured: false,
  });
  assert.equal(off.isError, false, off.text);
  assert.equal(off.data.registry.is_featured, false);
  assert.equal(await featuredInDb(), false);

  // Valeur non booléenne refusée par le schéma de l'outil.
  const bad = await fx.callTool(app, mcpToken, 'foretmap_species', {
    action: 'registry_status',
    plant_id: plant.id,
    map_id: map.id,
    is_featured: 'oui',
  });
  assert.equal(bad.isError, true);
});
