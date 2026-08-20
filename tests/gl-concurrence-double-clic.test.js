'use strict';

/**
 * Double clic, deux onglets, deux membres de la même équipe : les gardes « une seule fois »
 * du jeu étaient toutes bâties sur le même schéma « je lis, puis j'écris ». Entre la lecture
 * et l'écriture, une seconde requête lisait la même valeur périmée et concluait elle aussi
 * « pas encore fait ». Résultat : deux fois les cœurs d'un repère, deux jets de dés pour un
 * tour, deux présentations d'une même zone feuillet.
 *
 * Ces tests lancent deux requêtes réellement simultanées et vérifient qu'il n'en aboutit
 * qu'une seule — et que la vitalité n'a bougé que d'un cran.
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne, queryAll, withTransaction } = require('../database');
const { applyMarkerVitalityEffects } = require('../lib/glMarkerVitalityEffects');
const { insertGameEvent } = require('../lib/glGameEvents');
const { getGameplaySettings } = require('../lib/glSettings');
const { invalidateGameplayCache } = require('../lib/glSettings');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlGameWithTeams,
  assignPlayerToGameTeam,
  signTokens,
} = require('./helpers/glFixtures');

const ZONE_ID = 'zf-p1-01';
const stamp = Date.now();

let adminToken = '';
let playerToken = '';
let gameId = null;
let teamId = null;
let playerId = null;
let markerId = null;
let lockMarkerId = null;
let previousTurnsEnabled = null;

async function setSetting(key, value) {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
    [key, JSON.stringify(value)],
  );
  invalidateGameplayCache();
}

/** Statuts des deux réponses, triés : facilite les assertions « une seule a abouti ». */
function statusesOf(results) {
  return results.map((r) => r.status).sort((a, b) => a - b);
}

before(async () => {
  await initSchema();

  const turnsRow = await queryOne(
    "SELECT value_json FROM gl_settings WHERE `key` = 'gameplay.turns_enabled' LIMIT 1",
  );
  previousTurnsEnabled = turnsRow ? turnsRow.value_json : null;
  await setSetting('gameplay.vitality_enabled', true);
  await setSetting('gameplay.turns_enabled', true);

  const admin = await createGlAdmin({
    email: `concu.mj.${stamp}@ecole.local`,
    displayName: 'MJ Concurrence',
  });
  const cls = await createGlClass({
    name: `Classe Concurrence ${stamp}`,
    school: 'Ecole',
    adminId: admin.id,
  });

  await execute(
    `INSERT INTO gl_chapters (slug, title, biome, order_index, plateau_number, created_at, updated_at)
     VALUES (?, ?, 'foret', 0, 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE title = VALUES(title), plateau_number = 1, updated_at = NOW()`,
    [`ch-concu-${stamp}`, `Chapitre concurrence ${stamp}`],
  );
  const chapter = await queryOne('SELECT id FROM gl_chapters WHERE slug = ? LIMIT 1', [
    `ch-concu-${stamp}`,
  ]);

  await execute(
    `INSERT INTO gl_chapter_markers
      (chapter_id, x_pct, y_pct, event_type, label, description, event_config_json, order_index)
     VALUES (?, 40, 40, 'event', 'Bonus concurrence', 'Repere test', ?, 0)`,
    [
      chapter.id,
      JSON.stringify({ version: 2, effects: { neutral: { deltaPv: 1, deltaGems: 0 } } }),
    ],
  );
  const marker = await queryOne(
    'SELECT id FROM gl_chapter_markers WHERE chapter_id = ? ORDER BY id DESC LIMIT 1',
    [chapter.id],
  );
  markerId = Number(marker.id);

  // Second repère, réservé au test d'entrelacement contrôlé (le premier est consommé).
  await execute(
    `INSERT INTO gl_chapter_markers
      (chapter_id, x_pct, y_pct, event_type, label, description, event_config_json, order_index)
     VALUES (?, 60, 60, 'event', 'Bonus verrou', 'Repere verrou', ?, 1)`,
    [
      chapter.id,
      JSON.stringify({ version: 2, effects: { neutral: { deltaPv: 1, deltaGems: 0 } } }),
    ],
  );
  const lockMarker = await queryOne(
    'SELECT id FROM gl_chapter_markers WHERE chapter_id = ? ORDER BY id DESC LIMIT 1',
    [chapter.id],
  );
  lockMarkerId = Number(lockMarker.id);

  const gameSeed = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    teams: [{ name: 'Equipe Concurrence', type: 'gnome' }],
  });
  gameId = Number(gameSeed.game.id);
  teamId = Number(gameSeed.teams[0].id);

  const player = await createGlPlayer({
    classId: cls.id,
    pseudo: `concu-${stamp}`,
    healthPoints: 3,
    powerPoints: 3,
  });
  playerId = Number(player.id);
  await assignPlayerToGameTeam({ gameId, teamId, playerId });

  await execute(
    'UPDATE gl_games SET status = ?, current_team_id = ?, current_round_number = 1 WHERE id = ?',
    ['live', teamId, gameId],
  );

  const tokens = await signTokens({
    adminId: admin.id,
    playerId,
    playerPseudo: player.pseudo,
    teamId,
    adminPermissions: ['gl.read', 'gl.game.manage', 'gl.mascot.position', 'gl.event.emit'],
    playerPermissions: ['gl.read', 'gl.action.request'],
  });
  adminToken = tokens.adminToken;
  playerToken = tokens.playerToken;
});

after(async () => {
  if (previousTurnsEnabled == null) {
    await execute("DELETE FROM gl_settings WHERE `key` = 'gameplay.turns_enabled'");
    invalidateGameplayCache();
  } else {
    await execute(
      "UPDATE gl_settings SET value_json = ?, updated_at = NOW() WHERE `key` = 'gameplay.turns_enabled'",
      [previousTurnsEnabled],
    );
    invalidateGameplayCache();
  }
});

test('apply-effects simultanés : un seul crédite l’équipe', async () => {
  const before = await queryOne('SELECT health_points FROM gl_players WHERE id = ? LIMIT 1', [
    playerId,
  ]);

  const fire = () =>
    request(app)
      .post(`/api/gl/games/${gameId}/markers/${markerId}/apply-effects`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teamId });
  const results = await Promise.all([fire(), fire()]);

  assert.deepStrictEqual(statusesOf(results), [200, 409], 'une seule application doit aboutir');

  const after = await queryOne('SELECT health_points FROM gl_players WHERE id = ? LIMIT 1', [
    playerId,
  ]);
  assert.strictEqual(
    Number(after.health_points),
    Number(before.health_points) + 1,
    'le cœur du repère ne doit être encaissé qu’une fois',
  );

  const events = await queryAll(
    "SELECT id FROM gl_game_events WHERE game_id = ? AND team_id = ? AND event_type = 'marker_effect'",
    [gameId, teamId],
  );
  assert.strictEqual(events.length, 1, 'un seul événement marker_effect');
});

test('jets de dés simultanés : un seul consomme le tour', async () => {
  const fire = () =>
    request(app)
      .post(`/api/gl/games/${gameId}/teams/${teamId}/dice-roll`)
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ values: [4], total: 4 });
  const results = await Promise.all([fire(), fire()]);

  assert.deepStrictEqual(statusesOf(results), [201, 409], 'un seul jet doit être enregistré');

  const events = await queryAll(
    "SELECT id FROM gl_game_events WHERE game_id = ? AND team_id = ? AND event_type = 'dice_roll'",
    [gameId, teamId],
  );
  assert.strictEqual(events.length, 1, 'un seul événement dice_roll pour ce tour');
});

test('présentations simultanées d’une zone feuillet : une seule aboutit', async () => {
  const fire = () =>
    request(app)
      .post(`/api/gl/games/${gameId}/feuillet-zones/${ZONE_ID}/present`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teamId });
  const results = await Promise.all([fire(), fire()]);

  assert.deepStrictEqual(statusesOf(results), [200, 409], 'une seule présentation doit aboutir');

  const events = await queryAll(
    `SELECT payload_json FROM gl_game_events
      WHERE game_id = ? AND team_id = ? AND event_type = 'feuillet_zone_presented'`,
    [gameId, teamId],
  );
  const forZone = events.filter((evt) => {
    try {
      return String(JSON.parse(evt.payload_json || '{}').zoneId || '') === ZONE_ID;
    } catch (_) {
      return false;
    }
  });
  assert.strictEqual(forZone.length, 1, 'un seul événement de présentation pour cette zone');
});

test('effet de repère : la seconde transaction attend le verrou puis constate le doublon', async () => {
  // Entrelacement forcé, là où deux requêtes HTTP ne le reproduisent qu'au hasard : T1 garde
  // sa transaction ouverte (donc le verrou d'équipe) le temps que T2 démarre. Sans verrou,
  // T2 lit un journal encore vide et applique une seconde fois les cœurs.
  const settings = await getGameplaySettings();
  const marker = await queryOne(
    `SELECT id, chapter_id, event_type, label, event_config_json
       FROM gl_chapter_markers WHERE id = ? LIMIT 1`,
    [lockMarkerId],
  );
  const args = {
    gameId,
    teamId,
    marker,
    teamType: 'gnome',
    settings,
    skipIfAlreadyApplied: true,
  };

  let releaseFirst = null;
  const firstHeld = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  let signalFirstReady = null;
  const firstReady = new Promise((resolve) => {
    signalFirstReady = resolve;
  });

  const firstTx = withTransaction(async (tx) => {
    const result = await applyMarkerVitalityEffects(tx, args);
    await insertGameEvent(tx, {
      gameId,
      teamId,
      actorType: 'mj',
      actorId: 'test',
      eventType: 'marker_effect',
      payload: { markerId: lockMarkerId },
    });
    signalFirstReady();
    await firstHeld;
    return result;
  });

  await firstReady;
  const secondTx = withTransaction(async (tx) => applyMarkerVitalityEffects(tx, args));
  // Laisse à T2 le temps d'atteindre le verrou (et de s'y bloquer) avant de libérer T1.
  await new Promise((resolve) => setTimeout(resolve, 200));
  releaseFirst();

  const [first, second] = await Promise.all([firstTx, secondTx]);
  assert.strictEqual(first.applied, true, 'la première application aboutit');
  assert.strictEqual(second.applied, false, 'la seconde ne doit rien appliquer');
  assert.strictEqual(
    second.alreadyApplied,
    true,
    'la seconde doit voir l’événement de la première',
  );
});
