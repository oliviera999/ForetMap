'use strict';

/**
 * Ensemble unifié, PR 1a, étape 1.4 — questions de case (M9, 17 novembre 2026) :
 * 1. une question vive (`VQCM…`) du biome de la case pas encore posée dans la partie ;
 * 2. sinon une question `usage_tenir = 1` du biome, difficulté ≤ plafond du plateau, pas encore
 *    posée à cette équipe ;
 * 3. à partir du plateau 2, la spirale tire le biome parmi ceux des plateaux déjà traversés.
 * Aucun tirage vide : « pas encore posée » se relâche d'abord, puis le plafond.
 * Biome et questions créés par le test (aucune donnée d'élève).
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../database');
const { initSchema, execute } = db;
const {
  drawTenirCaseQuestion,
  resolvePlafondDifficulte,
  resolveSpirale,
  biomesDesPlateauxTraverses,
  PLAFOND_DIFFICULTE_DEFAUT,
} = require('../lib/glMarkerQuestionPool');
const { DEFAULT_GAMEPLAY } = require('../lib/glSettings');
const { createTenirGame } = require('./helpers/glTenirFixtures');

const stamp = Date.now();
const N = String(stamp).slice(-6);
const BIOME = `test_m9_${N}`;
const BIOME_HAUT = `test_m9h_${N}`;
const CAT = 'faune';
const V1 = `VQCM9${N.slice(-3)}`;
const Q_FACILE = `TM9F${N}`;
const Q_DIFFICILE = `TM9D${N}`;
const Q_HAUTE = `TM9H${N}`;
const deps = { queryAll: db.queryAll, queryOne: db.queryOne };
const marker = {
  id: 1,
  event_type: 'quiz',
  event_config_json: JSON.stringify({
    version: 2,
    question: {
      mode: 'random',
      pool: { biomeMode: 'chapter', difficulteMin: 1, difficulteMax: 1 },
    },
  }),
};
let ctx;

async function question(code, biome, difficulte, numero) {
  await execute(
    `INSERT INTO gl_qcm_questions (question_code, biome_slug, categorie_slug, numero_dans_categorie,
       question, choix_a, choix_b, choix_c, choix_d, choix_e, reponse_correcte, niveau, difficulte,
       statut, usage_tenir, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'Un', 'Deux', 'Trois', 'Quatre', '', 'A', '6ème', ?, 'actif', 1, NOW(), NOW())`,
    [code, biome, CAT, numero, `Question ${code} ?`, difficulte],
  );
}

async function posee(teamId, code) {
  await execute(
    `INSERT INTO gl_game_events (game_id, team_id, actor_type, event_type, payload_json, created_at)
     VALUES (?, ?, 'team', 'marker_question_presented', ?, NOW())`,
    [ctx.game.id, teamId, JSON.stringify({ questionCode: code, markerId: 1 })],
  );
}

const tirer = (extra = {}) =>
  drawTenirCaseQuestion(deps, {
    gameId: ctx.game.id,
    teamId: ctx.teams[0].id,
    marker,
    chapterBiomeSlugs: [BIOME],
    plateau: 1,
    resolved: null,
    random: () => 0.5,
    ...extra,
  });

before(async () => {
  await initSchema();
  for (const slug of [BIOME, BIOME_HAUT]) {
    await execute(
      `INSERT INTO gl_biomes (slug, nom, order_index, created_at, updated_at)
       VALUES (?, ?, 999, NOW(), NOW()) ON DUPLICATE KEY UPDATE nom = VALUES(nom)`,
      [slug, `Biome de test ${slug}`],
    );
  }
  await question(V1, BIOME, null, 900001);
  await question(Q_FACILE, BIOME, 1, 900002);
  await question(Q_DIFFICILE, BIOME, 3, 900003);
  await question(Q_HAUTE, BIOME_HAUT, 4, 900004);
  ctx = await createTenirGame({ stamp: `${stamp}-m9`, plateau: 1 });
});

test('réglages : plafond {1: 2, 2: 3, 3: 3, 4: 3}, spirale 20 % (une question sur cinq)', () => {
  assert.deepEqual(DEFAULT_GAMEPLAY.tenirQuestionsDifficulteMaxParPlateau, {
    1: 2,
    2: 3,
    3: 3,
    4: 3,
  });
  assert.deepEqual(PLAFOND_DIFFICULTE_DEFAUT, { 1: 2, 2: 3, 3: 3, 4: 3 });
  assert.equal(DEFAULT_GAMEPLAY.tenirQuestionsSpirale, 20);
  assert.equal(resolvePlafondDifficulte(null, 1), 2);
  assert.equal(resolvePlafondDifficulte({ questions_difficulte_max_par_plateau: { 1: 4 } }, 1), 4);
  assert.equal(resolveSpirale({ questions_spirale: 20 }), 0.2);
  assert.equal(resolveSpirale({ questions_spirale: 0.5 }), 0.5);
  assert.equal(resolveSpirale({}), 0.2);
  assert.deepEqual(biomesDesPlateauxTraverses(1), []);
  assert.deepEqual(biomesDesPlateauxTraverses(2).sort(), ['jungle_afc', 'savane']);
  const p4 = biomesDesPlateauxTraverses(4);
  for (const b of ['jungle_afc', 'savane', 'sahara', 'foret_mediterraneenne', 'landes'])
    assert.ok(p4.includes(b), b);
  assert.ok(!p4.includes('taiga'), 'pas le biome du plateau en cours');
});

test('ordre du tirage : la question vive d’abord, puis sous le plafond, sans répéter pour l’équipe', async () => {
  const a = await tirer();
  assert.deepEqual([a.questionCode, a.etape], [V1, 'vive']);
  await posee(ctx.teams[0].id, V1);
  // La vive est posée dans la partie : plus jamais en tête, même pour une autre équipe. Les
  // bornes de la case (difficulté 1 à 1) sont ignorées : le plafond du plateau 1 (2) compte.
  const b = await tirer();
  assert.deepEqual([b.questionCode, b.etape], [Q_FACILE, 'plafond']);
  const autre = await tirer({ teamId: ctx.teams[1].id });
  assert.deepEqual([autre.questionCode, autre.etape], [Q_FACILE, 'plafond']);
  await posee(ctx.teams[0].id, Q_FACILE);
  // Tout est posé sous le plafond : « pas encore posée » se relâche, jamais le plafond d'abord.
  const c = await tirer();
  assert.equal(c.etape, 'plafond_deja_posee');
  assert.ok([V1, Q_FACILE].includes(c.questionCode), c.questionCode);
  // Au plateau 2 (plafond 3), la question difficile entre dans le tirage.
  const p2 = await tirer({ plateau: 2, random: () => 0.99 });
  assert.deepEqual([p2.questionCode, p2.etape, p2.spirale], [Q_DIFFICILE, 'plafond', false]);
});

test('repli : rien sous le plafond → le plafond se relâche ; jamais de tirage vide', async () => {
  const r = await tirer({ chapterBiomeSlugs: [BIOME_HAUT] });
  assert.deepEqual([r.questionCode, r.etape], [Q_HAUTE, 'sans_plafond']);
  const exclu = await tirer({ chapterBiomeSlugs: [BIOME_HAUT], excludeCodes: [Q_HAUTE] });
  assert.equal(exclu.questionCode, null);
  assert.ok(exclu.error);
});

test('spirale à graine fixée : dès le plateau 2, un biome d’un plateau déjà traversé ; jamais au plateau 1', async () => {
  const s = await tirer({ plateau: 2, random: () => 0 });
  assert.equal(s.spirale, true);
  assert.equal(s.biome, 'jungle_afc', 'tirage 0 → premier biome traversé du registre');
  assert.ok(s.questionCode);
  const p1 = await tirer({ plateau: 1, random: () => 0 });
  assert.equal(p1.spirale, false);
  // Réglage à 0 : jamais de spirale.
  const zero = await tirer({ plateau: 3, random: () => 0, resolved: { questions_spirale: 0 } });
  assert.equal(zero.spirale, false);
});
