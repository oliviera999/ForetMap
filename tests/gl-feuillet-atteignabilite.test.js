'use strict';

// Atteignabilité et équilibre des feuillets (lot « feuillets d'ouverture ») :
//  - migration 178 : règles génériques de réparation du corpus, idempotentes ;
//  - feuillets d'ouverture donnés à l'équipe au démarrage ;
//  - repli de l'étude d'espèce sur le pool du chapitre ;
//  - garde de portée sur la présentation directe d'un feuillet.

require('./helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne, queryAll, splitSqlStatements } = require('../database');
const { grantStartingFeuilletsToTeam } = require('../lib/glFeuilletStarterGrant');
const { pickFeuilletForSpeciesStudy } = require('../lib/glLoreFeuilletSpeciesReveal');
const { isFeuilletInChapterPool } = require('../lib/glFeuilletChapterPool');
const { canalCandidatesForSource } = require('../lib/glFeuilletAcquisition');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlGameWithTeams,
  assignPlayerToGameTeam,
  signTokens,
} = require('./helpers/glFixtures');

const MIGRATION_FILE = path.join(
  __dirname,
  '..',
  'migrations',
  '178_gl_feuillets_atteignabilite.sql',
);

const db = { queryOne, queryAll, execute };
const stamp = Date.now();
// Biome propre au run : le pool d'un chapitre est un OR (biome / plateau / pays).
// Un biome partagé y ferait entrer les feuillets seedés par d'autres fichiers de test.
const biomeSlug = `atteb${stamp}`.slice(0, 64);
const CODE_OUVERTURE = `atte-ouv-${stamp}`;
const CODE_POOL = `atte-pool-${stamp}`;
const CODE_HORS = `atte-hors-${stamp}`;
const CODE_REPARE = `atte-rep-${stamp}`;
const SPECIES_CODE = `AT${String(stamp).slice(-6)}`;

let chapterId = null;
let gameId = null;
let teamId = null;
let playerId = null;
let playerToken = '';

async function insertFeuillet(code, fields = {}) {
  const columns = {
    feuillet_code: code,
    type: 'feuillet',
    titre: `Feuillet ${code}`,
    statut: 'actif',
    ...fields,
  };
  const keys = Object.keys(columns);
  await execute(
    `INSERT INTO gl_lore_feuillets (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
    keys.map((k) => columns[k]),
  );
}

async function runMigration() {
  const statements = splitSqlStatements(fs.readFileSync(MIGRATION_FILE, 'utf8'));
  for (const stmt of statements) {
    try {
      await execute(stmt);
    } catch (err) {
      // ADD COLUMN rejoué : même tolérance que le runner de migrations.
      if (err?.errno !== 1060) throw err;
    }
  }
}

before(async () => {
  await initSchema();
  const admin = await createGlAdmin({ email: `gl.atte.${stamp}@ecole.local` });
  const cls = await createGlClass({ name: `Classe Atte ${stamp}`, adminId: admin.id });

  await execute('INSERT IGNORE INTO gl_biomes (slug, nom, order_index) VALUES (?, ?, 991)', [
    biomeSlug,
    `Biome Atte ${stamp}`,
  ]);
  // plateau_number NULL : seul le biome (unique au run) fait entrer dans le pool.
  await execute(
    'INSERT INTO gl_chapters (slug, title, plateau_number, order_index) VALUES (?, ?, NULL, 902)',
    [`atte-${stamp}`, `Chapitre Atte ${stamp}`],
  );
  chapterId = Number(
    (await queryOne('SELECT id FROM gl_chapters WHERE slug = ? LIMIT 1', [`atte-${stamp}`])).id,
  );
  await execute(
    'INSERT INTO gl_chapter_biomes (chapter_id, biome_slug, order_index) VALUES (?, ?, 0)',
    [chapterId, biomeSlug],
  );

  await insertFeuillet(CODE_POOL, { biome_slug: biomeSlug, ordre_voyage: 10 });
  await insertFeuillet(CODE_HORS, { titre: 'Hors chapitre' });
  await insertFeuillet(CODE_OUVERTURE, { titre: 'Ouverture', ordre_recit: 1 });
  await execute('UPDATE gl_lore_feuillets SET offert_ouverture = 1 WHERE feuillet_code = ?', [
    CODE_OUVERTURE,
  ]);
  await execute(
    `INSERT INTO gl_species (species_code, biome_slug, type, nom_commun, statut)
     VALUES (?, ?, 'faune', ?, 'actif')`,
    [SPECIES_CODE, biomeSlug, `Espèce Atte ${stamp}`],
  );

  const gameSeed = await createGlGameWithTeams({
    classId: cls.id,
    chapterId,
    createdBy: admin.id,
    teams: [{ name: 'Equipe Atte', type: 'gnome' }],
  });
  gameId = Number(gameSeed.game.id);
  teamId = Number(gameSeed.teams[0].id);
  await execute('UPDATE gl_games SET status = ? WHERE id = ?', ['live', gameId]);

  const player = await createGlPlayer({ classId: cls.id, teamId, pseudo: `atte-${stamp}` });
  playerId = player.id;
  await assignPlayerToGameTeam({ gameId, teamId, playerId: player.id });
  const tokens = await signTokens({ playerId: player.id, teamId, playerPseudo: 'Alice' });
  playerToken = tokens.playerToken;
});

after(async () => {
  await execute('DELETE FROM gl_lore_feuillets WHERE feuillet_code IN (?, ?, ?, ?)', [
    CODE_POOL,
    CODE_HORS,
    CODE_OUVERTURE,
    CODE_REPARE,
  ]);
  await execute('DELETE FROM gl_species WHERE species_code = ?', [SPECIES_CODE]);
});

test('migration 178 : répare effacement « oui », ordres hors échelle et lien_pays contradictoire', async () => {
  await insertFeuillet(CODE_REPARE, {
    effacement: 'oui',
    biome_slug: 'taiga',
    plateau_number: 3,
    lien_pays: 3,
    ordre_voyage: 80042,
    ordre_recit: 80042,
  });
  await runMigration();
  const row = await queryOne(
    'SELECT effacement, ordre_voyage, ordre_recit, lien_pays FROM gl_lore_feuillets WHERE feuillet_code = ?',
    [CODE_REPARE],
  );
  assert.strictEqual(row.effacement, 'partiel', '« oui » était traité comme un effacement total');
  assert.strictEqual(Number(row.ordre_voyage), 3042, 'ordre_voyage = plateau × 1000 + rang');
  assert.strictEqual(Number(row.ordre_recit), 42, 'ordre_recit revient à l’échelle du récit');
  assert.strictEqual(Number(row.lien_pays), 4, 'lien_pays s’aligne sur le pays du biome (taïga)');
});

test('migration 178 : rejouée, elle ne change plus rien', async () => {
  const avant = await queryOne(
    'SELECT effacement, ordre_voyage, ordre_recit, lien_pays FROM gl_lore_feuillets WHERE feuillet_code = ?',
    [CODE_REPARE],
  );
  await runMigration();
  const apres = await queryOne(
    'SELECT effacement, ordre_voyage, ordre_recit, lien_pays FROM gl_lore_feuillets WHERE feuillet_code = ?',
    [CODE_REPARE],
  );
  assert.deepStrictEqual(apres, avant);
});

test('feuillets d’ouverture : attribués à l’équipe, puis idempotents', async () => {
  const premier = await grantStartingFeuilletsToTeam(db, { gameId, teamId, actorId: '1' });
  assert.ok(premier.includes(CODE_OUVERTURE), 'le feuillet d’ouverture doit être attribué');

  const state = await queryOne(
    'SELECT status, unlocked_via, effacement_pct FROM gl_game_feuillet_states WHERE game_id = ? AND team_id = ? AND feuillet_code = ?',
    [gameId, teamId, CODE_OUVERTURE],
  );
  assert.strictEqual(state.status, 'discovered');
  assert.strictEqual(state.unlocked_via, 'ouverture');
  assert.strictEqual(Number(state.effacement_pct), 0, 'un feuillet offert arrive entier');

  const perso = await queryOne(
    'SELECT status FROM gl_player_feuillet_states WHERE player_id = ? AND feuillet_code = ?',
    [playerId, CODE_OUVERTURE],
  );
  assert.ok(perso, 'la possession personnelle est tracée pour les membres de l’équipe');

  const second = await grantStartingFeuilletsToTeam(db, { gameId, teamId, actorId: '1' });
  assert.deepStrictEqual(second, [], 'un feuillet déjà trouvé n’est pas réattribué');
});

test('étude d’espèce : repli sur le pool du chapitre quand le biome n’a pas de pays', async () => {
  const sansChapitre = await pickFeuilletForSpeciesStudy(db, {
    gameId,
    teamId,
    speciesCode: SPECIES_CODE,
    biomeSlug,
  });
  assert.strictEqual(sansChapitre, null, 'sans chapitre, aucun repli possible');

  const avecChapitre = await pickFeuilletForSpeciesStudy(db, {
    gameId,
    teamId,
    chapterId,
    speciesCode: SPECIES_CODE,
    biomeSlug,
  });
  assert.strictEqual(
    avecChapitre?.feuillet_code,
    CODE_POOL,
    'le pool du chapitre prend le relais des feuillets « espece_pays »',
  );
});

test('portée : isFeuilletInChapterPool distingue pool, hors-chapitre et ouverture', async () => {
  assert.strictEqual(
    await isFeuilletInChapterPool(db, { chapterId, feuilletCode: CODE_POOL }),
    true,
  );
  assert.strictEqual(
    await isFeuilletInChapterPool(db, { chapterId, feuilletCode: CODE_HORS }),
    false,
  );
  assert.strictEqual(
    await isFeuilletInChapterPool(db, { chapterId, feuilletCode: CODE_OUVERTURE }),
    true,
    'un feuillet d’ouverture reste présentable dans tous les chapitres',
  );
});

test('POST /present : un joueur ne peut pas faire apparaître un feuillet hors de son chapitre', async () => {
  const refus = await request(app)
    .post(`/api/gl/lore/games/${gameId}/feuillets/${encodeURIComponent(CODE_HORS)}/present`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({});
  assert.strictEqual(refus.status, 404);
  assert.match(refus.body.error, /hors du chapitre/i);

  const ok = await request(app)
    .post(`/api/gl/lore/games/${gameId}/feuillets/${encodeURIComponent(CODE_POOL)}/present`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({});
  assert.strictEqual(ok.status, 200, 'un feuillet du pool reste présentable');
});

test('lien direct : les canaux du corpus (français) correspondent aux ressources (anglais)', () => {
  assert.deepStrictEqual(canalCandidatesForSource('species'), ['species', 'espece']);
  assert.deepStrictEqual(canalCandidatesForSource('glossary'), ['glossary', 'glossaire']);
  assert.deepStrictEqual(canalCandidatesForSource('inconnu'), ['inconnu']);
  assert.deepStrictEqual(canalCandidatesForSource(null), []);
});
