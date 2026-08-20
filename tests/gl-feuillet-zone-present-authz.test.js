'use strict';

/**
 * Anti-farm des zones feuillets : un joueur ne récolte les cœurs et les gemmes d'une zone
 * qu'en y étant réellement. Sans cette garde, les 24 zones du catalogue se présentaient
 * depuis une chaise. Le MJ, lui, garde la présentation à distance.
 */

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
  createGlGameWithTeams,
  createGlPlayer,
  assignPlayerToGameTeam,
  signTokens,
} = require('./helpers/glFixtures');

const ZONE_ID = 'zf-p1-01';
const OTHER_ZONE_ID = 'zf-p1-02';
const stamp = Date.now();

let adminToken = '';
let playerToken = '';
let gameId = null;
let teamId = null;

/** Pose la mascotte de l'équipe en coordonnées % (position libre, sans repère). */
async function placeTeamAt(xPct, yPct) {
  await execute(
    'UPDATE gl_teams SET position_x_pct = ?, position_y_pct = ?, position_marker_id = NULL WHERE id = ?',
    [xPct, yPct, teamId],
  );
}

/** Centre déclaré d'une zone du catalogue, en % — donc à coup sûr dans son polygone. */
function zoneCentrePct(zoneId) {
  const [cx, cy] = getFeuilletZoneById(zoneId).centre;
  return { x: cx * 100, y: cy * 100 };
}

before(async () => {
  await initSchema();
  const admin = await createGlAdmin({ email: `gl.fzauthz.${stamp}@ecole.local` });
  const cls = await createGlClass({ name: `Classe FZAuthz ${stamp}`, adminId: admin.id });
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
  await execute('UPDATE gl_chapters SET plateau_number = 1 WHERE id = ?', [chapter.id]);

  const gameSeed = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    teams: [{ name: 'Equipe FZAuthz', type: 'gnome' }],
  });
  gameId = Number(gameSeed.game.id);
  teamId = Number(gameSeed.teams[0].id);

  const player = await createGlPlayer({ classId: cls.id, teamId, pseudo: `fza-${stamp}` });
  await assignPlayerToGameTeam({ gameId, teamId, playerId: player.id });
  await execute('UPDATE gl_games SET status = ? WHERE id = ?', ['live', gameId]);

  const tokens = await signTokens({
    adminId: admin.id,
    playerId: player.id,
    playerPseudo: player.pseudo,
    teamId,
    adminPermissions: ['gl.read', 'gl.game.manage', 'gl.mascot.position'],
    playerPermissions: ['gl.read', 'gl.action.request'],
  });
  adminToken = tokens.adminToken;
  playerToken = tokens.playerToken;
});

test('joueur hors de la zone : refus 409, rien n’est encaissé', async () => {
  const far = zoneCentrePct(OTHER_ZONE_ID);
  await placeTeamAt(far.x, far.y);

  const res = await request(app)
    .post(`/api/gl/games/${gameId}/feuillet-zones/${ZONE_ID}/present`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({})
    .expect(409);
  assert.match(String(res.body?.error || ''), /pas dans cette zone/i);

  const presented = await request(app)
    .get(`/api/gl/games/${gameId}/feuillet-zones/presented?teamId=${teamId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(!(presented.body?.zoneIds || []).includes(ZONE_ID), 'aucune zone enregistrée');
});

test('joueur sans position connue : refus 409 (et non « au coin du plateau »)', async () => {
  await execute(
    'UPDATE gl_teams SET position_x_pct = NULL, position_y_pct = NULL, position_marker_id = NULL WHERE id = ?',
    [teamId],
  );
  await request(app)
    .post(`/api/gl/games/${gameId}/feuillet-zones/${ZONE_ID}/present`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({})
    .expect(409);
});

test('joueur dans la zone : la présentation aboutit', async () => {
  const centre = zoneCentrePct(ZONE_ID);
  await placeTeamAt(centre.x, centre.y);

  const res = await request(app)
    .post(`/api/gl/games/${gameId}/feuillet-zones/${ZONE_ID}/present`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({})
    .expect(200);
  assert.strictEqual(res.body?.zone?.zoneId, ZONE_ID);
});

test('le MJ présente à distance : la garde ne vise que les joueurs', async () => {
  const far = zoneCentrePct(ZONE_ID);
  await placeTeamAt(far.x, far.y);

  const res = await request(app)
    .post(`/api/gl/games/${gameId}/feuillet-zones/${OTHER_ZONE_ID}/present`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ teamId })
    .expect(200);
  assert.strictEqual(res.body?.zone?.zoneId, OTHER_ZONE_ID);
});
