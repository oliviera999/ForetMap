'use strict';

require('./helpers/setup');
const { test, before, after } = require('node:test');
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
// Biome UNIQUE au run : le pool d'attribution est scopé par chapitre → biomes → feuillets.
// Utiliser un biome partagé (« savane ») laissait le pool inclure les feuillets seedés par
// d'autres tests (`gl-lore-*`) et non nettoyés, polluant une 2e exécution de la suite
// (`test` puis `test:coverage`) sur la même BDD. Un biome propre au run rend le test hermétique.
const biomeSlug = `acqb${stamp}`.slice(0, 64);
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
  // Biome propre au run (FK gl_chapter_biomes.biome_slug → gl_biomes.slug).
  await execute('INSERT IGNORE INTO gl_biomes (slug, nom, order_index) VALUES (?, ?, 990)', [
    biomeSlug,
    `Biome Acq ${stamp}`,
  ]);
  await execute(
    'INSERT INTO gl_chapter_biomes (chapter_id, biome_slug, order_index) VALUES (?, ?, 0)',
    [chapterId, biomeSlug],
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
     VALUES (?, ?, ?, ?, ?, 1)`,
    [code, 'Feuillet acquis', 'Incipit acquis', 'Texte accessible acquis', biomeSlug],
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

after(async () => {
  // Isolation : sans ce nettoyage, le feuillet seedé reste dans le pool GLOBAL
  // (gl_lore_feuillets) et pollue une SECONDE exécution de la suite sur la même
  // BDD partagée (la CI enchaîne `npm test` puis `npm run test:coverage`) : le
  // deuxième run attribuerait alors ce feuillet résiduel au lieu du sien.
  await execute('DELETE FROM gl_game_feuillet_states WHERE feuillet_code = ?', [code]).catch(
    () => {},
  );
  await execute('DELETE FROM gl_lore_feuillets WHERE feuillet_code = ?', [code]).catch(() => {});
  // gl_chapter_biomes.biome_slug → gl_biomes (FK RESTRICT) : retirer les liaisons avant le biome.
  await execute('DELETE FROM gl_chapter_biomes WHERE biome_slug = ?', [biomeSlug]).catch(() => {});
  await execute('DELETE FROM gl_biomes WHERE slug = ?', [biomeSlug]).catch(() => {});
});
