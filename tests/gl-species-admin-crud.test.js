'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');

let adminToken = '';
let playerToken = '';
const stamp = Date.now();
const biomeSlug = `e2e_biome_${stamp}`;
const testCode = `SP9${String(stamp).slice(-4)}`;

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_biomes (slug, nom, order_index, created_at, updated_at)
     VALUES (?, ?, 9999, NOW(), NOW())`,
    [biomeSlug, `Biome e2e ${stamp}`],
  );
  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ CRUD Species', 'admin', 1, NOW(), NOW())`,
    [`species.crud.${stamp}@ecole.local`],
  );
  const admin = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [
    `species.crud.${stamp}@ecole.local`,
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
    [`Classe CRUD Species ${stamp}`, admin.id],
  );
  const cls = await queryOne('SELECT id FROM gl_classes WHERE name = ? LIMIT 1', [
    `Classe CRUD Species ${stamp}`,
  ]);
  await execute(
    `INSERT INTO gl_players (class_id, pseudo, password_hash, is_active, created_at, updated_at)
     VALUES (?, ?, 'x', 1, NOW(), NOW())`,
    [cls.id, `species-crud-player-${stamp}`],
  );
  const player = await queryOne('SELECT id FROM gl_players WHERE pseudo = ? LIMIT 1', [
    `species-crud-player-${stamp}`,
  ]);
  playerToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(player.id),
    roleSlug: 'gl_player',
    permissions: ['gl.read'],
  });
});

test('POST /api/gl/admin/species crée une espèce visible par biome', async () => {
  const create = await request(app)
    .post('/api/gl/admin/species')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      species_code: testCode,
      biome_slug: biomeSlug,
      type: 'faune',
      nom_commun: `Espèce e2e ${stamp}`,
      nom_scientifique: 'Testus e2eus',
      mots_cles: 'test, faune',
      statut: 'actif',
    })
    .expect(201);
  assert.strictEqual(create.body.created, true);
  assert.strictEqual(create.body.species.species_code, testCode);

  const catalog = await request(app)
    .get(`/api/gl/species?biomeSlug=${encodeURIComponent(biomeSlug)}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  const found = (catalog.body.items || []).find((row) => row.species_code === testCode);
  assert.ok(found);
});

test('PUT /api/gl/admin/species/:code met à jour la fiche', async () => {
  const res = await request(app)
    .put(`/api/gl/admin/species/${testCode}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      biome_slug: biomeSlug,
      type: 'faune',
      nom_commun: `Espèce modifiée ${stamp}`,
      statut: 'actif',
    })
    .expect(200);
  assert.ok(String(res.body.species.nom_commun).includes('modifiée'));
});

test('GET /api/gl/admin/species/:code 404 si code inconnu', async () => {
  await request(app)
    .get('/api/gl/admin/species/SP000000')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(404);
});

test('POST refuse URL photo invalide', async () => {
  await request(app)
    .post('/api/gl/admin/species')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      species_code: `SPX${stamp}`,
      biome_slug: biomeSlug,
      type: 'flore',
      nom_commun: 'Mauvaise URL',
      photo_url: 'pas-une-url-valide',
      statut: 'actif',
    })
    .expect(400);
});

test('PATCH archive une espèce', async () => {
  const patch = await request(app)
    .patch(`/api/gl/admin/species/${testCode}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ statut: 'inactif' })
    .expect(200);
  assert.strictEqual(patch.body.species.statut, 'inactif');

  const catalog = await request(app)
    .get(`/api/gl/species?biomeSlug=${encodeURIComponent(biomeSlug)}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  const found = (catalog.body.items || []).find((row) => row.species_code === testCode);
  assert.strictEqual(found, undefined);
});
