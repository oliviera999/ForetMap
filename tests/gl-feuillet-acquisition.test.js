'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne, queryAll } = require('../database');
const { awardFeuilletFromConsultation } = require('../lib/glFeuilletAcquisition');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlGameWithTeams,
  assignPlayerToGameTeam,
  signTokens,
} = require('./helpers/glFixtures');

const db = { queryOne, queryAll, execute };
const stamp = Date.now();
const code = `test-acq-${stamp}`;
let playerToken = '';
let gameId = null;
let teamId = null;
let playerId = null;

before(async () => {
  await initSchema();
  const admin = await createGlAdmin({ email: `gl.acq.${stamp}@ecole.local` });
  const cls = await createGlClass({ name: `Classe Acq ${stamp}`, adminId: admin.id });
  await execute(
    'INSERT INTO gl_chapters (slug, title, plateau_number, order_index) VALUES (?, ?, 1, 901)',
    [`acq-${stamp}`, `Chapitre Acq ${stamp}`],
  );
  const chapter = await queryOne('SELECT id FROM gl_chapters WHERE slug = ? LIMIT 1', [
    `acq-${stamp}`,
  ]);
  const chapterId = Number(chapter.id);
  await execute(
    'INSERT INTO gl_chapter_biomes (chapter_id, biome_slug, order_index) VALUES (?, ?, 0)',
    [chapterId, 'savane'],
  );
  const gameSeed = await createGlGameWithTeams({
    classId: cls.id,
    chapterId,
    createdBy: admin.id,
    teams: [{ name: 'Equipe Acq', type: 'gnome' }],
  });
  gameId = Number(gameSeed.game.id);
  teamId = Number(gameSeed.teams[0].id);
  await execute('UPDATE gl_games SET status = ? WHERE id = ?', ['live', gameId]);

  const player = await createGlPlayer({ classId: cls.id, teamId, pseudo: `acq-${stamp}` });
  playerId = player.id;
  await assignPlayerToGameTeam({ gameId, teamId, playerId: player.id });
  const tokens = await signTokens({ playerId: player.id, teamId, playerPseudo: 'Alice' });
  playerToken = tokens.playerToken;

  // Un feuillet du pool (biome du chapitre).
  await execute(
    `INSERT INTO gl_lore_feuillets (feuillet_code, titre, incipit, texte_accessible, biome_slug, ordre_voyage)
     VALUES (?, ?, ?, ?, 'savane', 1)`,
    [code, 'Feuillet acquis', 'Incipit acquis', 'Texte accessible acquis'],
  );
});

test('awardFeuilletFromConsultation : attribue un feuillet du pool avec le découvreur', async () => {
  const awarded = await awardFeuilletFromConsultation(db, {
    gameId,
    teamId,
    playerId,
    playerName: 'Alice',
    source: 'ecosystem',
    sourceRef: 'ECO-1',
  });
  assert.ok(awarded, 'un feuillet doit être attribué');
  assert.strictEqual(awarded.feuilletCode, code);
  assert.strictEqual(awarded.discoveredBy, 'Alice');
  assert.strictEqual(awarded.discoveredSource, 'ecosystem');

  const state = await queryOne(
    'SELECT status, discovered_by_name, discovered_source FROM gl_game_feuillet_states WHERE game_id = ? AND team_id = ? AND feuillet_code = ? LIMIT 1',
    [gameId, teamId, code],
  );
  assert.strictEqual(state.status, 'discovered');
  assert.strictEqual(state.discovered_by_name, 'Alice');
  assert.strictEqual(state.discovered_source, 'ecosystem');
});

test('Carnet joueur : le feuillet acquis apparaît trouvé avec son découvreur', async () => {
  const res = await request(app)
    .get('/api/gl/lore/feuillets')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  const item = res.body.items.find((i) => i.feuilletCode === code);
  assert.ok(item);
  assert.strictEqual(item.progressStatus, 'discovered');
  assert.strictEqual(item.discoveredBy, 'Alice');
  assert.strictEqual(item.displayText, 'Texte accessible acquis');
});

test('awardFeuilletFromConsultation : rien de neuf → null (pool épuisé)', async () => {
  const again = await awardFeuilletFromConsultation(db, {
    gameId,
    teamId,
    playerId,
    playerName: 'Alice',
    source: 'ecosystem',
    sourceRef: 'ECO-2',
  });
  assert.strictEqual(again, null);
});
