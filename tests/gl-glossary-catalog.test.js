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

const GLOSSARY_XLSX = path.join(__dirname, '..', 'data', 'gl', 'glossaire-gnomes-et-licornes.xlsx');
const SPECIES_XLSX = path.join(
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
     VALUES (?, 'MJ Glossary', 'admin', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE is_active = 1, updated_at = NOW()`,
    [`glossary.admin.${stamp}@ecole.local`],
  );
  const admin = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [
    `glossary.admin.${stamp}@ecole.local`,
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
    [`Classe Glossary ${stamp}`, admin.id],
  );
  const cls = await queryOne('SELECT id FROM gl_classes WHERE name = ? LIMIT 1', [
    `Classe Glossary ${stamp}`,
  ]);
  await execute(
    `INSERT INTO gl_players (class_id, pseudo, password_hash, is_active, created_at, updated_at)
     VALUES (?, ?, 'x', 1, NOW(), NOW())`,
    [cls.id, `glossary-player-${stamp}`],
  );
  const player = await queryOne('SELECT id FROM gl_players WHERE pseudo = ? LIMIT 1', [
    `glossary-player-${stamp}`,
  ]);
  playerToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(player.id),
    roleSlug: 'gl_player',
    permissions: ['gl.read'],
  });
});

test('POST /api/gl/admin/glossary/import dryRun sans écriture', async () => {
  const fileDataBase64 = fs.readFileSync(GLOSSARY_XLSX).toString('base64');
  const beforeCount = await queryOne('SELECT COUNT(*) AS n FROM gl_glossary_terms');
  const res = await request(app)
    .post('/api/gl/admin/glossary/import')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ fileDataBase64, dryRun: true })
    .expect(200);
  assert.strictEqual(res.body?.report?.dryRun, true);
  assert.ok(res.body?.report?.totals?.valid >= 270);
  const afterCount = await queryOne('SELECT COUNT(*) AS n FROM gl_glossary_terms');
  assert.strictEqual(Number(afterCount.n), Number(beforeCount.n));
});

test('POST /api/gl/admin/glossary/import apply upsert le glossaire', async () => {
  const fileDataBase64 = fs.readFileSync(GLOSSARY_XLSX).toString('base64');
  const res = await request(app)
    .post('/api/gl/admin/glossary/import')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ fileDataBase64, dryRun: false })
    .expect(200);
  assert.ok(res.body?.report?.totals?.created + res.body?.report?.totals?.updated >= 270);
  const row = await queryOne(
    "SELECT terme FROM gl_glossary_terms WHERE glossary_code = 'GL0001' LIMIT 1",
  );
  assert.ok(row?.terme);
});

test('GET /api/gl/glossary liste les termes actifs', async () => {
  const res = await request(app)
    .get('/api/gl/glossary?biomeSlug=sahara')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.strictEqual(res.body?.biome?.slug, 'sahara');
  assert.ok(Array.isArray(res.body?.items));
  assert.ok(res.body.items.length >= 50);
});

test('GET /api/gl/glossary/:code retourne une fiche', async () => {
  const res = await request(app)
    .get('/api/gl/glossary/GL0001?biomeSlug=sahara')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.ok(res.body?.term?.terme);
  assert.ok(Array.isArray(res.body?.relatedTerms));
});

test('GET /api/gl/admin/glossary/stats retourne des agrégats', async () => {
  const res = await request(app)
    .get('/api/gl/admin/glossary/stats')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(Number(res.body?.total) >= 270);
  assert.ok(Array.isArray(res.body?.byCategory));
});

test('POST /api/gl/admin/glossary/import refuse sans gl.content.manage', async () => {
  await request(app)
    .post('/api/gl/admin/glossary/import')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ fileDataBase64: 'e30=', dryRun: true })
    .expect(403);
});

test('GET /api/gl/species enrichit glossaryTerms après import espèces', async () => {
  const fileDataBase64 = fs.readFileSync(SPECIES_XLSX).toString('base64');
  await request(app)
    .post('/api/gl/admin/species/import')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ fileDataBase64, dryRun: false, syncBiomes: true })
    .expect(200);

  const res = await request(app)
    .get('/api/gl/species?biomeSlug=sahara')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  const withTerms = res.body.items.filter(
    (s) => Array.isArray(s.glossaryTerms) && s.glossaryTerms.length > 0,
  );
  assert.ok(withTerms.length >= 10);
  assert.ok(withTerms[0].glossaryTerms[0].glossary_code);
  assert.ok(withTerms[0].glossaryTerms[0].terme);
});
