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
let teamAId = null;
let teamBId = null;
let playerId = null;
const stamp = Date.now();

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, ?, 'admin', 1, NOW(), NOW())`,
    [`games-roster-${stamp}@ecole.local`, `MJ roster ${stamp}`]
  );
  const admin = await queryOne('SELECT id FROM gl_admins ORDER BY id DESC LIMIT 1');
  await execute(
    `INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 1, NOW(), NOW())`,
    [`Classe roster ${stamp}`, 'Lyautey', admin.id]
  );
  const cls = await queryOne('SELECT id FROM gl_classes ORDER BY id DESC LIMIT 1');
  const chapter = await queryOne('SELECT id FROM gl_chapters ORDER BY order_index ASC, id ASC LIMIT 1');

  const gameRes = await request(app)
    .post('/api/gl/games')
    .set('Authorization', `Bearer ${await signAuthToken({
      product: 'gl',
      userType: 'gl_admin',
      userId: String(admin.id),
      roleSlug: 'gl_admin',
      permissions: ['gl.read', 'gl.players.manage', 'gl.game.manage', 'gl.team.manage', 'gl.event.emit'],
    })}`)
    .send({ classId: cls.id, chapterId: chapter.id, name: `Partie roster ${stamp}` })
    .expect(201);
  gameId = Number(gameRes.body?.game?.id);

  adminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.players.manage', 'gl.game.manage', 'gl.team.manage', 'gl.event.emit'],
  });

  const teamA = await request(app)
    .post(`/api/gl/games/${gameId}/teams`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Equipe A', type: 'gnome', color: '#22c55e' })
    .expect(201);
  teamAId = Number(teamA.body?.id);

  const teamB = await request(app)
    .post(`/api/gl/games/${gameId}/teams`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Equipe B', type: 'unicorn', color: '#a855f7' })
    .expect(201);
  teamBId = Number(teamB.body?.id);

  const player = await request(app)
    .post('/api/gl/admin/players')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      classId: cls.id,
      firstName: 'Iris',
      lastName: 'Nadal',
      pseudo: `player-roster-${stamp}`,
      password: '1234',
    })
    .expect(201);
  playerId = Number(player.body?.id);
});

test('GET /api/gl/games liste les parties', async () => {
  const res = await request(app)
    .get('/api/gl/games')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.some((g) => Number(g.id) === gameId));
});

test('PUT /api/gl/games/:id/teams/:teamId met à jour une équipe', async () => {
  const res = await request(app)
    .put(`/api/gl/games/${gameId}/teams/${teamAId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Equipe A+', color: '#16a34a' })
    .expect(200);
  assert.equal(res.body?.name, 'Equipe A+');
});

test('roster assign/unassign met à jour les affectations', async () => {
  await request(app)
    .post(`/api/gl/games/${gameId}/roster/assign`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ playerId, teamId: teamAId })
    .expect(200);

  const rosterAssigned = await request(app)
    .get(`/api/gl/games/${gameId}/roster`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const playerAssigned = rosterAssigned.body.find((row) => Number(row.id) === playerId);
  assert.equal(Number(playerAssigned?.teamId), teamAId);

  await request(app)
    .post(`/api/gl/games/${gameId}/roster/assign`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ playerId, teamId: teamBId })
    .expect(200);

  const rosterReassigned = await request(app)
    .get(`/api/gl/games/${gameId}/roster`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const playerReassigned = rosterReassigned.body.find((row) => Number(row.id) === playerId);
  assert.equal(Number(playerReassigned?.teamId), teamBId);

  await request(app)
    .post(`/api/gl/games/${gameId}/roster/unassign`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ playerId })
    .expect(200);
  const rosterUnassigned = await request(app)
    .get(`/api/gl/games/${gameId}/roster`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const playerUnassigned = rosterUnassigned.body.find((row) => Number(row.id) === playerId);
  assert.equal(playerUnassigned?.teamId, null);
});

test('DELETE /api/gl/games/:id/teams/:teamId refuse si équipe non vide', async () => {
  await request(app)
    .post(`/api/gl/games/${gameId}/roster/assign`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ playerId, teamId: teamBId })
    .expect(200);
  await request(app)
    .delete(`/api/gl/games/${gameId}/teams/${teamBId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(409);
  await request(app)
    .post(`/api/gl/games/${gameId}/roster/unassign`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ playerId })
    .expect(200);
});

test('DELETE /api/gl/games/:id/teams/:teamId supprime une équipe vide', async () => {
  await request(app)
    .delete(`/api/gl/games/${gameId}/teams/${teamBId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
});

test('DELETE /api/gl/games/:id refuse si partie live puis accepte en ended', async () => {
  await request(app)
    .post(`/api/gl/games/${gameId}/start`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  await request(app)
    .delete(`/api/gl/games/${gameId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(409);
  await request(app)
    .post(`/api/gl/games/${gameId}/end`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  await request(app)
    .delete(`/api/gl/games/${gameId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
});
