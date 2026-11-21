'use strict';

/**
 * Garde-fou du flux quiz ForetMap : les QCM de Gnomes & Licornes ne changent pas.
 *
 * Le retrait de la légende de photo se fait dans `lib/pedago/quizService.js`, **après**
 * l'appel du module commun `lib/qcmChoices.js` : `/api/gl/qcm` et `/api/gl/lore/qcm` doivent
 * donc servir exactement la même charge de présentation (légende comprise), le même jeton et
 * le même corps de réponse qu'avant. Ce fichier fige ces trois formes, par les routes.
 *
 * Complète `tests/qcm-shared-payload-snapshot.test.js`, qui fige les fonctions partagées
 * sans passer par les routes G&L.
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');

const stamp = Date.now();
const QCM_CODE = `GQS${String(stamp).slice(-9)}`;
const LORE_CODE = `LQS${String(stamp).slice(-9)}`;
const QCM_CATEGORY = `fig-cat-${stamp}`;
const LORE_CATEGORY = `fig-lore-${stamp}`;
const LORE_SCOPE = `fig-scope-${stamp}`;
const LEGENDE = `Légende figée ${stamp}`;
const CHOICES = ['Le ver de terre', 'Le merle', 'Le hérisson'];
let playerToken = '';
let classId;
let playerId;

/** Charge de présentation de `GET /api/gl/qcm/questions/:code/present`. */
const QCM_PRESENT_KEYS = [
  'choices',
  'glossaryTerms',
  'photoCredit',
  'photoLegende',
  'photoLicence',
  'photoUrl',
  'presentationToken',
  'question',
  'questionCode',
  'resource',
  'wikipediaUrl',
];
/** Le QCM de lore ajoute son jeu et ses termes de glossaire. */
const LORE_PRESENT_KEYS = [...QCM_PRESENT_KEYS, 'loreGlossaryTerms', 'qcmSet'].sort();
/** Revendications du jeton G&L d'une présentation libre (ni ressource, ni partie, ni compte). */
const TOKEN_CLAIMS = [
  'answerHash',
  'choiceLetters',
  'exp',
  'iat',
  'jti',
  'kind',
  'nonce',
  'questionCode',
];

function claimsOf(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

const get = (path) => request(app).get(path).set('Authorization', `Bearer ${playerToken}`);
const post = (path, body) =>
  request(app).post(path).set('Authorization', `Bearer ${playerToken}`).send(body);

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_classes (name, school, is_active, created_at, updated_at)
     VALUES (?, 'Ecole', 1, NOW(), NOW())`,
    [`Classe figée ${stamp}`],
  );
  classId = (
    await queryOne('SELECT id FROM gl_classes WHERE name = ? LIMIT 1', [`Classe figée ${stamp}`])
  ).id;
  await execute(
    `INSERT INTO gl_players (class_id, pseudo, legacy_password_hash, is_active, created_at, updated_at)
     VALUES (?, ?, 'x', 1, NOW(), NOW())`,
    [classId, `fige-${stamp}`],
  );
  playerId = (
    await queryOne('SELECT id FROM gl_players WHERE pseudo = ? LIMIT 1', [`fige-${stamp}`])
  ).id;
  playerToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(playerId),
    roleSlug: 'gl_player',
    permissions: ['gl.read'],
  });

  const biome = await queryOne('SELECT slug FROM gl_biomes ORDER BY slug LIMIT 1');
  assert.ok(biome?.slug, 'au moins un biome G&L attendu dans la base de test');
  await execute(
    `INSERT INTO gl_qcm_categories (slug, nom, order_index) VALUES (?, 'Catégorie figée', 990)`,
    [QCM_CATEGORY],
  );
  await execute(
    `INSERT INTO gl_qcm_questions
       (question_code, biome_slug, categorie_slug, numero_dans_categorie, question,
        choix_a, choix_b, choix_c, choix_d, choix_e, reponse_correcte,
        feedback_correct, feedback_b,
        photo_url, photo_credit, photo_licence, photo_legende, wikipedia_url, statut)
     VALUES (?, ?, ?, 1, 'Quel animal décompose la litière ?', ?, ?, ?, '', '', 'A',
             'Oui : il digère la litière.', 'Le merle mange les vers.',
             '/uploads/fige.jpg', 'Crédit', 'CC BY', ?,
             'https://fr.wikipedia.org/wiki/Lombric', 'actif')`,
    [QCM_CODE, biome.slug, QCM_CATEGORY, ...CHOICES, LEGENDE],
  );
  await execute(
    `INSERT INTO gl_qcm_lore_scopes (slug, nom, order_index) VALUES (?, 'Chapitre figé', 990)`,
    [LORE_SCOPE],
  );
  await execute(
    `INSERT INTO gl_qcm_lore_categories (slug, nom, order_index) VALUES (?, 'Lore figé', 990)`,
    [LORE_CATEGORY],
  );
  await execute(
    `INSERT INTO gl_qcm_lore_questions
       (question_code, chapitre_slug, categorie_slug, numero_dans_categorie, question,
        choix_a, choix_b, choix_c, choix_d, choix_e, reponse_correcte,
        feedback_correct, feedback_b, statut)
     VALUES (?, ?, ?, 1, 'Qui répare la Trame ?', ?, ?, ?, '', '', 'A',
             'Oui, c’est lui.', 'Non, pas le merle.', 'actif')`,
    [LORE_CODE, LORE_SCOPE, LORE_CATEGORY, ...CHOICES],
  );
});

after(async () => {
  await execute('DELETE FROM gl_qcm_questions WHERE question_code = ?', [QCM_CODE]);
  await execute('DELETE FROM gl_qcm_categories WHERE slug = ?', [QCM_CATEGORY]);
  await execute('DELETE FROM gl_qcm_lore_questions WHERE question_code = ?', [LORE_CODE]);
  await execute('DELETE FROM gl_qcm_lore_categories WHERE slug = ?', [LORE_CATEGORY]);
  await execute('DELETE FROM gl_qcm_lore_scopes WHERE slug = ?', [LORE_SCOPE]);
  await execute('DELETE FROM gl_players WHERE id = ?', [playerId]);
  await execute('DELETE FROM gl_classes WHERE id = ?', [classId]);
});

test('/api/gl/qcm — présentation : charge inchangée, légende de photo toujours servie', async () => {
  const { body } = await get(`/api/gl/qcm/questions/${QCM_CODE}/present`).expect(200);
  assert.deepEqual(Object.keys(body).sort(), QCM_PRESENT_KEYS);
  assert.equal(body.questionCode, QCM_CODE);
  assert.equal(body.question, 'Quel animal décompose la litière ?');
  assert.equal(body.resource, null);
  assert.equal(body.photoUrl, '/uploads/fige.jpg');
  assert.equal(body.photoCredit, 'Crédit');
  assert.equal(body.photoLicence, 'CC BY');
  // Le retrait de la légende ne vaut que pour le quiz ForetMap.
  assert.equal(body.photoLegende, LEGENDE);
  assert.equal(body.wikipediaUrl, 'https://fr.wikipedia.org/wiki/Lombric');
  assert.ok(Array.isArray(body.glossaryTerms));
  assert.deepEqual(
    body.choices.map((c) => Object.keys(c).sort()),
    [
      ['id', 'text'],
      ['id', 'text'],
      ['id', 'text'],
    ],
  );
  assert.deepEqual(body.choices.map((c) => c.text).sort(), [...CHOICES].sort());

  const claims = claimsOf(body.presentationToken);
  assert.deepEqual(Object.keys(claims).sort(), TOKEN_CLAIMS);
  assert.equal(claims.kind, 'gl_qcm_present');
  assert.equal(claims.questionCode, QCM_CODE);
  assert.deepEqual([...claims.choiceLetters].sort(), ['A', 'B', 'C']);
});

test('/api/gl/qcm — réponse : corps inchangé (juste, puis faux)', async () => {
  const good = (await get(`/api/gl/qcm/questions/${QCM_CODE}/present`).expect(200)).body;
  const goodId = good.choices.find((c) => c.text === CHOICES[0]).id;
  const right = await post(`/api/gl/qcm/questions/${QCM_CODE}/answer`, {
    presentationToken: good.presentationToken,
    choiceId: goodId,
  }).expect(200);
  // `voyageurGain` n'accompagne qu'une première bonne réponse créditée : clé facultative.
  const rightKeys = Object.keys(right.body)
    .filter((k) => k !== 'voyageurGain')
    .sort();
  assert.deepEqual(rightKeys, ['correct', 'correctChoiceId', 'feedback', 'glossaryTerms']);
  assert.equal(right.body.correct, true);
  assert.equal(right.body.correctChoiceId, goodId);
  assert.equal(right.body.feedback, 'Oui : il digère la litière.');
  assert.ok(!('photoLegende' in right.body), 'clé propre au quiz ForetMap');

  const bad = (await get(`/api/gl/qcm/questions/${QCM_CODE}/present`).expect(200)).body;
  const wrong = await post(`/api/gl/qcm/questions/${QCM_CODE}/answer`, {
    presentationToken: bad.presentationToken,
    choiceId: bad.choices.find((c) => c.text === CHOICES[1]).id,
  }).expect(200);
  assert.deepEqual(Object.keys(wrong.body).sort(), ['correct', 'feedback']);
  assert.equal(wrong.body.correct, false);
  assert.equal(typeof wrong.body.feedback, 'string');
  assert.ok(wrong.body.feedback.trim().length > 0);
});

test('/api/gl/lore/qcm — présentation et réponse : formes inchangées', async () => {
  const { body } = await get(`/api/gl/lore/qcm/questions/${LORE_CODE}/present`).expect(200);
  assert.deepEqual(Object.keys(body).sort(), LORE_PRESENT_KEYS);
  assert.equal(body.qcmSet, 'lore');
  assert.equal(body.questionCode, LORE_CODE);
  // Les questions de lore n'ont pas de photo : les clés restent, à `null`.
  assert.equal(body.photoUrl, null);
  assert.equal(body.photoLegende, null);
  assert.ok(Array.isArray(body.loreGlossaryTerms));
  const claims = claimsOf(body.presentationToken);
  assert.deepEqual(Object.keys(claims).sort(), TOKEN_CLAIMS);
  // Même type de jeton que le QCM des biomes.
  assert.equal(claims.kind, 'gl_qcm_present');

  const goodId = body.choices.find((c) => c.text === CHOICES[0]).id;
  const right = await post(`/api/gl/lore/qcm/questions/${LORE_CODE}/answer`, {
    presentationToken: body.presentationToken,
    choiceId: goodId,
  }).expect(200);
  const rightKeys = Object.keys(right.body)
    .filter((k) => k !== 'voyageurGain')
    .sort();
  assert.deepEqual(rightKeys, [
    'correct',
    'correctChoiceId',
    'feedback',
    'loreGlossaryTerms',
    'qcmSet',
  ]);
  assert.equal(right.body.correct, true);
  assert.equal(right.body.feedback, 'Oui, c’est lui.');

  const again = (await get(`/api/gl/lore/qcm/questions/${LORE_CODE}/present`).expect(200)).body;
  const wrong = await post(`/api/gl/lore/qcm/questions/${LORE_CODE}/answer`, {
    presentationToken: again.presentationToken,
    choiceId: again.choices.find((c) => c.text === CHOICES[2]).id,
  }).expect(200);
  assert.deepEqual(Object.keys(wrong.body).sort(), ['correct', 'feedback', 'qcmSet']);
  assert.equal(wrong.body.correct, false);
});
