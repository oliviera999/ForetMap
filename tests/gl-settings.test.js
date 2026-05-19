'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { invalidateGameplayCache } = require('../lib/glSettings');

let adminToken = '';
let playerToken = '';
const stamp = Date.now();
const adminEmail = `settings.mj.${stamp}@ecole.local`;
const className = `Classe Settings ${stamp}`;
const playerPseudo = `settings-player-${stamp}`;

before(async () => {
  await initSchema();
  invalidateGameplayCache();

  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ Settings', 'admin', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE is_active = 1, updated_at = NOW()`,
    [adminEmail]
  );
  const admin = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [adminEmail]);
  adminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.settings.manage'],
    displayName: 'MJ Settings',
  });

  await execute(
    `INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at)
     VALUES (?, 'Ecole Test', ?, 1, NOW(), NOW())`,
    [className, admin.id]
  );
  const cls = await queryOne('SELECT id FROM gl_classes WHERE name = ? ORDER BY id DESC LIMIT 1', [className]);
  await execute(
    `INSERT INTO gl_players (class_id, pseudo, pin_hash, is_active, created_at, updated_at)
     VALUES (?, ?, 'x', 1, NOW(), NOW())`,
    [cls.id, playerPseudo]
  );
  const player = await queryOne('SELECT id FROM gl_players WHERE pseudo = ? LIMIT 1', [playerPseudo]);
  playerToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(player.id),
    roleSlug: 'gl_player',
    permissions: ['gl.read', 'gl.action.request'],
    displayName: playerPseudo,
  });
});

test('GET /api/gl/gameplay-settings expose les 4 toggles (joueur)', async () => {
  const res = await request(app)
    .get('/api/gl/gameplay-settings')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.ok(res.body?.settings);
  const s = res.body.settings;
  assert.strictEqual(typeof s.turnsEnabled, 'boolean');
  assert.strictEqual(typeof s.narrationEnabled, 'boolean');
  assert.strictEqual(typeof s.playerActionsEnabled, 'boolean');
  assert.strictEqual(typeof s.scoringEnabled, 'boolean');
});

test('PUT /api/gl/admin/settings/:key garde la permission gl.settings.manage', async () => {
  await request(app)
    .put('/api/gl/admin/settings/gameplay.turns_enabled')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ value: true })
    .expect((res) => {
      assert.ok(res.status === 403 || res.status === 401, `Statut attendu 401/403, reçu ${res.status}`);
    });
});

test('PUT par admin met à jour le toggle, lu ensuite par /gameplay-settings', async () => {
  await request(app)
    .put('/api/gl/admin/settings/gameplay.narration_enabled')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ value: true })
    .expect(200);

  invalidateGameplayCache();

  const res = await request(app)
    .get('/api/gl/gameplay-settings')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.strictEqual(res.body.settings.narrationEnabled, true);

  await request(app)
    .put('/api/gl/admin/settings/gameplay.narration_enabled')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ value: false })
    .expect(200);
  invalidateGameplayCache();
});
