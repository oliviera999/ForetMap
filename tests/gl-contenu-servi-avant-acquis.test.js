'use strict';

/**
 * Audit des bugs G&L du 19/11/2026, lot 4 — du contenu servi avant d'être acquis ou publié.
 *
 *  - C1 : les candidats d'une zone du royaume partaient avec leur texte complet ;
 *  - C2 : « faire apparaître » un feuillet aboutissait sur une partie terminée ;
 *  - C3 : le glossaire du lore laissait passer le niveau « secret » et le plafond de
 *         divulgâchage par l'index des liens, la fiche, les termes liés et les questions ;
 *  - C4 : un tutoriel non publié était listé et lisible par un joueur.
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { invalidateGameplayCache } = require('../lib/glSettings');
const { resourceExists } = require('../lib/glLearnableResources');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlChapterWithMarker,
  createGlGameWithTeams,
  assignPlayerToGameTeam,
  signTokens,
} = require('./helpers/glFixtures');

const stamp = Date.now();
const BIOME = 'toundra';
const TEXTE_SECRET = `Texte réservé ${stamp} — la neige écoute, la rivière compte.`;
const F_LIE = `L4-LIE-${stamp}`;
const F_BIOME = `L4-BIO-${stamp}`;
const suffix = String(stamp).slice(-8);
const T_CLE = `L4C${suffix}`;
const T_RECIT = `L4R${suffix}`;
const T_SECRET = `L4S${suffix}`;
const Q_CODE = `L4Q${suffix}`;
const SCOPE = `lot4-${suffix}`;

let adminToken = '';
let playerToken = '';
let gameId = null;
let teamId = null;
let zoneLieeId = null;
let zoneNueId = null;
let previousSpoiler;

const db = { queryOne };

async function setSetting(key, value) {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at) VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
    [key, JSON.stringify(value)],
  );
  invalidateGameplayCache();
}

async function insertFeuillet(code, titre) {
  await execute(
    `INSERT INTO gl_lore_feuillets (feuillet_code, type, titre, incipit, texte, texte_accessible,
        contexte, biome_slug, mode_apparition, ordre_voyage, statut, created_at, updated_at)
     VALUES (?, 'feuillet', ?, 'La neige écoute.', ?, ?, 'Contexte réservé', ?, 'ancre_biome', 9000,
        'actif', NOW(), NOW())`,
    [code, titre, TEXTE_SECRET, TEXTE_SECRET, BIOME],
  );
}

async function insertZone(chapterId, label) {
  const res = await execute(
    `INSERT INTO gl_kingdom_zones (chapter_id, label, points_json) VALUES (?, ?, ?)`,
    [
      chapterId,
      label,
      JSON.stringify([
        { x: 10, y: 10 },
        { x: 90, y: 10 },
        { x: 50, y: 90 },
      ]),
    ],
  );
  return Number(res.insertId);
}

async function insertTerm(code, terme, niveau) {
  await execute(
    `INSERT INTO gl_lore_glossary_terms (lore_code, terme, categorie, niveau, definition_courte, statut)
     VALUES (?, ?, 'concept', ?, ?, 'actif')`,
    [code, terme, niveau, `Définition de ${terme}`],
  );
}

before(async () => {
  await initSchema();
  const admin = await createGlAdmin({ email: `gl.lot4.${stamp}@ecole.local` });
  const cls = await createGlClass({ name: `Classe Lot4 ${stamp}`, adminId: admin.id });
  const { chapter } = await createGlChapterWithMarker({
    slug: `lot4-chapitre-${stamp}`,
    biomeSlugs: [BIOME],
  });
  const seed = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    name: `Partie Lot4 ${stamp}`,
    teams: [{ name: 'Equipe Lot4', type: 'gnome' }],
  });
  gameId = Number(seed.game.id);
  teamId = Number(seed.teams[0].id);
  const player = await createGlPlayer({ classId: cls.id, pseudo: `lot4-${stamp}` });
  await assignPlayerToGameTeam({ gameId, teamId, playerId: player.id });
  const tokens = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.content.manage', 'gl.game.manage', 'gl.event.emit'],
    playerId: player.id,
    teamId,
  });
  adminToken = tokens.adminToken;
  playerToken = tokens.playerToken;

  zoneLieeId = await insertZone(chapter.id, `Zone liée ${stamp}`);
  zoneNueId = await insertZone(chapter.id, `Zone nue ${stamp}`);
  await insertFeuillet(F_LIE, `Page liée ${stamp}`);
  await insertFeuillet(F_BIOME, `Page du biome ${stamp}`);
  await execute('UPDATE gl_lore_feuillets SET kingdom_zone_id = ? WHERE feuillet_code = ?', [
    zoneLieeId,
    F_LIE,
  ]);

  await insertTerm(T_CLE, `clelot${suffix}`, 'cle');
  await insertTerm(T_RECIT, `recitlot${suffix}`, 'recit');
  await insertTerm(T_SECRET, `secretlot${suffix}`, 'secret');
  await execute(
    'INSERT INTO gl_lore_glossary_relations (from_code, to_code) VALUES (?, ?), (?, ?)',
    [T_CLE, T_RECIT, T_CLE, T_SECRET],
  );
  await execute('INSERT INTO gl_qcm_lore_scopes (slug, nom) VALUES (?, ?)', [
    SCOPE,
    `Lot 4 ${stamp}`,
  ]);
  await execute('INSERT INTO gl_qcm_lore_categories (slug, nom) VALUES (?, ?)', [
    SCOPE,
    `Lot 4 ${stamp}`,
  ]);
  await execute(
    `INSERT INTO gl_qcm_lore_questions (question_code, chapitre_slug, categorie_slug, question,
        choix_a, choix_b, choix_c, choix_d, reponse_correcte, mots_cles, statut)
     VALUES (?, ?, ?, 'Question du lot 4 ?', 'A', 'B', 'C', 'D', 'A', ?, 'actif')`,
    [Q_CODE, SCOPE, SCOPE, `clelot${suffix}, recitlot${suffix}, secretlot${suffix}`],
  );

  const row = await queryOne(
    "SELECT value_json FROM gl_settings WHERE `key` = 'gameplay.lore_spoiler_max_level' LIMIT 1",
  );
  previousSpoiler = row ? row.value_json : undefined;
});

after(async () => {
  if (previousSpoiler === undefined) {
    await execute("DELETE FROM gl_settings WHERE `key` = 'gameplay.lore_spoiler_max_level'");
  } else {
    await execute(
      "UPDATE gl_settings SET value_json = ? WHERE `key` = 'gameplay.lore_spoiler_max_level'",
      [previousSpoiler],
    );
  }
  invalidateGameplayCache();
  await execute('DELETE FROM gl_qcm_lore_questions WHERE question_code = ?', [Q_CODE]);
  await execute('DELETE FROM gl_qcm_lore_categories WHERE slug = ?', [SCOPE]);
  await execute('DELETE FROM gl_qcm_lore_scopes WHERE slug = ?', [SCOPE]);
  await execute('DELETE FROM gl_lore_glossary_terms WHERE lore_code IN (?, ?, ?)', [
    T_CLE,
    T_RECIT,
    T_SECRET,
  ]);
  await execute('DELETE FROM gl_game_feuillet_states WHERE game_id = ?', [gameId]);
  await execute('DELETE FROM gl_lore_feuillets WHERE feuillet_code IN (?, ?)', [F_LIE, F_BIOME]);
  await execute('DELETE FROM gl_tutorials WHERE slug LIKE ?', [`lot4-%-${stamp}`]);
});

function zoneFeuillets(zoneId, token) {
  return request(app)
    .get(`/api/gl/lore/games/${gameId}/zones/${zoneId}/feuillets`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
}

function assertMasque(item) {
  assert.ok(item, 'le candidat reste listé (code et titre)');
  assert.ok(item.titre);
  for (const champ of ['displayText', 'texteAccessible', 'contexte']) {
    assert.strictEqual(item[champ], null, `${champ} masqué tant que la page n'est pas trouvée`);
  }
  assert.strictEqual(item.texte, undefined);
}

// --- C1 ---------------------------------------------------------------------------------

test('C1 — zone liée : le joueur ne reçoit pas le texte d’une page que son équipe n’a pas trouvée', async () => {
  const res = await zoneFeuillets(zoneLieeId, playerToken);
  assert.ok(
    !JSON.stringify(res.body).includes(TEXTE_SECRET),
    'aucun texte complet dans la réponse',
  );
  assertMasque(res.body.items.find((it) => it.feuilletCode === F_LIE));
});

test('C1 — zone sans page liée : le repli par biome est masqué lui aussi', async () => {
  const res = await zoneFeuillets(zoneNueId, playerToken);
  assert.ok(!JSON.stringify(res.body).includes(TEXTE_SECRET));
  assertMasque(res.body.items.find((it) => it.feuilletCode === F_BIOME));
});

test('C1 — le MJ garde le texte complet', async () => {
  const res = await zoneFeuillets(zoneLieeId, adminToken);
  const item = res.body.items.find((it) => it.feuilletCode === F_LIE);
  assert.strictEqual(item.texte, TEXTE_SECRET);
});

// --- C2 ---------------------------------------------------------------------------------

function present(code, token, body = {}) {
  return request(app)
    .post(`/api/gl/lore/games/${gameId}/feuillets/${code}/present`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

test('C2 — partie terminée : un joueur ne fait plus apparaître de page (409, rien d’écrit)', async () => {
  await execute("UPDATE gl_games SET status = 'ended' WHERE id = ?", [gameId]);
  try {
    const res = await present(F_BIOME, playerToken);
    assert.strictEqual(res.status, 409);
    const state = await queryOne(
      'SELECT status FROM gl_game_feuillet_states WHERE game_id = ? AND feuillet_code = ?',
      [gameId, F_BIOME],
    );
    assert.ok(!state, 'aucun état de possession créé');
  } finally {
    await execute("UPDATE gl_games SET status = 'live' WHERE id = ?", [gameId]);
  }
});

test('C2 — partie en brouillon : même refus pour un joueur', async () => {
  await execute("UPDATE gl_games SET status = 'draft' WHERE id = ?", [gameId]);
  try {
    const res = await present(F_BIOME, playerToken);
    assert.strictEqual(res.status, 409);
  } finally {
    await execute("UPDATE gl_games SET status = 'live' WHERE id = ?", [gameId]);
  }
});

test('C2 — partie en pause puis en cours : le joueur fait apparaître la page ; C1 — elle lui est alors servie entière', async () => {
  await execute("UPDATE gl_games SET status = 'paused' WHERE id = ?", [gameId]);
  const paused = await present(F_BIOME, playerToken);
  assert.strictEqual(paused.status, 200);
  await execute("UPDATE gl_games SET status = 'live' WHERE id = ?", [gameId]);

  const res = await present(F_LIE, playerToken, { kingdomZoneId: zoneLieeId });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body?.feuillet?.displayText, TEXTE_SECRET);

  const apres = await zoneFeuillets(zoneLieeId, playerToken);
  const item = apres.body.items.find((it) => it.feuilletCode === F_LIE);
  assert.strictEqual(item.displayText, TEXTE_SECRET, 'page trouvée : texte servi');
});

// --- C3 ---------------------------------------------------------------------------------

function glossaire(path, token) {
  return request(app).get(`/api/gl/lore/glossary${path}`).set('Authorization', `Bearer ${token}`);
}

test('C3 — link-index : pas de terme secret pour un joueur, le MJ les garde', async () => {
  const joueur = await glossaire('/link-index', playerToken).expect(200);
  const codes = joueur.body.items.map((it) => it.lore_code);
  assert.ok(codes.includes(T_CLE));
  assert.ok(codes.includes(T_RECIT));
  assert.ok(!codes.includes(T_SECRET), 'terme secret absent de l’index joueur');

  const mj = await glossaire('/link-index', adminToken).expect(200);
  assert.ok(mj.body.items.some((it) => it.lore_code === T_SECRET));
});

test('C3 — fiche : les termes liés secrets ne sont pas servis à un joueur', async () => {
  const joueur = await glossaire(`/${T_CLE}`, playerToken).expect(200);
  const codes = joueur.body.relatedTerms.map((it) => it.lore_code);
  assert.deepStrictEqual(codes, [T_RECIT]);

  const mj = await glossaire(`/${T_CLE}`, adminToken).expect(200);
  assert.strictEqual(mj.body.relatedTerms.length, 2);
});

test('C3 — fiche : un terme lié désactivé n’est servi à personne hors MJ', async () => {
  await execute("UPDATE gl_lore_glossary_terms SET statut = 'inactif' WHERE lore_code = ?", [
    T_RECIT,
  ]);
  try {
    const joueur = await glossaire(`/${T_CLE}`, playerToken).expect(200);
    assert.deepStrictEqual(joueur.body.relatedTerms, []);
  } finally {
    await execute("UPDATE gl_lore_glossary_terms SET statut = 'actif' WHERE lore_code = ?", [
      T_RECIT,
    ]);
  }
});

test('C3 — questions du lore : loreGlossaryTerms sans terme secret pour un joueur', async () => {
  const liste = await request(app)
    .get(`/api/gl/lore/qcm/questions?chapitreSlug=${SCOPE}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  const item = liste.body.items.find((it) => it.question_code === Q_CODE);
  assert.ok(item);
  assert.deepStrictEqual(item.loreGlossaryTerms.map((t) => t.lore_code).sort(), [T_CLE, T_RECIT]);

  const presentation = await request(app)
    .get(`/api/gl/lore/qcm/questions/${Q_CODE}/present`)
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.ok(
    !JSON.stringify(presentation.body).includes(T_SECRET),
    'aucun terme secret dans la présentation',
  );
});

test('C3 — plafond « clé » : un terme « récit » disparaît de la fiche, de l’index, des termes liés et des questions', async () => {
  await setSetting('gameplay.lore_spoiler_max_level', 'cle');

  const fiche = await glossaire(`/${T_RECIT}`, playerToken);
  assert.strictEqual(fiche.status, 403);

  const index = await glossaire('/link-index', playerToken).expect(200);
  const codes = index.body.items.map((it) => it.lore_code);
  assert.ok(codes.includes(T_CLE));
  assert.ok(!codes.includes(T_RECIT));

  const cle = await glossaire(`/${T_CLE}`, playerToken).expect(200);
  assert.deepStrictEqual(cle.body.relatedTerms, []);

  const liste = await request(app)
    .get(`/api/gl/lore/qcm/questions?chapitreSlug=${SCOPE}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  const item = liste.body.items.find((it) => it.question_code === Q_CODE);
  assert.deepStrictEqual(
    item.loreGlossaryTerms.map((t) => t.lore_code),
    [T_CLE],
  );

  // Le MJ n'est pas soumis au plafond.
  await glossaire(`/${T_RECIT}`, adminToken).expect(200);
});

// --- C4 ---------------------------------------------------------------------------------

async function creerTutoriel(slug, isPublished) {
  const res = await request(app)
    .post('/api/gl/tutorials')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ slug, title: `Tutoriel ${slug}`, bodyMarkdown: 'Contenu réservé', isPublished })
    .expect(201);
  return res.body;
}

test('C4 — un tutoriel non publié n’est ni listé ni lisible par un joueur ; le MJ garde tout', async () => {
  const brouillon = await creerTutoriel(`lot4-brouillon-${stamp}`, false);
  const publie = await creerTutoriel(`lot4-publie-${stamp}`, true);

  const liste = await request(app)
    .get('/api/gl/tutorials')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  const ids = liste.body.tutorials.map((t) => Number(t.id));
  assert.ok(ids.includes(Number(publie.id)));
  assert.ok(!ids.includes(Number(brouillon.id)), 'brouillon absent de la liste joueur');

  await request(app)
    .get(`/api/gl/tutorials/${brouillon.id}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(404);
  await request(app)
    .get(`/api/gl/tutorials/${brouillon.slug}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(404);
  await request(app)
    .get(`/api/gl/tutorials/${publie.id}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);

  const listeMj = await request(app)
    .get('/api/gl/tutorials')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(listeMj.body.tutorials.some((t) => Number(t.id) === Number(brouillon.id)));
  const detailMj = await request(app)
    .get(`/api/gl/tutorials/${brouillon.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(Number(detailMj.body.is_published), 0);

  // Ressource « apprenable » : un brouillon ne se marque ni ne s'importe au journal.
  assert.strictEqual(await resourceExists(db, 'tutorial', String(brouillon.id)), false);
  assert.strictEqual(await resourceExists(db, 'tutorial', String(publie.id)), true);
});
