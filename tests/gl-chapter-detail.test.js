'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { createGlPlayer } = require('./helpers/glFixtures');
const { signAuthToken } = require('../middleware/requireTeacher');

let playerToken = '';

before(async () => {
  await initSchema();
  const stamp = Date.now();
  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ Chapter Detail', 'admin', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE is_active = 1, updated_at = NOW()`,
    [`chapter.mj.${stamp}@ecole.local`],
  );
  const admin = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [
    `chapter.mj.${stamp}@ecole.local`,
  ]);
  await execute(
    `INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at)
     VALUES (?, 'Ecole', ?, 1, NOW(), NOW())`,
    [`Classe Chapter ${stamp}`, admin.id],
  );
  const cls = await queryOne('SELECT id FROM gl_classes ORDER BY id DESC LIMIT 1');
  const player = await createGlPlayer({
    classId: cls.id,
    pseudo: `chapter-player-${stamp}`,
  });
  playerToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(player.id),
    roleSlug: 'gl_player',
    permissions: ['gl.read', 'gl.action.request'],
    displayName: 'chapter-player',
  });
});

test('GET /api/gl/chapters/:slug renvoie chapitre et markers seedés', async () => {
  const res = await request(app)
    .get('/api/gl/chapters/foret-magique')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.ok(res.body?.chapter?.id);
  assert.strictEqual(res.body.chapter.slug, 'foret-magique');
  assert.ok(Array.isArray(res.body.markers));
  assert.ok(res.body.markers.length >= 1);
  assert.ok(res.body.chapter.theme);
  assert.deepStrictEqual(res.body.chapter.theme.colors, {});
});

test('GET /api/gl/chapters/:slug renvoie 404 si slug inconnu', async () => {
  await request(app)
    .get('/api/gl/chapters/slug-inexistant')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(404);
});

test('GET /api/gl/chapters/:slug refuse sans token', async () => {
  await request(app).get('/api/gl/chapters/foret-magique').expect(401);
});
