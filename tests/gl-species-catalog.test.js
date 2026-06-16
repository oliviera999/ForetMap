'use strict';

require('./helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');

const XLSX_PATH = path.join(
  __dirname,
  '..',
  'data',
  'gl',
  'especes-biomes-gnomes-et-licornes.xlsx',
);

let adminToken = '';
let playerToken = '';
const stamp = Date.now();

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ Species', 'admin', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE is_active = 1, updated_at = NOW()`,
    [`species.admin.${stamp}@ecole.local`],
  );
  const admin = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [
    `species.admin.${stamp}@ecole.local`,
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
    [`Classe Species ${stamp}`, admin.id],
  );
  const cls = await queryOne('SELECT id FROM gl_classes WHERE name = ? LIMIT 1', [
    `Classe Species ${stamp}`,
  ]);
  await execute(
    `INSERT INTO gl_players (class_id, pseudo, password_hash, is_active, created_at, updated_at)
     VALUES (?, ?, 'x', 1, NOW(), NOW())`,
    [cls.id, `species-player-${stamp}`],
  );
  const player = await queryOne('SELECT id FROM gl_players WHERE pseudo = ? LIMIT 1', [
    `species-player-${stamp}`,
  ]);
  playerToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(player.id),
    roleSlug: 'gl_player',
    permissions: ['gl.read'],
  });
});

test('GET /api/gl/biomes retourne les biomes seedés', async () => {
  const res = await request(app)
    .get('/api/gl/biomes')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.some((b) => b.slug === 'sahara'));
});

test('POST /api/gl/admin/species/import dryRun sans écriture', async () => {
  const fileDataBase64 = fs.readFileSync(XLSX_PATH).toString('base64');
  const beforeCount = await queryOne('SELECT COUNT(*) AS n FROM gl_species');
  const res = await request(app)
    .post('/api/gl/admin/species/import')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ fileDataBase64, dryRun: true, syncBiomes: true })
    .expect(200);
  assert.strictEqual(res.body?.report?.dryRun, true);
  assert.ok(res.body?.report?.totals?.valid >= 250);
  const afterCount = await queryOne('SELECT COUNT(*) AS n FROM gl_species');
  assert.strictEqual(Number(afterCount.n), Number(beforeCount.n));
});

test('POST /api/gl/admin/species/import apply upsert le catalogue', async () => {
  const fileDataBase64 = fs.readFileSync(XLSX_PATH).toString('base64');
  const res = await request(app)
    .post('/api/gl/admin/species/import')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ fileDataBase64, dryRun: false, syncBiomes: true })
    .expect(200);
  assert.ok(res.body?.report?.totals?.created + res.body?.report?.totals?.updated >= 250);
  const row = await queryOne(
    "SELECT nom_commun FROM gl_species WHERE species_code = 'SP0001' LIMIT 1",
  );
  assert.strictEqual(row?.nom_commun, 'Fennec');
});

test('GET /api/gl/species?biomeSlug=sahara liste les espèces', async () => {
  const res = await request(app)
    .get('/api/gl/species?biomeSlug=sahara')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.strictEqual(res.body?.biome?.slug, 'sahara');
  assert.ok(Array.isArray(res.body?.items));
  assert.ok(res.body.items.length >= 20);
  assert.ok(res.body.items.some((s) => s.nom_commun === 'Fennec'));
});

test('GET /api/gl/species refuse sans biomeSlug', async () => {
  await request(app)
    .get('/api/gl/species')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(400);
});

test('GET /api/gl/admin/species/stats retourne des agrégats', async () => {
  const res = await request(app)
    .get('/api/gl/admin/species/stats')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(Number(res.body?.total) >= 250);
  assert.ok(Array.isArray(res.body?.byBiome));
});

test('POST /api/gl/admin/species/import refuse sans gl.content.manage', async () => {
  await request(app)
    .post('/api/gl/admin/species/import')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ fileDataBase64: 'e30=', dryRun: true })
    .expect(403);
});
