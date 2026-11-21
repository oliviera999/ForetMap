'use strict';

/**
 * Présentation d'une question du quiz ForetMap (`GET /api/quiz/questions/:code/present`) :
 *   - les choix sont **mélangés** à chaque présentation, et la bonne réponse reste vérifiable
 *     quel que soit l'ordre servi ;
 *   - la **légende de la photo** (le plus souvent le nom du sujet, donc la réponse) n'est pas
 *     dans la présentation ; elle arrive avec la réponse (`POST …/answer`).
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { initSchema, execute } = require('../database');
const { app } = require('../server');
const quizService = require('../lib/pedago/quizService');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

const stamp = Date.now().toString(36);
const CATEGORY = `melange${stamp}`.slice(0, 60);
const CODE = `QM${String(Date.now()).slice(-8)}`;
const CODE_SANS_LEGENDE = `QN${String(Date.now()).slice(-8)}`;
const LEGENDE = `Coccinelle à sept points ${stamp}`;
const CHOICES = ['Une coccinelle', 'Un puceron', 'Une fourmi', 'Un carabe', 'Une punaise'];
const CORRECT = 'Une coccinelle';

/** Présentations demandées : 5 choix → 120 ordres, un ordre unique 40 fois de suite est exclu. */
const DRAWS = 40;

async function present(code = CODE) {
  const res = await request(app).get(`/api/quiz/questions/${code}/present`).expect(200);
  return res.body;
}

function claimsOf(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

async function answer(code, presentation, choiceId) {
  const res = await request(app)
    .post(`/api/quiz/questions/${code}/answer`)
    .send({ presentationToken: presentation.presentationToken, choiceId })
    .expect(200);
  return res.body;
}

test.before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO quiz_categories (slug, nom, theme, order_index) VALUES (?, ?, 'sciences', 991)`,
    [CATEGORY, `Mélange ${stamp}`],
  );
  const insert = `INSERT INTO quiz_questions
       (question_code, categorie_slug, numero_dans_categorie, question,
        choix_a, choix_b, choix_c, choix_d, choix_e, reponse_correcte, niveau, difficulte,
        feedback_correct, feedback_b, photo_url, photo_credit, photo_licence, photo_legende, statut)
     VALUES (?, ?, ?, 'Quel est cet insecte ?', ?, ?, ?, ?, ?, 'A', 'college', 1,
             'Oui, une coccinelle.', 'Non, le puceron est sa proie.',
             '/uploads/test-coccinelle.jpg', 'A. Auteur', 'CC BY', ?, 'actif')`;
  await execute(insert, [CODE, CATEGORY, 1, ...CHOICES, LEGENDE]);
  await execute(insert, [CODE_SANS_LEGENDE, CATEGORY, 2, ...CHOICES, null]);
});

test.after(async () => {
  await execute('DELETE FROM user_quiz_attempts WHERE categorie_slug = ?', [CATEGORY]);
  await execute('DELETE FROM quiz_questions WHERE categorie_slug = ?', [CATEGORY]);
  await execute('DELETE FROM quiz_categories WHERE slug = ?', [CATEGORY]);
});

test('present : l’ordre des choix varie, la bonne réponse change de place', async () => {
  const orders = new Set();
  const correctPositions = new Set();
  for (let i = 0; i < DRAWS; i += 1) {
    const body = await present();
    // Toujours les mêmes textes, numérotés 0..n-1 dans l'ordre servi.
    assert.deepEqual(body.choices.map((c) => c.text).sort(), [...CHOICES].sort());
    assert.deepEqual(
      body.choices.map((c) => c.id),
      [0, 1, 2, 3, 4],
    );
    orders.add(body.choices.map((c) => c.text).join('|'));
    correctPositions.add(body.choices.findIndex((c) => c.text === CORRECT));
  }
  assert.ok(orders.size > 1, `un seul ordre servi sur ${DRAWS} présentations`);
  assert.ok(correctPositions.size > 1, 'la bonne réponse reste à la même place');
});

test('present : ni la charge ni le jeton ne disent où est la bonne réponse', async () => {
  const body = await present();
  assert.ok(!('correctChoiceId' in body));
  assert.ok(!('reponse_correcte' in body));
  const claims = claimsOf(body.presentationToken);
  assert.equal(claims.kind, 'fm_quiz_present');
  assert.ok(!('correctChoiceId' in claims), 'bonne réponse en clair dans le jeton');
  assert.match(claims.answerHash, /^[0-9a-f]{64}$/);
  // Les lettres du jeton suivent l'ordre servi : elles ne désignent pas la bonne.
  assert.deepEqual([...claims.choiceLetters].sort(), ['A', 'B', 'C', 'D', 'E']);
});

test('answer : la bonne réponse est reconnue quel que soit l’ordre servi', async () => {
  const seenPositions = new Set();
  for (let i = 0; i < 12; i += 1) {
    const body = await present();
    const correctId = body.choices.find((c) => c.text === CORRECT).id;
    seenPositions.add(correctId);
    const good = await answer(CODE, body, correctId);
    assert.equal(good.correct, true);
    assert.equal(good.correctChoiceId, correctId);
    assert.equal(good.feedback, 'Oui, une coccinelle.');
  }
  assert.ok(seenPositions.size > 1, 'bonne réponse vérifiée à plusieurs places');

  // Mauvais choix : refusé, avec le retour du choix sélectionné (retrouvé par sa lettre).
  const body = await present();
  const wrongId = body.choices.find((c) => c.text === 'Un puceron').id;
  const bad = await answer(CODE, body, wrongId);
  assert.equal(bad.correct, false);
  assert.ok(!('correctChoiceId' in bad));
  assert.equal(bad.feedback, 'Non, le puceron est sa proie.');
});

test('légende de la photo : absente de present, présente dans answer', async () => {
  const body = await present();
  assert.ok(!('photoLegende' in body), 'la légende ne doit pas précéder la réponse');
  assert.ok(!JSON.stringify(body).includes(LEGENDE), 'légende présente ailleurs dans la charge');
  // Le reste de l'illustration est servi : image, crédit et licence s'affichent avant la réponse.
  assert.equal(body.photoUrl, '/uploads/test-coccinelle.jpg');
  assert.equal(body.photoCredit, 'A. Auteur');
  assert.equal(body.photoLicence, 'CC BY');
  assert.deepEqual(Object.keys(body).sort(), [
    'choices',
    'glossaryTerms',
    'photoCredit',
    'photoLicence',
    'photoUrl',
    'presentationToken',
    'question',
    'questionCode',
    'resource',
    'wikipediaUrl',
  ]);

  const correctId = body.choices.find((c) => c.text === CORRECT).id;
  assert.equal((await answer(CODE, body, correctId)).photoLegende, LEGENDE);

  // Quiz libre (jeton sans contexte ressource) : la légende accompagne aussi une erreur.
  const again = await present();
  const wrongId = again.choices.find((c) => c.text !== CORRECT).id;
  assert.equal((await answer(CODE, again, wrongId)).photoLegende, LEGENDE);
});

test('légende de la photo : gardée dans present pour qui gère le catalogue (aperçu)', async () => {
  const teacherToken = await ensureAdminTeacherAuthToken();
  const manager = await request(app)
    .get(`/api/quiz/questions/${CODE}/present`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .expect(200);
  assert.equal(manager.body.photoLegende, LEGENDE);

  // Un élève connecté reste sans légende, comme un visiteur.
  const student = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Legende', lastName: `Photo${stamp}`, password: 'pass1234' })
    .expect(201);
  const asStudent = await request(app)
    .get(`/api/quiz/questions/${CODE}/present`)
    .set('Authorization', `Bearer ${student.body.authToken}`)
    .expect(200);
  assert.ok(!('photoLegende' in asStudent.body));
});

test('légende de la photo : question sans légende, clé absente de answer', async () => {
  const body = await present(CODE_SANS_LEGENDE);
  assert.ok(!('photoLegende' in body));
  const correctId = body.choices.find((c) => c.text === CORRECT).id;
  assert.ok(!('photoLegende' in (await answer(CODE_SANS_LEGENDE, body, correctId))));
});

test('légende de la photo : tue après une erreur du parcours de validation', () => {
  const row = { photo_legende: `  ${LEGENDE} ` };
  const resource = { type: 'plant', ref: '12' };
  const { revealedPhotoLegende } = quizService;
  assert.equal(revealedPhotoLegende(row, { correct: true, resource }), LEGENDE);
  assert.equal(revealedPhotoLegende(row, { correct: false, resource: null }), LEGENDE);
  // La question sera reposée pour valider la fiche : la légende donnerait la réponse.
  assert.equal(revealedPhotoLegende(row, { correct: false, resource }), undefined);
  assert.equal(revealedPhotoLegende({ photo_legende: '  ' }, { correct: true }), undefined);
});
