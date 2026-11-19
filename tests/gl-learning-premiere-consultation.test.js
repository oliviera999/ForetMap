'use strict';

/**
 * Audit G&L du 19/11/2026, constat C7 : « première consultation » décidée par une lecture
 * préalable de l'accusé. Des requêtes parallèles sur la même ressource se croyaient toutes
 * premières et gagnaient chacune une page ; la révélation par espèce n'avait ni verrou
 * d'équipe ni relecture sous transaction, et ne regardait pas l'état de la partie.
 *
 * Complément du constat C4 : `POST /api/gl/learning/tutorials/:id` acceptait un tutoriel non
 * publié.
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
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

const stamp = Date.now();
const suffix = String(stamp).slice(-8);
const biomeSlug = `c7b${stamp}`;
const FEUILLETS = [1, 2, 3, 4, 5, 6].map((i) => `c7-${stamp}-${i}`);
const GLOSSARY_CODE = `C7G${suffix}`;
const SPECIES = ['A', 'B', 'C', 'D'].map((x) => `C7S${suffix}${x}`);
const PARALLEL = 6;
let playerToken = '';
let adminToken = '';
let gameId = null;
let teamId = null;
let tutorialIds = {};

async function foundCodes() {
  const rows = await queryAll(
    `SELECT feuillet_code FROM gl_game_feuillet_states
      WHERE game_id = ? AND team_id = ? AND status <> 'locked' ORDER BY feuillet_code`,
    [gameId, teamId],
  );
  return rows.map((r) => String(r.feuillet_code));
}

async function discoveryEvents() {
  const rows = await queryAll(
    `SELECT payload_json FROM gl_game_events
      WHERE game_id = ? AND team_id = ? AND event_type = 'feuillet_discovered'`,
    [gameId, teamId],
  );
  return rows.map((r) => {
    const p = typeof r.payload_json === 'string' ? JSON.parse(r.payload_json) : r.payload_json;
    return String(p?.feuilletCode);
  });
}

function post(path, token = playerToken) {
  return request(app)
    .post(path)
    .set('Authorization', `Bearer ${token}`)
    .send({ confirm: true, gameId, teamId });
}

before(async () => {
  await initSchema();
  const admin = await createGlAdmin({ email: `gl.c7.${stamp}@ecole.local` });
  const cls = await createGlClass({ name: `Classe C7 ${stamp}`, adminId: admin.id });
  // Chapitre et biome propres au run : pool d'attribution hermétique (cf. gl-feuillet-acquisition).
  await execute(
    'INSERT INTO gl_chapters (slug, title, plateau_number, order_index) VALUES (?, ?, NULL, 902)',
    [`c7-${stamp}`, `Chapitre C7 ${stamp}`],
  );
  const chapter = await queryOne('SELECT id FROM gl_chapters WHERE slug = ?', [`c7-${stamp}`]);
  await execute('INSERT IGNORE INTO gl_biomes (slug, nom, order_index) VALUES (?, ?, 991)', [
    biomeSlug,
    `Biome C7 ${stamp}`,
  ]);
  await execute(
    'INSERT INTO gl_chapter_biomes (chapter_id, biome_slug, order_index) VALUES (?, ?, 0)',
    [Number(chapter.id), biomeSlug],
  );
  const seed = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: Number(chapter.id),
    createdBy: admin.id,
    teams: [{ name: 'Equipe C7', type: 'gnome' }],
  });
  gameId = Number(seed.game.id);
  teamId = Number(seed.teams[0].id);
  await execute('UPDATE gl_games SET status = ? WHERE id = ?', ['live', gameId]);
  const player = await createGlPlayer({ classId: cls.id, pseudo: `c7-${stamp}` });
  await assignPlayerToGameTeam({ gameId, teamId, playerId: player.id });
  const tokens = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.content.manage'],
    playerId: player.id,
    teamId,
  });
  playerToken = tokens.playerToken;
  adminToken = tokens.adminToken;

  for (let i = 0; i < FEUILLETS.length; i += 1) {
    await execute(
      `INSERT INTO gl_lore_feuillets (feuillet_code, titre, incipit, texte_accessible, biome_slug, ordre_voyage, ordre_recit)
       VALUES (?, ?, 'Incipit', 'Texte', ?, 1, ?)`,
      [FEUILLETS[i], `Feuillet C7 ${i + 1}`, biomeSlug, i + 1],
    );
  }
  await execute(
    `INSERT INTO gl_glossary_terms (glossary_code, terme, categorie, statut) VALUES (?, ?, 'test', 'actif')`,
    [GLOSSARY_CODE, `terme-c7-${stamp}`],
  );
  for (const code of SPECIES) {
    await execute(
      `INSERT INTO gl_species (species_code, biome_slug, type, nom_commun, statut, created_at, updated_at)
       VALUES (?, ?, 'faune', ?, 'actif', NOW(), NOW())`,
      [code, biomeSlug, `Espèce ${code}`],
    );
  }
  for (const [key, published] of [
    ['publie', 1],
    ['brouillon', 0],
  ]) {
    const r = await execute(
      `INSERT INTO gl_tutorials (slug, title, body_markdown, order_index, is_published, created_at, updated_at)
       VALUES (?, ?, 'Corps', 0, ?, NOW(), NOW())`,
      [`c7-${key}-${stamp}`, `Tutoriel ${key}`, published],
    );
    tutorialIds[key] = Number(r.insertId);
  }
});

after(async () => {
  const run = (sql, params) => execute(sql, params).catch(() => {});
  for (const code of FEUILLETS) {
    await run('DELETE FROM gl_game_feuillet_states WHERE feuillet_code = ?', [code]);
    await run('DELETE FROM gl_player_feuillet_states WHERE feuillet_code = ?', [code]);
    await run('DELETE FROM gl_lore_feuillets WHERE feuillet_code = ?', [code]);
  }
  for (const code of SPECIES) await run('DELETE FROM gl_species WHERE species_code = ?', [code]);
  await run('DELETE FROM gl_glossary_terms WHERE glossary_code = ?', [GLOSSARY_CODE]);
  await run('DELETE FROM gl_tutorials WHERE id IN (?, ?)', [
    tutorialIds.publie || 0,
    tutorialIds.brouillon || 0,
  ]);
  await run('DELETE FROM gl_chapter_biomes WHERE biome_slug = ?', [biomeSlug]);
  await run('DELETE FROM gl_biomes WHERE slug = ?', [biomeSlug]);
});

test('même terme marqué en parallèle : une seule première consultation, une seule page', async () => {
  const avant = await foundCodes();
  const results = await Promise.all(
    Array.from({ length: PARALLEL }, () => post(`/api/gl/learning/glossary/${GLOSSARY_CODE}`)),
  );
  for (const res of results) assert.equal(res.status, 200);
  const apres = await foundCodes();
  assert.equal(apres.length - avant.length, 1, `pages gagnées : ${apres.join(', ')}`);
  assert.equal(results.filter((r) => r.body.feuilletRevealed).length, 1);

  const encore = await post(`/api/gl/learning/glossary/${GLOSSARY_CODE}`).expect(200);
  assert.equal(encore.body.feuilletRevealed, undefined);
  assert.equal((await foundCodes()).length, apres.length);
});

test('même espèce étudiée en parallèle : une seule page, un seul évènement', async () => {
  const avant = await foundCodes();
  const evAvant = await discoveryEvents();
  const results = await Promise.all(
    Array.from({ length: PARALLEL }, () => post(`/api/gl/learning/species/${SPECIES[0]}`)),
  );
  for (const res of results) assert.equal(res.status, 200);
  const apres = await foundCodes();
  assert.equal(apres.length - avant.length, 1);
  assert.equal((await discoveryEvents()).length - evAvant.length, 1, 'un seul évènement');
  assert.equal(results.filter((r) => r.body.feuilletRevealed).length, 1);
});

test('deux espèces étudiées au même instant : deux pages distinctes, jamais la même deux fois', async () => {
  const avant = await foundCodes();
  const evAvant = await discoveryEvents();
  const results = await Promise.all([
    post(`/api/gl/learning/species/${SPECIES[1]}`),
    post(`/api/gl/learning/species/${SPECIES[2]}`),
  ]);
  const revealed = results.map((r) => r.body.feuilletRevealed?.feuilletCode);
  assert.ok(revealed[0] && revealed[1], `deux pages attendues : ${JSON.stringify(revealed)}`);
  assert.notEqual(revealed[0], revealed[1]);
  assert.equal((await foundCodes()).length - avant.length, 2);
  const nouveaux = (await discoveryEvents()).slice(evAvant.length).sort();
  assert.deepEqual(nouveaux, [...revealed].sort(), 'un évènement par page, pas de doublon');
});

test('tutoriel non publié : introuvable pour un joueur, marquable par qui gère les contenus', async () => {
  const path = (key) => `/api/gl/learning/tutorials/${tutorialIds[key]}`;
  await post(path('brouillon')).expect(404);
  const ack = await queryOne(
    `SELECT 1 AS ok FROM gl_learning_acknowledgements WHERE target_type = 'tutorial' AND target_code = ?`,
    [String(tutorialIds.brouillon)],
  );
  assert.ok(!ack, 'aucun accusé écrit pour un tutoriel non publié');
  await post(path('publie')).expect(200);
  await post(path('brouillon'), adminToken).expect(200);
});

test('partie terminée : étudier une espèce ne fait plus apparaître de page', async () => {
  await execute('UPDATE gl_games SET status = ? WHERE id = ?', ['ended', gameId]);
  const avant = await foundCodes();
  const res = await post(`/api/gl/learning/species/${SPECIES[3]}`).expect(200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.feuilletRevealed, undefined);
  assert.deepEqual(await foundCodes(), avant);
});
