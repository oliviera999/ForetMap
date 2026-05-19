'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');

let adminToken = '';
let gameId = null;

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES ('games.mj@ecole.local', 'MJ Games', 'admin', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE is_active = 1, updated_at = NOW()`
  );
  const admin = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', ['games.mj@ecole.local']);
  await execute(
    `INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at)
     VALUES ('6e B', 'College Test', ?, 1, NOW(), NOW())`,
    [admin.id]
  );
  adminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.game.manage', 'gl.team.manage', 'gl.event.emit', 'gl.mascot.position'],
    displayName: 'MJ Games',
  });
});

test('POST /api/gl/games crée une partie', async () => {
  const cls = await queryOne('SELECT id FROM gl_classes ORDER BY id DESC LIMIT 1');
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
  const res = await request(app)
    .post('/api/gl/games')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      classId: cls.id,
      chapterId: chapter.id,
      name: 'Partie test GL',
    })
    .expect(201);
  assert.ok(res.body?.game?.id);
  gameId = Number(res.body.game.id);
});

test('POST /api/gl/games/:id/teams ajoute une équipe', async () => {
  const res = await request(app)
    .post(`/api/gl/games/${gameId}/teams`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: 'Equipe Gnomes Test',
      type: 'gnome',
      mascotId: 'gnome-foret-rive',
      color: '#65a30d',
    })
    .expect(201);
  assert.strictEqual(res.body.type, 'gnome');
});

test('POST /api/gl/games/:id/events move met à jour la position', async () => {
  const team = await queryOne('SELECT id FROM gl_teams WHERE game_id = ? ORDER BY id DESC LIMIT 1', [gameId]);
  const marker = await queryOne('SELECT id FROM gl_chapter_markers ORDER BY id ASC LIMIT 1');
  const res = await request(app)
    .post(`/api/gl/games/${gameId}/events`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      teamId: team.id,
      eventType: 'move',
      payload: { markerId: marker.id },
    })
    .expect(201);
  assert.strictEqual(res.body.eventType, 'move');

  const state = await request(app)
    .get(`/api/gl/games/${gameId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const movedTeam = (state.body.teams || []).find((item) => Number(item.id) === Number(team.id));
  assert.strictEqual(Number(movedTeam.position_marker_id), Number(marker.id));
});
