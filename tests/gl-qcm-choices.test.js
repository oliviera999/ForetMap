'use strict';

require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert');
const {
  presentQuestion,
  verifyPresentationAnswer,
  resolveQcmAnswerFeedback,
  fisherYates,
} = require('../lib/glQcmChoices');

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
  const ok = verifyPresentationAnswer(presentation.presentationToken, 'QCM0001', correctId, {
    correctLetter: 'A',
  });
  assert.strictEqual(ok.correct, true);

  const wrongId = presentation.choices.findIndex((c) => c.text !== 'Alpha');
  const ko = verifyPresentationAnswer(presentation.presentationToken, 'QCM0001', wrongId, {
    correctLetter: 'A',
  });
  assert.strictEqual(ko.correct, false);
});

test('presentationToken JWT ne contient pas correctChoiceId (anti-triche)', () => {
  const presentation = presentQuestion(SAMPLE_QUESTION);
  const payloadB64 = String(presentation.presentationToken).split('.')[1];
  const json = Buffer.from(payloadB64, 'base64url').toString('utf8');
  const claims = JSON.parse(json);
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(claims, 'correctChoiceId'),
    false,
    'correctChoiceId ne doit pas figurer dans le JWT lisible côté client',
  );
  assert.ok(Array.isArray(claims.choiceLetters), 'choiceLetters conservé pour le mapping');
  // Même un JWT legacy avec correctChoiceId ne doit pas faire foi : la lettre serveur gagne.
  const jwt = require('jsonwebtoken');
  const { JWT_SECRET } = require('../middleware/requireTeacher');
  const legacyToken = jwt.sign(
    {
      kind: 'gl_qcm_present',
      questionCode: 'QCM0001',
      correctChoiceId: 0,
      choiceLetters: ['B', 'A', 'C', 'D', 'E'],
    },
    JWT_SECRET,
    { expiresIn: '15m' },
  );
  // Bonne lettre = A → index 1 dans choiceLetters, pas 0 (valeur legacy trompeuse).
  const ok = verifyPresentationAnswer(legacyToken, 'QCM0001', 1, { correctLetter: 'A' });
  assert.strictEqual(ok.correct, true);
  assert.strictEqual(ok.correctChoiceId, 1);
  const ko = verifyPresentationAnswer(legacyToken, 'QCM0001', 0, { correctLetter: 'A' });
  assert.strictEqual(ko.correct, false);
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
  const ko = verifyPresentationAnswer(presentation.presentationToken, 'QCM0001', wrongId, {
    correctLetter: 'A',
  });
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
