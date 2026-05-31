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

// Régression : en prod (v1.52.3), un classId orphelin remontait en HTTP 500
// (ER_NO_REFERENCED_ROW_2 / fk_gl_games_class). La route doit répondre 404.
test('POST /api/gl/games : 404 si classId introuvable', async () => {
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
  const res = await request(app)
    .post('/api/gl/games')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ classId: 999999, chapterId: chapter.id, name: 'Partie orpheline' })
    .expect(404);
  assert.match(String(res.body?.error || ''), /classe/i);
});

test('POST /api/gl/games : 404 si chapterId introuvable', async () => {
  const cls = await queryOne('SELECT id FROM gl_classes ORDER BY id DESC LIMIT 1');
  const res = await request(app)
    .post('/api/gl/games')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ classId: cls.id, chapterId: 999999, name: 'Partie sans chapitre' })
    .expect(404);
  assert.match(String(res.body?.error || ''), /chapitre/i);
});

test('POST /api/gl/games : 400 si payload incomplet', async () => {
  await request(app)
    .post('/api/gl/games')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Sans ids' })
    .expect(400);
});

test('PUT /api/gl/games/:id met à jour le nom', async () => {
  const res = await request(app)
    .put(`/api/gl/games/${gameId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Partie renommée' })
    .expect(200);
  assert.strictEqual(res.body?.game?.name, 'Partie renommée');
});

test('PUT /api/gl/games/:id : 409 chapitre si partie en cours', async () => {
  await request(app)
    .post(`/api/gl/games/${gameId}/start`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
  const res = await request(app)
    .put(`/api/gl/games/${gameId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ chapterId: chapter.id })
    .expect(409);
  assert.match(String(res.body?.error || ''), /chapitre/i);
  await request(app)
    .post(`/api/gl/games/${gameId}/pause`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
});

test('PUT /api/gl/games/:id : 409 classe si roster non vide', async () => {
  const cls = await queryOne('SELECT id FROM gl_classes ORDER BY id DESC LIMIT 1');
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
  const createRes = await request(app)
    .post('/api/gl/games')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ classId: cls.id, chapterId: chapter.id, name: 'Partie roster test' })
    .expect(201);
  const draftGameId = Number(createRes.body.game.id);
  await request(app)
    .post(`/api/gl/games/${draftGameId}/teams`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Eq roster', type: 'gnome', color: '#65a30d' })
    .expect(201);
  const admin = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', ['games.mj@ecole.local']);
  await execute(
    `INSERT INTO gl_players (class_id, pseudo, first_name, last_name, password_hash, is_active, created_at, updated_at)
     VALUES (?, 'roster.test', 'Roster', 'Test', '$2b$10$abcdefghijklmnopqrstuv', 1, NOW(), NOW())`,
    [cls.id]
  );
  const player = await queryOne('SELECT id FROM gl_players WHERE pseudo = ? LIMIT 1', ['roster.test']);
  const team = await queryOne('SELECT id FROM gl_teams WHERE game_id = ? ORDER BY id DESC LIMIT 1', [draftGameId]);
  await execute(
    'INSERT INTO gl_team_members (game_id, team_id, player_id, joined_at) VALUES (?, ?, ?, NOW())',
    [draftGameId, team.id, player.id]
  );
  await execute(
    `INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at)
     VALUES ('6e C roster', 'College Test', ?, 1, NOW(), NOW())`,
    [admin.id]
  );
  const otherClass = await queryOne('SELECT id FROM gl_classes WHERE name = ? LIMIT 1', ['6e C roster']);
  const res = await request(app)
    .put(`/api/gl/games/${draftGameId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ classId: otherClass.id })
    .expect(409);
  assert.match(String(res.body?.error || ''), /classe|assign/i);
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

test('POST /api/gl/games/:id/teams : 404 si partie inexistante', async () => {
  const res = await request(app)
    .post('/api/gl/games/999999/teams')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Eq fantôme', type: 'gnome', color: '#65a30d' })
    .expect(404);
  assert.match(String(res.body?.error || ''), /partie/i);
});

test('POST /api/gl/games/:id/events move met à jour la position', async () => {
  const team = await queryOne('SELECT id FROM gl_teams WHERE game_id = ? ORDER BY id DESC LIMIT 1', [gameId]);
  const marker = await queryOne('SELECT id, x_pct, y_pct FROM gl_chapter_markers ORDER BY id ASC LIMIT 1');
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
  assert.strictEqual(Number(movedTeam.position_x_pct), Number(marker.x_pct));
  assert.strictEqual(Number(movedTeam.position_y_pct), Number(marker.y_pct));
});

test('POST /api/gl/games/:id/events move accepte xp/yp libres', async () => {
  const team = await queryOne('SELECT id FROM gl_teams WHERE game_id = ? ORDER BY id DESC LIMIT 1', [gameId]);
  await request(app)
    .post(`/api/gl/games/${gameId}/events`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      teamId: team.id,
      eventType: 'move',
      payload: { xp: 63.42, yp: 27.8 },
    })
    .expect(201);

  const state = await request(app)
    .get(`/api/gl/games/${gameId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const movedTeam = (state.body.teams || []).find((item) => Number(item.id) === Number(team.id));
  assert.strictEqual(movedTeam.position_marker_id, null);
  assert.strictEqual(Number(movedTeam.position_x_pct), 63.42);
  assert.strictEqual(Number(movedTeam.position_y_pct), 27.8);
});
