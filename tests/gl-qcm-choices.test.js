'use strict';

require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const {
  presentQuestion,
  verifyPresentationAnswer,
  resolveQcmAnswerFeedback,
  fisherYates,
} = require('../lib/qcmChoices');

const SAMPLE_QUESTION = {
  question_code: 'QCM0001',
  question: 'Question test ?',
  choix_a: 'Alpha',
  choix_b: 'Bravo',
  choix_c: 'Charlie',
  choix_d: 'Delta',
  choix_e: 'Echo',
  reponse_correcte: 'A',
};

test('presentQuestion mélange les choix', () => {
  const orders = new Set();
  for (let i = 0; i < 20; i += 1) {
    const presentation = presentQuestion(SAMPLE_QUESTION);
    assert.strictEqual(presentation.choices.length, 5);
    assert.ok(presentation.presentationToken);
    assert.ok(!presentation.choices.some((c) => c.letter));
    orders.add(presentation.choices.map((c) => c.text).join('|'));
  }
  assert.ok(orders.size > 1, 'plusieurs ordres attendus sur 20 tirages');
});

test('verifyPresentationAnswer valide la bonne réponse', () => {
  const presentation = presentQuestion(SAMPLE_QUESTION);
  const correctId = presentation.choices.findIndex((c) => c.text === 'Alpha');
  const ok = verifyPresentationAnswer(presentation.presentationToken, 'QCM0001', correctId);
  assert.strictEqual(ok.correct, true);

  const wrongId = presentation.choices.findIndex((c) => c.text !== 'Alpha');
  const ko = verifyPresentationAnswer(presentation.presentationToken, 'QCM0001', wrongId);
  assert.strictEqual(ko.correct, false);
});

test('le jeton de présentation ne contient pas la bonne réponse', () => {
  // Un JWT est signé, pas chiffré : tout ce qu'il porte est lisible par l'élève. Le jeton
  // exposait `correctChoiceId` — un `atob()` dans la console suffisait à connaître la
  // réponse avant de répondre. Il ne porte plus qu'une empreinte HMAC vérifiable côté
  // serveur uniquement.
  const presentation = presentQuestion(SAMPLE_QUESTION);
  const claims = jwt.decode(presentation.presentationToken);
  const correctId = presentation.choices.findIndex((c) => c.text === 'Alpha');

  assert.strictEqual(claims.correctChoiceId, undefined);
  assert.ok(claims.answerHash, 'empreinte de la bonne réponse attendue');
  assert.ok(claims.nonce, 'nonce attendu');
  // Aucun champ du jeton ne désigne la bonne réponse, ni par sa position ni par son texte.
  assert.ok(!Object.values(claims).includes(correctId), 'position de la bonne réponse exposée');
  assert.ok(!JSON.stringify(claims).includes('Alpha'), 'texte de la bonne réponse exposé');
});

test('chaque présentation porte un jti unique (consommation à usage unique)', () => {
  // Le jti est ce qui permet de refuser un rejeu du même jeton en partie
  // (cf. lib/qcmPresentationUse.js) : deux présentations ne doivent jamais le partager.
  const first = presentQuestion(SAMPLE_QUESTION);
  const second = presentQuestion(SAMPLE_QUESTION);
  const jtiFirst = jwt.decode(first.presentationToken).jti;
  assert.ok(jtiFirst);
  assert.notStrictEqual(jtiFirst, jwt.decode(second.presentationToken).jti);
  // Il est remonté à l'appelant, quelle que soit la justesse de la réponse.
  const answered = verifyPresentationAnswer(first.presentationToken, 'QCM0001', 0);
  assert.strictEqual(answered.jti, jtiFirst);
});

test('deux présentations de la même question donnent des empreintes différentes', () => {
  // Sans nonce, deux jetons portant la bonne réponse à la même position auraient la même
  // empreinte : un élève pourrait rapprocher deux tirages.
  const seen = new Set();
  for (let i = 0; i < 20; i += 1) {
    seen.add(jwt.decode(presentQuestion(SAMPLE_QUESTION).presentationToken).answerHash);
  }
  assert.strictEqual(seen.size, 20);
});

test('un jeton de l’ancien format (réponse en clair) est refusé', () => {
  const legacy = jwt.sign(
    {
      kind: 'gl_qcm_present',
      questionCode: 'QCM0001',
      jti: 'legacy',
      correctChoiceId: 0,
      choiceLetters: ['A'],
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' },
  );
  assert.throws(() => verifyPresentationAnswer(legacy, 'QCM0001', 0), /invalide/i);
});

test('verifyPresentationAnswer ne révèle pas la bonne réponse sur une erreur', () => {
  const presentation = presentQuestion(SAMPLE_QUESTION);
  const wrongId = presentation.choices.findIndex((c) => c.text !== 'Alpha');
  const ko = verifyPresentationAnswer(presentation.presentationToken, 'QCM0001', wrongId);
  assert.strictEqual(ko.correct, false);
  assert.strictEqual(ko.correctChoiceId, null);
});

test('resolveQcmAnswerFeedback utilise le feedback du choix sélectionné', () => {
  const row = {
    feedback_correct: 'Exact !',
    feedback_a: 'Msg A',
    feedback_b: 'Msg B',
  };
  assert.strictEqual(
    resolveQcmAnswerFeedback(row, { correct: true, selectedLetter: 'A' }),
    'Exact !',
  );
  assert.strictEqual(
    resolveQcmAnswerFeedback(row, { correct: false, selectedLetter: 'B' }),
    'Msg B',
  );
  assert.match(
    resolveQcmAnswerFeedback(row, { correct: false, selectedLetter: null }),
    /pas la bonne/i,
  );
});

test('verifyPresentationAnswer expose selectedLetter via JWT', () => {
  const presentation = presentQuestion(SAMPLE_QUESTION);
  const wrongId = presentation.choices.findIndex((c) => c.text !== 'Alpha');
  const ko = verifyPresentationAnswer(presentation.presentationToken, 'QCM0001', wrongId);
  assert.strictEqual(ko.correct, false);
  assert.ok(ko.selectedLetter);
  assert.notStrictEqual(ko.selectedLetter, 'A');
});

test('fisherYates préserve les éléments', () => {
  const input = [1, 2, 3, 4, 5];
  const out = fisherYates(input);
  assert.strictEqual(out.length, 5);
  assert.deepStrictEqual([...out].sort(), input);
});
