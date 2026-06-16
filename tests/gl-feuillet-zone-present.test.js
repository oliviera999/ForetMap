'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const {
  createGlAdmin,
  createGlClass,
  createGlGameWithTeams,
  createGlPlayer,
  assignPlayerToGameTeam,
  signTokens,
} = require('./helpers/glFixtures');

let adminToken = '';
let gameId = null;
let teamId = null;
const stamp = Date.now();

before(async () => {
  await initSchema();
  const admin = await createGlAdmin({
    email: `gl.fz.${stamp}@ecole.local`,
    displayName: 'MJ Feuillet Zones',
  });
  const cls = await createGlClass({
    name: `Classe FZ ${stamp}`,
    school: 'Ecole',
    adminId: admin.id,
  });
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
  await execute('UPDATE gl_chapters SET plateau_number = 1 WHERE id = ?', [chapter.id]);
  const gameSeed = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    teams: [{ name: 'Equipe FZ', type: 'gnome' }],
  });
  gameId = Number(gameSeed.game.id);
  teamId = Number(gameSeed.teams[0].id);
  const player = await createGlPlayer({
    classId: cls.id,
    teamId,
    pseudo: `fz-player-${stamp}`,
  });
  await assignPlayerToGameTeam({ gameId, teamId, playerId: player.id });
  await execute('UPDATE gl_games SET status = ?, current_team_id = ? WHERE id = ?', [
    'live',
    teamId,
    gameId,
  ]);

  const tokens = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.game.manage', 'gl.mascot.position'],
  });
  adminToken = tokens.adminToken;
});

test('POST feuillet-zones present enregistre et renvoie le popover', async () => {
  const res = await request(app)
    .post(`/api/gl/games/${gameId}/feuillet-zones/zf-p1-01/present`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ teamId })
    .expect(200);
  assert.strictEqual(res.body?.zone?.zoneId, 'zf-p1-01');
  assert.match(String(res.body?.zone?.popover || ''), /Selene/);
});

test('GET feuillet-zones presented liste la zone', async () => {
  const res = await request(app)
    .get(`/api/gl/games/${gameId}/feuillet-zones/presented?teamId=${teamId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok((res.body?.zoneIds || []).includes('zf-p1-01'));
});

test('POST feuillet-zones present refuse une seconde fois', async () => {
  await request(app)
    .post(`/api/gl/games/${gameId}/feuillet-zones/zf-p1-01/present`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ teamId })
    .expect(409);
});
