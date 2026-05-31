'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  isPresentableQuestionRow,
  buildPresentation,
  presentableQuestionError,
} = require('../lib/glQcmQuestionQuery');

test('isPresentableQuestionRow exige au moins deux choix remplis', () => {
  assert.strictEqual(isPresentableQuestionRow({
    question_code: 'QCM0001',
    choix_a: 'Un',
    reponse_correcte: 'A',
  }), false);

  assert.strictEqual(isPresentableQuestionRow({
    question_code: 'QCM0001',
    choix_a: 'Un',
    choix_b: 'Deux',
    reponse_correcte: 'A',
  }), true);
});

test('buildPresentation refuse une question incomplète avec message explicite', () => {
  assert.throws(
    () => buildPresentation({ question_code: 'QCM0099', choix_a: 'Seul' }),
    (err) => err.message.includes('QCM0099')
  );
  assert.match(presentableQuestionError('qcm0001'), /QCM0001/);
});
