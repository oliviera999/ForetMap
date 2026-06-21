'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne, queryAll } = require('../database');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlGameWithTeams,
  assignPlayerToGameTeam,
  signTokens,
} = require('./helpers/glFixtures');
const { biomeToPays } = require('../lib/glLoreFeuilletSpeciesReveal');

const stamp = Date.now();
let playerToken = '';
let gameId = null;
let teamId = null;
let playerId = null;

const PAYS5_FEUILLETS = ['test-p5-a', 'test-p5-b', 'test-p5-c', 'test-p5-d', 'test-p5-e'];
const TUNDRA_SPECIES = ['SP-T01', 'SP-T02', 'SP-T03', 'SP-T04', 'SP-T05'];

before(async () => {
  await initSchema();

  const admin = await createGlAdmin({ email: `gl.reveal.${stamp}@ecole.local` });
  const cls = await createGlClass({ name: `Classe Reveal ${stamp}`, adminId: admin.id });
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
  const gameSeed = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: Number(chapter.id),
    createdBy: admin.id,
    teams: [{ name: 'Equipe Reveal', type: 'gnome' }],
  });
  gameId = Number(gameSeed.game.id);
  teamId = Number(gameSeed.teams[0].id);
  await execute('UPDATE gl_games SET status = ? WHERE id = ?', ['live', gameId]);

  const player = await createGlPlayer({
    classId: cls.id,
    teamId,
    pseudo: `reveal-player-${stamp}`,
  });
  playerId = player.id;
  await assignPlayerToGameTeam({ gameId, teamId, playerId });

  const tokens = await signTokens({ playerId: player.id, teamId });
  playerToken = tokens.playerToken;

  for (let i = 0; i < PAYS5_FEUILLETS.length; i += 1) {
    const code = PAYS5_FEUILLETS[i];
    await execute(
      `INSERT INTO gl_lore_feuillets (
         feuillet_code, type, titre, biome_slug, ordre_voyage, ordre_liasse, ordre_recit,
         mode_apparition, effacement, vierge, cout_gemme, gain_coeur,
         lien_canal, lien_pays, lien_ordre_recit, statut, created_at, updated_at
       ) VALUES (?, 'feuillet', ?, 'toundra', 900, 1, ?, 'boite', 'non', 0, 0, 0,
         'espece_pays', 5, ?, 'actif', NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         lien_canal = VALUES(lien_canal),
         lien_pays = VALUES(lien_pays),
         lien_ordre_recit = VALUES(lien_ordre_recit),
         statut = 'actif',
         updated_at = NOW()`,
      [code, `Feuillet pays 5 #${i + 1}`, i + 1, i + 1],
    );
  }

  await execute(
    `INSERT INTO gl_lore_feuillets (
       feuillet_code, type, titre, biome_slug, ordre_voyage, ordre_liasse, ordre_recit,
       mode_apparition, effacement, vierge, cout_gemme, gain_coeur,
       lien_canal, lien_ref, statut, created_at, updated_at
     ) VALUES ('ep-VI-06', 'feuillet', 'Ours polaire dédié', 'toundra', 901, 1, 1, 'boite', 'non', 0, 0, 0,
       'espece', 'SP0049', 'actif', NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       lien_canal = VALUES(lien_canal),
       lien_ref = VALUES(lien_ref),
       statut = 'actif',
       updated_at = NOW()`,
  );

  for (const code of TUNDRA_SPECIES) {
    await execute(
      `INSERT INTO gl_species (
         species_code, biome_slug, type, nom_commun, nom_scientifique, statut, created_at, updated_at
       ) VALUES (?, 'toundra', 'faune', ?, 'Testus tundra', 'actif', NOW(), NOW())
       ON DUPLICATE KEY UPDATE biome_slug = 'toundra', statut = 'actif', updated_at = NOW()`,
      [code, `Espèce toundra ${code}`],
    );
  }

  await execute(
    `INSERT INTO gl_species (
       species_code, biome_slug, type, nom_commun, nom_scientifique, statut, created_at, updated_at
     ) VALUES ('SP0049', 'toundra', 'faune', 'Ours polaire', 'Ursus maritimus', 'actif', NOW(), NOW())
     ON DUPLICATE KEY UPDATE biome_slug = 'toundra', statut = 'actif', updated_at = NOW()`,
  );
});

test('biomeToPays mappe le parcours équateur→pôle', () => {
  assert.strictEqual(biomeToPays('toundra'), 5);
  assert.strictEqual(biomeToPays('jungle_afc'), 1);
  assert.strictEqual(biomeToPays('taiga'), 4);
  assert.strictEqual(biomeToPays('mangrove'), null);
  assert.strictEqual(biomeToPays('prairie'), null);
});

test('5 espèces toundra révèlent les feuillets espece_pays du pays 5 dans l ordre', async () => {
  const revealed = [];
  for (const code of TUNDRA_SPECIES) {
    const res = await request(app)
      .post(`/api/gl/learning/species/${code}`)
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ confirm: true, gameId })
      .expect(200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.feuilletRevealed, `feuillet attendu pour ${code}`);
    revealed.push(res.body.feuilletRevealed.feuilletCode);
  }
  assert.deepStrictEqual(revealed, PAYS5_FEUILLETS);

  for (const code of PAYS5_FEUILLETS) {
    const state = await queryOne(
      `SELECT unlocked_via, status FROM gl_game_feuillet_states
        WHERE game_id = ? AND team_id = ? AND feuillet_code = ? LIMIT 1`,
      [gameId, teamId, code],
    );
    assert.ok(state);
    assert.strictEqual(state.unlocked_via, 'espece');
    assert.notStrictEqual(state.status, 'locked');
  }
});

test('SP0049 révèle le feuillet dédié ep-VI-06', async () => {
  const res = await request(app)
    .post('/api/gl/learning/species/SP0049')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ confirm: true, gameId })
    .expect(200);
  assert.strictEqual(res.body.feuilletRevealed?.feuilletCode, 'ep-VI-06');
});

test('re-POST espèce déjà étudiée ne révèle pas de nouveau feuillet', async () => {
  const res = await request(app)
    .post(`/api/gl/learning/species/${TUNDRA_SPECIES[0]}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ confirm: true, gameId })
    .expect(200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.feuilletRevealed, undefined);
});

test('POST sans gameId ne révèle pas de feuillet', async () => {
  const code = `SP-NG-${String(stamp).slice(-4)}`;
  await execute(
    `INSERT INTO gl_species (
       species_code, biome_slug, type, nom_commun, statut, created_at, updated_at
     ) VALUES (?, 'sahara', 'faune', 'Sans game', 'actif', NOW(), NOW())`,
    [code],
  );
  const res = await request(app)
    .post(`/api/gl/learning/species/${code}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ confirm: true })
    .expect(200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.feuilletRevealed, undefined);
});

test('corpus importé expose les colonnes lien_* quand présentes', async () => {
  const rows = await queryAll(
    `SELECT feuillet_code, lien_canal, lien_pays, lien_ordre_recit
       FROM gl_lore_feuillets
      WHERE lien_canal IS NOT NULL
      LIMIT 5`,
  );
  if (rows.length === 0) return;
  for (const row of rows) {
    assert.ok(['espece', 'espece_pays', 'intro_pays'].includes(String(row.lien_canal)));
  }
});
