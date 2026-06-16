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
const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pJkQAAAAASUVORK5CYII=';

before(async () => {
  await initSchema();
  invalidateGameplayCache();

  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ Settings', 'admin', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE is_active = 1, updated_at = NOW()`,
    [adminEmail],
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
    [className, admin.id],
  );
  const cls = await queryOne('SELECT id FROM gl_classes WHERE name = ? ORDER BY id DESC LIMIT 1', [
    className,
  ]);
  await execute(
    `INSERT INTO gl_players
      (class_id, first_name, last_name, pseudo, password_must_reset, password_hash, is_active, created_at, updated_at)
     VALUES (?, 'Jean', 'Test', ?, 0, '$2a$10$abcdefghijklmnopqrstuvabcdefghijklmnopqrstuvabcd', 1, NOW(), NOW())`,
    [cls.id, playerPseudo],
  );
  const player = await queryOne('SELECT id FROM gl_players WHERE pseudo = ? LIMIT 1', [
    playerPseudo,
  ]);
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
  assert.strictEqual(typeof s.qcmMjOnly, 'boolean');
  assert.strictEqual(typeof s.vitalityEnabled, 'boolean');
  assert.strictEqual(typeof s.defaultHealthPoints, 'number');
  assert.strictEqual(typeof s.defaultPowerPoints, 'number');
  assert.ok(
    ['every_arrival', 'once_per_team', 'once_per_game'].includes(s.markerQuestionRetrigger),
  );
  assert.ok(['every_arrival', 'once_per_team', 'once_per_game'].includes(s.zoneContentRetrigger));
});

test('PUT défauts vitalité invalide → 400', async () => {
  await request(app)
    .put('/api/gl/admin/settings/gameplay.default_health_points')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ value: 120 })
    .expect(400);
});

test('PUT /api/gl/admin/settings/:key garde la permission gl.settings.manage', async () => {
  await request(app)
    .put('/api/gl/admin/settings/gameplay.turns_enabled')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ value: true })
    .expect((res) => {
      assert.ok(
        res.status === 403 || res.status === 401,
        `Statut attendu 401/403, reçu ${res.status}`,
      );
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

test('PUT gameplay.qcm_mj_only persiste et est lu par /gameplay-settings', async () => {
  await request(app)
    .put('/api/gl/admin/settings/gameplay.qcm_mj_only')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ value: true })
    .expect(200);

  invalidateGameplayCache();

  const res = await request(app)
    .get('/api/gl/gameplay-settings')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.strictEqual(res.body.settings.qcmMjOnly, true);

  await request(app)
    .put('/api/gl/admin/settings/gameplay.qcm_mj_only')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ value: false })
    .expect(200);
  invalidateGameplayCache();
});

test('GET /api/gl/auth/config expose les modules GL', async () => {
  const res = await request(app).get('/api/gl/auth/config').expect(200);
  assert.ok(res.body?.modules);
  assert.strictEqual(typeof res.body.modules.journalEnabled, 'boolean');
  assert.strictEqual(typeof res.body.modules.playerJournalEnabled, 'boolean');
  assert.strictEqual(typeof res.body.modules.mascotPacksEnabled, 'boolean');
});

test('PUT /api/gl/admin/settings/modules.* valide booléen et persiste', async () => {
  await request(app)
    .put('/api/gl/admin/settings/modules.journal_enabled')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ value: false })
    .expect(200);

  const cfg = await request(app).get('/api/gl/auth/config').expect(200);
  assert.strictEqual(cfg.body?.modules?.journalEnabled, false);

  await request(app)
    .put('/api/gl/admin/settings/modules.journal_enabled')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ value: 'false' })
    .expect(400);

  await request(app)
    .put('/api/gl/admin/settings/modules.unknown_flag')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ value: true })
    .expect(400);
});

test('PUT modules.virtual_dice_enabled persiste et expose virtualDiceEnabled', async () => {
  await request(app)
    .put('/api/gl/admin/settings/modules.virtual_dice_enabled')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ value: true })
    .expect(200);

  const cfg = await request(app).get('/api/gl/auth/config').expect(200);
  assert.strictEqual(cfg.body?.modules?.virtualDiceEnabled, true);

  await request(app)
    .put('/api/gl/admin/settings/modules.virtual_dice_enabled')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ value: false })
    .expect(200);
});

test('PUT modules.zone_music_enabled persiste et expose zoneMusicEnabled', async () => {
  await request(app)
    .put('/api/gl/admin/settings/modules.zone_music_enabled')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ value: true })
    .expect(200);

  const cfg = await request(app).get('/api/gl/auth/config').expect(200);
  assert.strictEqual(cfg.body?.modules?.zoneMusicEnabled, true);

  await request(app)
    .put('/api/gl/admin/settings/modules.zone_music_enabled')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ value: false })
    .expect(200);
});

test('media-library GL: upload, liste et suppression (gl.content.manage)', async () => {
  await request(app)
    .get('/api/gl/admin/media-library')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect((res) => {
      assert.ok(res.status === 401 || res.status === 403);
    });

  const contentAdminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(
      (await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [adminEmail])).id,
    ),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.content.manage'],
    displayName: 'MJ Content',
  });

  const created = await request(app)
    .post('/api/gl/admin/media-library')
    .set('Authorization', `Bearer ${contentAdminToken}`)
    .send({ media_data: TINY_PNG_DATA_URL })
    .expect(201);
  assert.ok(String(created.body?.url || '').startsWith('/uploads/media-library/'));
  assert.strictEqual(created.body?.mediaType, 'image');

  const listed = await request(app)
    .get('/api/gl/admin/media-library')
    .set('Authorization', `Bearer ${contentAdminToken}`)
    .expect(200);
  assert.ok(Array.isArray(listed.body?.items));
  assert.ok(listed.body.items.some((item) => item.relativePath === created.body.relativePath));

  await request(app)
    .delete('/api/gl/admin/media-library')
    .set('Authorization', `Bearer ${contentAdminToken}`)
    .send({ relative_path: created.body.relativePath })
    .expect(200);
});
