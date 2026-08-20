'use strict';

/**
 * Anti-farm des effets de repère : « présenter une arrivée » suppose d'être arrivé.
 *
 * Deux gardes distinctes sont vérifiées ici :
 *  - un joueur ne déclenche les effets que du repère où se tient son équipe ;
 *  - `playerIds`, qui cible un sous-ensemble de joueurs, est réservé au MJ et n'accepte
 *    que des membres du roster de l'équipe.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { invalidateGameplayCache } = require('../lib/glSettings');
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
let markerId = null;
let otherMarkerId = null;
let memberId = null;
let outsiderId = null;

async function makeMarker(chapterId, label, xPct) {
  await execute(
    `INSERT INTO gl_chapter_markers
      (chapter_id, x_pct, y_pct, event_type, label, description, event_config_json, order_index)
     VALUES (?, ?, 40, 'event', ?, 'Repère test', ?, 0)`,
    [
      chapterId,
      xPct,
      label,
      JSON.stringify({ version: 2, effects: { neutral: { deltaPv: 1, deltaGems: -1 } } }),
    ],
  );
  const row = await queryOne(
    'SELECT id FROM gl_chapter_markers WHERE chapter_id = ? ORDER BY id DESC LIMIT 1',
    [chapterId],
  );
  return Number(row.id);
}

/** Place l'équipe sur un repère (ou nulle part si `null`). */
async function placeTeamOn(markerIdOrNull) {
  await execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [
    markerIdOrNull,
    teamId,
  ]);
}

/** Efface la trace « effet déjà appliqué » pour rejouer le même repère. */
async function resetMarkerEffects() {
  await execute(
    `DELETE FROM gl_game_events
      WHERE game_id = ? AND team_id = ? AND event_type IN ('marker_effect', 'marker_arrival')`,
    [gameId, teamId],
  );
}

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.vitality_enabled', 'true', NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
  );
  invalidateGameplayCache();

  const admin = await createGlAdmin({ email: `marker.authz.${stamp}@ecole.local` });
  const cls = await createGlClass({ name: `Classe MarkerAuthz ${stamp}`, adminId: admin.id });
  await execute(
    `INSERT INTO gl_chapters (slug, title, biome, order_index, created_at, updated_at)
     VALUES (?, ?, 'foret', 0, NOW(), NOW())`,
    [`ch-marker-authz-${stamp}`, `Chapitre marker authz ${stamp}`],
  );
  const chapter = await queryOne('SELECT id FROM gl_chapters WHERE slug = ? LIMIT 1', [
    `ch-marker-authz-${stamp}`,
  ]);

  markerId = await makeMarker(chapter.id, 'Repère où se tient l’équipe', 40);
  otherMarkerId = await makeMarker(chapter.id, 'Repère à l’autre bout', 70);

  const gameSeed = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    teams: [{ name: 'Equipe MA', type: 'gnome' }],
  });
  gameId = Number(gameSeed.game.id);
  teamId = Number(gameSeed.teams[0].id);

  const member = await createGlPlayer({
    classId: cls.id,
    pseudo: `ma-membre-${stamp}`,
    healthPoints: 3,
    powerPoints: 3,
  });
  // Même classe, mais jamais inscrit dans l'équipe : c'est la cible interdite.
  const outsider = await createGlPlayer({
    classId: cls.id,
    pseudo: `ma-etranger-${stamp}`,
    healthPoints: 3,
    powerPoints: 3,
  });
  memberId = Number(member.id);
  outsiderId = Number(outsider.id);
  await assignPlayerToGameTeam({ gameId, teamId, playerId: memberId });

  await execute('UPDATE gl_games SET status = ?, current_team_id = ? WHERE id = ?', [
    'live',
    teamId,
    gameId,
  ]);

  const tokens = await signTokens({
    adminId: admin.id,
    playerId: member.id,
    playerPseudo: member.pseudo,
    teamId,
    adminPermissions: ['gl.read', 'gl.game.manage', 'gl.mascot.position', 'gl.event.emit'],
    playerPermissions: ['gl.read', 'gl.action.request'],
  });
  adminToken = tokens.adminToken;
  playerToken = tokens.playerToken;
});

test('joueur sur un autre repère : refus 409, aucune vitalité appliquée', async () => {
  await placeTeamOn(markerId);
  const before = await queryOne('SELECT health_points FROM gl_players WHERE id = ?', [memberId]);

  const res = await request(app)
    .post(`/api/gl/games/${gameId}/markers/${otherMarkerId}/present-arrival`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({})
    .expect(409);
  assert.match(String(res.body?.error || ''), /pas sur ce repère/i);

  const after = await queryOne('SELECT health_points FROM gl_players WHERE id = ?', [memberId]);
  assert.strictEqual(Number(after.health_points), Number(before.health_points));
});

test('joueur nulle part sur le plateau : refus 409', async () => {
  await placeTeamOn(null);
  await request(app)
    .post(`/api/gl/games/${gameId}/markers/${markerId}/present-arrival`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({})
    .expect(409);
});

test('joueur sur le bon repère : les effets s’appliquent à toute l’équipe', async () => {
  await placeTeamOn(markerId);
  await resetMarkerEffects();

  const res = await request(app)
    .post(`/api/gl/games/${gameId}/markers/${markerId}/present-arrival`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({})
    .expect(200);
  assert.strictEqual(res.body?.vitality?.applied, true);
  assert.strictEqual(res.body?.vitality?.target, 'team');
});

test('joueur : `playerIds` est ignoré — jamais de ciblage choisi par l’élève', async () => {
  await placeTeamOn(markerId);
  await resetMarkerEffects();

  const res = await request(app)
    .post(`/api/gl/games/${gameId}/markers/${markerId}/present-arrival`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ playerIds: [memberId] })
    .expect(200);
  assert.strictEqual(res.body?.vitality?.target, 'team', 'ciblage refusé au joueur');
});

test('MJ : cibler un joueur hors du roster est refusé (400)', async () => {
  await placeTeamOn(markerId);
  await resetMarkerEffects();
  const before = await queryOne('SELECT health_points FROM gl_players WHERE id = ?', [outsiderId]);

  const res = await request(app)
    .post(`/api/gl/games/${gameId}/markers/${markerId}/present-arrival`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ teamId, playerIds: [outsiderId] })
    .expect(400);
  assert.match(String(res.body?.error || ''), /n’appartiennent pas à cette équipe/i);

  const after = await queryOne('SELECT health_points FROM gl_players WHERE id = ?', [outsiderId]);
  assert.strictEqual(
    Number(after.health_points),
    Number(before.health_points),
    'le joueur hors équipe ne doit pas être touché',
  );
});

test('MJ : cibler un membre du roster reste possible', async () => {
  await placeTeamOn(markerId);
  await resetMarkerEffects();

  const res = await request(app)
    .post(`/api/gl/games/${gameId}/markers/${markerId}/present-arrival`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ teamId, playerIds: [memberId] })
    .expect(200);
  assert.strictEqual(res.body?.vitality?.target, 'players');
});
