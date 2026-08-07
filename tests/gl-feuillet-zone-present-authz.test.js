'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { getFeuilletZoneById } = require('../lib/glFeuilletZonesCatalog');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlGameWithTeams,
  assignPlayerToGameTeam,
  signTokens,
} = require('./helpers/glFixtures');

const stamp = Date.now();

let adminToken = '';
let playerToken = '';
let gameId = null;
let teamId = null;

before(async () => {
  await initSchema();

  const admin = await createGlAdmin({
    email: `fz.authz.${stamp}@ecole.local`,
    displayName: 'MJ FZ Authz',
  });
  const cls = await createGlClass({
    name: `Classe FZ Authz ${stamp}`,
    school: 'Ecole',
    adminId: admin.id,
  });
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
  assert.ok(chapter, 'chapitre foret-magique requis');
  await execute('UPDATE gl_chapters SET plateau_number = 1 WHERE id = ?', [chapter.id]);

  const gameSeed = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    teams: [{ name: 'Equipe FZ Authz', type: 'gnome' }],
  });
  gameId = Number(gameSeed.game.id);
  teamId = Number(gameSeed.teams[0].id);

  const player = await createGlPlayer({
    classId: cls.id,
    teamId,
    pseudo: `fz-authz-${stamp}`,
    healthPoints: 5,
    powerPoints: 5,
  });
  await assignPlayerToGameTeam({ gameId, teamId, playerId: player.id });
  await execute('UPDATE gl_games SET status = ? WHERE id = ?', ['live', gameId]);

  const tokens = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.game.manage', 'gl.mascot.position'],
    playerId: player.id,
  });
  adminToken = tokens.adminToken;
  playerToken = tokens.playerToken;
});

test('joueur hors zone : present refuse 409 (anti farm)', async () => {
  await execute(
    'UPDATE gl_teams SET position_marker_id = NULL, position_x_pct = 90, position_y_pct = 90 WHERE id = ?',
    [teamId],
  );
  const res = await request(app)
    .post(`/api/gl/games/${gameId}/feuillet-zones/zf-p1-01/present`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({})
    .expect(409);
  assert.match(String(res.body?.error || ''), /hors/i);
});

test('joueur dans le polygone : present OK', async () => {
  const zone = getFeuilletZoneById('zf-p1-02');
  const [cx, cy] = zone.centre;
  await execute(
    'UPDATE gl_teams SET position_marker_id = NULL, position_x_pct = ?, position_y_pct = ? WHERE id = ?',
    [cx * 100, cy * 100, teamId],
  );
  const res = await request(app)
    .post(`/api/gl/games/${gameId}/feuillet-zones/zf-p1-02/present`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({})
    .expect(200);
  assert.strictEqual(res.body?.zone?.zoneId, 'zf-p1-02');
});

test('MJ peut présenter une zone à distance', async () => {
  await execute(
    'UPDATE gl_teams SET position_marker_id = NULL, position_x_pct = 1, position_y_pct = 1 WHERE id = ?',
    [teamId],
  );
  const res = await request(app)
    .post(`/api/gl/games/${gameId}/feuillet-zones/zf-p1-03/present`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ teamId })
    .expect(200);
  assert.strictEqual(res.body?.zone?.zoneId, 'zf-p1-03');
});
