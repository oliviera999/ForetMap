'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');

const stamp = Date.now();
let adminToken = '';
let playerToken = '';
let fromId = 0;
let toId = 0;

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ FoodWeb', 'admin', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE is_active = 1, updated_at = NOW()`,
    [`fw.admin.${stamp}@ecole.local`],
  );
  const admin = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [
    `fw.admin.${stamp}@ecole.local`,
  ]);
  adminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.content.manage'],
  });
  await execute(
    `INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at)
     VALUES (?, 'Ecole', ?, 1, NOW(), NOW())`,
    [`Classe FW ${stamp}`, admin.id],
  );
  const cls = await queryOne('SELECT id FROM gl_classes WHERE name = ? LIMIT 1', [
    `Classe FW ${stamp}`,
  ]);
  await execute(
    `INSERT INTO gl_players (class_id, pseudo, legacy_password_hash, is_active, created_at, updated_at)
     VALUES (?, ?, 'x', 1, NOW(), NOW())`,
    [cls.id, `fw-player-${stamp}`],
  );
  const player = await queryOne('SELECT id FROM gl_players WHERE pseudo = ? LIMIT 1', [
    `fw-player-${stamp}`,
  ]);
  playerToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(player.id),
    roleSlug: 'gl_player',
    permissions: ['gl.read'],
  });

  const fromRes = await execute(
    `INSERT INTO gl_species (species_code, biome_slug, type, nom_commun, statut, created_at, updated_at)
     VALUES (?, 'toundra', 'faune', ?, 'actif', NOW(), NOW())`,
    [`SPFW${String(stamp).slice(-4)}A`, `Renard FW ${stamp}`],
  );
  const toRes = await execute(
    `INSERT INTO gl_species (species_code, biome_slug, type, nom_commun, statut, created_at, updated_at)
     VALUES (?, 'toundra', 'faune', ?, 'actif', NOW(), NOW())`,
    [`SPFW${String(stamp).slice(-4)}B`, `Lièvre FW ${stamp}`],
  );
  fromId = fromRes.insertId;
  toId = toRes.insertId;
});

test('GET /api/gl/food-web — lecture joueur par jointure', async () => {
  const res = await request(app)
    .get('/api/gl/food-web')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.ok(Array.isArray(res.body.items));
});

test('GET /api/gl/food-web?biomeSlug= — biome inconnu 404', async () => {
  await request(app)
    .get('/api/gl/food-web?biomeSlug=biome-inexistant')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(404);
});

test('CRUD /api/gl/food-web/interactions — MJ seulement', async () => {
  await request(app)
    .post('/api/gl/food-web/interactions')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ from_id: fromId, to_id: toId, interaction_type: 'predation' })
    .expect(403);

  const created = await request(app)
    .post('/api/gl/food-web/interactions')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      from_id: fromId,
      to_id: toId,
      interaction_type: 'predation',
      description: 'chasse test',
    })
    .expect(201);
  const id = created.body?.interaction?.id;
  assert.ok(id);
  assert.strictEqual(created.body.interaction.from_name, `Renard FW ${stamp}`);

  const listed = await request(app)
    .get('/api/gl/food-web?biomeSlug=toundra')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.ok(listed.body.items.some((row) => Number(row.id) === Number(id)));

  await request(app)
    .put(`/api/gl/food-web/interactions/${id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      from_id: fromId,
      to_id: toId,
      interaction_type: 'predation',
      description: 'chasse à l’aube',
    })
    .expect(200);

  await request(app)
    .delete(`/api/gl/food-web/interactions/${id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
});

test('la vue morte v_gl_food_web n’est pas recréée', async () => {
  const views = await queryOne(
    `SELECT COUNT(*) AS n FROM information_schema.views
      WHERE table_schema = DATABASE() AND table_name = 'v_gl_food_web'`,
  );
  assert.strictEqual(Number(views.n), 0);
});
