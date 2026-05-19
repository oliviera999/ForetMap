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
let gameId = null;
let teamAId = null;
let teamBId = null;

const stamp = Date.now();
const adminEmail = `mascots.mj.${stamp}@ecole.local`;
const className = `Classe Mascots ${stamp}`;
const gameName = `Partie Mascots ${stamp}`;
const playerPseudo = `mascots-player-${stamp}`;

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ Mascots', 'admin', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE is_active = 1, updated_at = NOW()`,
    [adminEmail]
  );
  const admin = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [adminEmail]);

  adminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.team.manage', 'gl.game.manage'],
    displayName: 'MJ Mascots',
  });

  await execute(
    `INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at)
     VALUES (?, 'Ecole Mascots', ?, 1, NOW(), NOW())`,
    [className, admin.id]
  );
  const cls = await queryOne('SELECT id FROM gl_classes WHERE name = ? LIMIT 1', [className]);
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
  await execute(
    `INSERT INTO gl_games (class_id, chapter_id, name, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, 'live', ?, NOW(), NOW())`,
    [cls.id, chapter.id, gameName, admin.id]
  );
  const game = await queryOne('SELECT id FROM gl_games WHERE name = ? LIMIT 1', [gameName]);
  gameId = Number(game.id);

  await execute(
    `INSERT INTO gl_teams (game_id, name, type, color, created_at, updated_at)
     VALUES (?, 'Team A', 'gnome', '#22c55e', NOW(), NOW())`,
    [gameId]
  );
  const teamA = await queryOne('SELECT id FROM gl_teams WHERE game_id = ? AND name = ? LIMIT 1', [gameId, 'Team A']);
  teamAId = Number(teamA.id);
  await execute(
    `INSERT INTO gl_teams (game_id, name, type, color, created_at, updated_at)
     VALUES (?, 'Team B', 'unicorn', '#ef4444', NOW(), NOW())`,
    [gameId]
  );
  const teamB = await queryOne('SELECT id FROM gl_teams WHERE game_id = ? AND name = ? LIMIT 1', [gameId, 'Team B']);
  teamBId = Number(teamB.id);

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

test('GET /api/gl/mascots retourne le catalogue (auth GL requise)', async () => {
  await request(app).get('/api/gl/mascots').expect(401);
  const res = await request(app)
    .get('/api/gl/mascots')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.ok(Array.isArray(res.body?.mascots));
  assert.ok(res.body.mascots.length >= 12);
});

test('POST /api/gl/mascots/assign exige gl.team.manage', async () => {
  await request(app)
    .post('/api/gl/mascots/assign')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ gameId, teamId: teamAId, mascotId: 'gl-gnome-mousse' })
    .expect(403);
});

test('POST /api/gl/mascots/assign assigne une mascotte à une équipe', async () => {
  const res = await request(app)
    .post('/api/gl/mascots/assign')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ gameId, teamId: teamAId, mascotId: 'gl-gnome-mousse' })
    .expect(200);
  assert.strictEqual(res.body?.mascot?.id, 'gl-gnome-mousse');
  const team = await queryOne('SELECT mascot_id FROM gl_teams WHERE id = ? LIMIT 1', [teamAId]);
  assert.strictEqual(team?.mascot_id, 'gl-gnome-mousse');
});

test('POST /api/gl/mascots/assign refuse une mascotte déjà prise (409)', async () => {
  await request(app)
    .post('/api/gl/mascots/assign')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ gameId, teamId: teamBId, mascotId: 'gl-gnome-mousse' })
    .expect(409);
});

test('POST /api/gl/mascots/assign accepte une autre mascotte pour la 2e équipe', async () => {
  const res = await request(app)
    .post('/api/gl/mascots/assign')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ gameId, teamId: teamBId, mascotId: 'gl-licorne-aube' })
    .expect(200);
  assert.strictEqual(res.body?.mascot?.id, 'gl-licorne-aube');
});

test('POST /api/gl/mascots/assign refuse une mascotte inconnue (404)', async () => {
  await request(app)
    .post('/api/gl/mascots/assign')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ gameId, teamId: teamAId, mascotId: 'gl-inexistante' })
    .expect(404);
});

test('GET /api/gl/mascots?gameId=... renvoie les assignations actuelles', async () => {
  const res = await request(app)
    .get(`/api/gl/mascots?gameId=${gameId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const ids = (res.body?.assignments || []).map((a) => a.mascot_id);
  assert.ok(ids.includes('gl-gnome-mousse'));
  assert.ok(ids.includes('gl-licorne-aube'));
});
