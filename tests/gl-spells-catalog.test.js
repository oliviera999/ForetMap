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

const XLSX_PATH = path.join(__dirname, '..', 'data', 'gl', 'sortileges-gnomes-et-licornes.xlsx');

let adminToken = '';
let playerToken = '';
const stamp = Date.now();

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ Spells', 'admin', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE is_active = 1, updated_at = NOW()`,
    [`spells.admin.${stamp}@ecole.local`]
  );
  const admin = await queryOne(
    'SELECT id FROM gl_admins WHERE email = ? LIMIT 1',
    [`spells.admin.${stamp}@ecole.local`]
  );
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
    [`Classe Spells ${stamp}`, admin.id]
  );
  const cls = await queryOne('SELECT id FROM gl_classes WHERE name = ? LIMIT 1', [`Classe Spells ${stamp}`]);
  await execute(
    `INSERT INTO gl_players (class_id, pseudo, password_hash, is_active, created_at, updated_at)
     VALUES (?, ?, 'x', 1, NOW(), NOW())`,
    [cls.id, `spells-player-${stamp}`]
  );
  const player = await queryOne('SELECT id FROM gl_players WHERE pseudo = ? LIMIT 1', [`spells-player-${stamp}`]);
  playerToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(player.id),
    roleSlug: 'gl_player',
    permissions: ['gl.read'],
  });
});

test('GET /api/gl/spell-categories retourne les catégories seedées', async () => {
  const res = await request(app)
    .get('/api/gl/spell-categories')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.some((c) => c.slug === 'mouvement'));
});

test('POST /api/gl/admin/spells/import dryRun sans écriture', async () => {
  const fileDataBase64 = fs.readFileSync(XLSX_PATH).toString('base64');
  const beforeCount = await queryOne('SELECT COUNT(*) AS n FROM gl_spells');
  const res = await request(app)
    .post('/api/gl/admin/spells/import')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ fileDataBase64, dryRun: true, syncCategories: true })
    .expect(200);
  assert.strictEqual(res.body?.report?.dryRun, true);
  assert.ok(res.body?.report?.totals?.valid >= 30);
  const afterCount = await queryOne('SELECT COUNT(*) AS n FROM gl_spells');
  assert.strictEqual(Number(afterCount.n), Number(beforeCount.n));
});

test('POST /api/gl/admin/spells/import apply upsert le catalogue', async () => {
  const fileDataBase64 = fs.readFileSync(XLSX_PATH).toString('base64');
  const res = await request(app)
    .post('/api/gl/admin/spells/import')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ fileDataBase64, dryRun: false, syncCategories: true })
    .expect(200);
  assert.ok(res.body?.report?.totals?.created + res.body?.report?.totals?.updated >= 30);
  const row = await queryOne(
    "SELECT nom FROM gl_spells WHERE spell_code = 'SL002' LIMIT 1"
  );
  assert.strictEqual(row?.nom, 'Progression');
});

test('GET /api/gl/spells?spellCodes= liste les sorts demandés', async () => {
  const res = await request(app)
    .get('/api/gl/spells?spellCodes=SL002,SL007')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.ok(Array.isArray(res.body?.items));
  assert.strictEqual(res.body.items.length, 2);
  assert.ok(res.body.items.some((s) => s.spell_code === 'SL002'));
});

test('GET /api/gl/spells refuse sans spellCodes', async () => {
  await request(app)
    .get('/api/gl/spells')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(400);
});

test('GET /api/gl/spells/:code retourne le détail', async () => {
  const res = await request(app)
    .get('/api/gl/spells/SL002')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.strictEqual(res.body?.spell?.spell_code, 'SL002');
  assert.ok(res.body?.spell?.effet_detaille);
});
