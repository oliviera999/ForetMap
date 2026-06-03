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
  const ok = verifyPresentationAnswer(
    presentation.presentationToken,
    'QCM0001',
    correctId
  );
  assert.strictEqual(ok.correct, true);

  const wrongId = presentation.choices.findIndex((c) => c.text !== 'Alpha');
  const ko = verifyPresentationAnswer(
    presentation.presentationToken,
    'QCM0001',
    wrongId
  );
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
    'Exact !'
  );
  assert.strictEqual(
    resolveQcmAnswerFeedback(row, { correct: false, selectedLetter: 'B' }),
    'Msg B'
  );
  assert.match(
    resolveQcmAnswerFeedback(row, { correct: false, selectedLetter: null }),
    /pas la bonne/i
  );
});

test('verifyPresentationAnswer expose selectedLetter via JWT', () => {
  const presentation = presentQuestion(SAMPLE_QUESTION);
  const wrongId = presentation.choices.findIndex((c) => c.text !== 'Alpha');
  const ko = verifyPresentationAnswer(
    presentation.presentationToken,
    'QCM0001',
    wrongId
  );
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
