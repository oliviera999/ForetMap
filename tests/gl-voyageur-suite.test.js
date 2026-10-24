'use strict';

// Le Seuil — suite S1–S6 de l'audit de l'expérience joueur (`lib/glVoyageur.js`) :
// « +1 » immédiat, Mes traversées, sortilège Loupe, niveau visible du MJ, gestes de mascotte.

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne, queryAll } = require('../database');
const { invalidateModulesCache } = require('../lib/glSettings');
const { recordGlQcmAttemptForReader } = require('../lib/learningGatingRuntime');
const { buildGestures, voyageurGainFor } = require('../lib/glVoyageur');
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
const suffix = String(stamp).slice(-6);
const QCM4 = `QV${suffix}`;
const QCM2 = `QW${suffix}`;
const GLOSSARY = `gv-${stamp}`;
const CATEGORY = `voyageur-${suffix}`;
let playerId = null;
let playerToken = '';
let adminToken = '';
let classId = null;

async function setModule(key, enabled) {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
    [key, enabled ? 'true' : 'false'],
  );
  invalidateModulesCache();
}

async function addAcks(pid, type, count, prefix) {
  for (let i = 0; i < count; i += 1) {
    await execute(
      `INSERT IGNORE INTO gl_learning_acknowledgements
         (reader_user_type, reader_user_id, target_type, target_code)
       VALUES ('gl_player', ?, ?, ?)`,
      [String(pid), type, `${prefix}-${stamp}-${i}`],
    );
  }
}

function auth(req, token = playerToken) {
  return req.set('Authorization', `Bearer ${token}`);
}

async function presentQcm(code) {
  const res = await auth(request(app).get(`/api/gl/qcm/questions/${code}/present`)).expect(200);
  return res.body;
}

function answerQcm(code, presentation, text) {
  const choice = presentation.choices.find((c) => c.text === text);
  return auth(request(app).post(`/api/gl/qcm/questions/${code}/answer`)).send({
    presentationToken: presentation.presentationToken,
    choiceId: choice.id,
  });
}

before(async () => {
  await initSchema();
  await setModule('modules.voyageur_enabled', true);
  const admin = await createGlAdmin({ email: `mj.voyageur.suite.${stamp}@ecole.local` });
  const glClass = await createGlClass({ adminId: admin.id, name: `Classe suite ${stamp}` });
  classId = glClass.id;
  const player = await createGlPlayer({ classId: glClass.id, pseudo: `vs-a-${stamp}` });
  const mate = await createGlPlayer({ classId: glClass.id, pseudo: `vs-b-${stamp}` });
  playerId = player.id;

  const { chapter } = await createGlChapterWithMarker({
    slug: `voyageur-suite-${stamp}`,
    title: `Chapitre suite ${stamp}`,
  });
  // Une expédition terminée (traversée) et une en cours.
  const past = await createGlGameWithTeams({
    classId: glClass.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    status: 'ended',
    name: `Partie passée ${stamp}`,
    teams: [{ name: 'Les Anciens', type: 'gnome', mascotId: 'gl-gnome-test' }],
  });
  await assignPlayerToGameTeam({
    gameId: past.game.id,
    teamId: past.teams[0].id,
    playerId: player.id,
  });
  await assignPlayerToGameTeam({
    gameId: past.game.id,
    teamId: past.teams[0].id,
    playerId: mate.id,
  });
  const current = await createGlGameWithTeams({
    classId: glClass.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    status: 'paused',
    name: `Partie en cours ${stamp}`,
    teams: [{ name: 'Les Présents', type: 'unicorn' }],
  });
  await assignPlayerToGameTeam({
    gameId: current.game.id,
    teamId: current.teams[0].id,
    playerId: player.id,
  });

  await execute(
    `INSERT INTO gl_qcm_categories (slug, nom, order_index, created_at, updated_at)
     VALUES (?, 'Voyageur', 0, NOW(), NOW())
     ON DUPLICATE KEY UPDATE nom = VALUES(nom), updated_at = NOW()`,
    [CATEGORY],
  );
  for (const [index, code, choices] of [
    [1, QCM4, ['Bonne', 'Faux 1', 'Faux 2', 'Faux 3', '']],
    [2, QCM2, ['Bonne', 'Faux 1', '', '', '']],
  ]) {
    await execute(
      `INSERT INTO gl_qcm_questions (
         question_code, biome_slug, categorie_slug, numero_dans_categorie, question,
         choix_a, choix_b, choix_c, choix_d, choix_e, reponse_correcte, statut, created_at, updated_at
       ) VALUES (?, 'sahara', ?, ?, 'Question voyageur ?', ?, ?, ?, ?, ?, 'A', 'actif', NOW(), NOW())`,
      [code, CATEGORY, index, ...choices],
    );
  }
  await execute(
    `INSERT INTO gl_glossary_terms
       (glossary_code, terme, categorie, niveau, definition_courte, all_biomes, statut, created_at, updated_at)
     VALUES (?, 'Voyageur', 'ecologie', 'base', 'Définition de test', 1, 'actif', NOW(), NOW())`,
    [GLOSSARY],
  );

  const tokens = await signTokens({
    adminId: admin.id,
    playerId: player.id,
    playerPseudo: player.pseudo,
    adminPermissions: ['gl.read', 'gl.players.manage'],
  });
  playerToken = tokens.playerToken;
  adminToken = tokens.adminToken;
});

// --- S1 : « +1 » immédiat --------------------------------------------------------------

test('S1 — voyageurGainFor : joueur seulement, sources comptées, module allumé', async () => {
  const player = { userType: 'gl_player', userId: '1' };
  assert.deepEqual(await voyageurGainFor(player, ['species', 'feuillets_found']), {
    proche: 1,
    loin: 1,
  });
  assert.equal(await voyageurGainFor(player, ['tutorial']), null);
  assert.equal(await voyageurGainFor({ userType: 'gl_admin', userId: '1' }, ['species']), null);
});

test('S1 — premier « appris » d’un mot du glossaire : voyageurGain, pas au second', async () => {
  const first = await auth(request(app).post(`/api/gl/learning/glossary/${GLOSSARY}`))
    .send({ confirm: true })
    .expect(200);
  assert.deepEqual(first.body.voyageurGain, { proche: 1, loin: 0 });
  const again = await auth(request(app).post(`/api/gl/learning/glossary/${GLOSSARY}`))
    .send({ confirm: true })
    .expect(200);
  assert.equal(again.body.voyageurGain, undefined);
});

test('S1 — première bonne réponse à une question : voyageurGain, puis plus rien', async () => {
  const wrong = await answerQcm(QCM4, await presentQcm(QCM4), 'Faux 1').expect(200);
  assert.equal(wrong.body.correct, false);
  assert.equal(wrong.body.voyageurGain, undefined);
  const right = await answerQcm(QCM4, await presentQcm(QCM4), 'Bonne').expect(200);
  assert.equal(right.body.correct, true);
  assert.deepEqual(right.body.voyageurGain, { proche: 1, loin: 0 });
  const again = await answerQcm(QCM4, await presentQcm(QCM4), 'Bonne').expect(200);
  assert.equal(again.body.voyageurGain, undefined);
});

test('S1 — recordGlQcmAttemptForReader signale la première bonne réponse', async () => {
  const db = { queryAll, queryOne, execute };
  const glAuth = { userType: 'gl_player', userId: String(playerId) };
  const code = `QX${suffix}`;
  const a = await recordGlQcmAttemptForReader(db, {
    glAuth,
    dataset: 'qcm',
    questionCode: code,
    isCorrect: true,
  });
  const b = await recordGlQcmAttemptForReader(db, {
    glAuth,
    dataset: 'qcm',
    questionCode: code,
    isCorrect: true,
  });
  assert.equal(a.firstCorrect, true);
  assert.equal(b.firstCorrect, false);
});

test('S1 — module éteint : aucun voyageurGain', async () => {
  await setModule('modules.voyageur_enabled', false);
  try {
    const res = await answerQcm(QCM2, await presentQcm(QCM2), 'Bonne').expect(200);
    assert.equal(res.body.correct, true);
    assert.equal(res.body.voyageurGain, undefined);
  } finally {
    await setModule('modules.voyageur_enabled', true);
  }
});

// --- S2 : Mes traversées -----------------------------------------------------------------

test('S2 — Mes traversées : la partie terminée, pas l’expédition en cours', async () => {
  const res = await auth(request(app).get('/api/gl/voyageur/me')).expect(200);
  assert.equal(res.body.expedition.teamName, 'Les Présents');
  assert.equal(res.body.traversees.length, 1);
  const [t] = res.body.traversees;
  assert.equal(t.teamName, 'Les Anciens');
  assert.equal(t.teamType, 'gnome');
  assert.equal(t.mascotId, 'gl-gnome-test');
  assert.deepEqual(t.teammates, [`vs-b-${stamp}`]);
});

// --- S3 : Loupe --------------------------------------------------------------------------

test('S3 — Loupe : fermée avant le niveau 4', async () => {
  const p = await presentQcm(QCM4);
  const res = await auth(request(app).post('/api/gl/voyageur/spells/loupe/cast'))
    .send({ target: p.presentationToken })
    .expect(409);
  assert.equal(res.body.code, 'SPELL_LOCKED');
});

test('S3 — Loupe : écarte une mauvaise réponse, jamais la bonne', async () => {
  await addAcks(playerId, 'species', 30, 'loupe'); // niveau ≥ 4
  const me = await auth(request(app).get('/api/gl/voyageur/me')).expect(200);
  const loupe = me.body.grimoire.find((s) => s.code === 'loupe');
  assert.equal(loupe.unlocked, true);
  assert.equal(loupe.targetKind, 'qcm');

  const p = await presentQcm(QCM4);
  const res = await auth(request(app).post('/api/gl/voyageur/spells/loupe/cast'))
    .send({ target: p.presentationToken })
    .expect(200);
  const eliminated = p.choices.find((c) => c.id === res.body.effect.eliminatedChoiceId);
  assert.ok(eliminated, 'choix écarté présent dans la présentation');
  assert.notEqual(eliminated.text, 'Bonne');
  // Le jeton n'est pas consommé : l'élève peut toujours répondre.
  await answerQcm(QCM4, p, 'Bonne').expect(200);
});

test('S3 — Loupe : refusée sur deux réponses, charge non consommée', async () => {
  await addAcks(playerId, 'ecosystem', 5, 'loupe-recharge');
  const p = await presentQcm(QCM2);
  const res = await auth(request(app).post('/api/gl/voyageur/spells/loupe/cast'))
    .send({ target: p.presentationToken })
    .expect(409);
  assert.equal(res.body.code, 'TOO_FEW_CHOICES');
  const me = await auth(request(app).get('/api/gl/voyageur/me')).expect(200);
  assert.equal(me.body.grimoire.find((s) => s.code === 'loupe').charged, true);
});

test('S3 — Loupe : jeton invalide → 400', async () => {
  await auth(request(app).post('/api/gl/voyageur/spells/loupe/cast'))
    .send({ target: 'pas-un-jeton' })
    .expect(400);
});

// --- S5 : niveau visible du MJ -----------------------------------------------------------

test('S5 — statistiques de classe : stade et penchant de chaque élève', async () => {
  const res = await auth(
    request(app).get(`/api/gl/stats/class?class_id=${classId}`),
    adminToken,
  ).expect(200);
  const row = res.body.players.find((p) => Number(p.id) === Number(playerId));
  assert.ok(row.voyageur, 'résumé voyageur présent');
  assert.ok(row.voyageur.level >= 4);
  assert.ok(row.voyageur.stage?.name);
  assert.equal(row.voyageur.affinity.key, 'proche');
  const mate = res.body.players.find((p) => p.pseudo === `vs-b-${stamp}`);
  assert.equal(mate.voyageur.level, 1);
});

// --- S6 : gestes de mascotte -------------------------------------------------------------

test('S6 — gestes débloqués par le niveau', async () => {
  assert.deepEqual(
    buildGestures(5).map((g) => [g.code, g.unlocked]),
    [
      ['salut', true],
      ['danse', false],
      ['cri', false],
    ],
  );
  const res = await auth(request(app).get('/api/gl/voyageur/me')).expect(200);
  assert.equal(res.body.gestures.length, 3);
});
