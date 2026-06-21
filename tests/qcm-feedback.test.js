import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getQcmFeedbackText,
  hasQcmAnswerFeedback,
  shouldShowQcmAnswerPhase,
} from '../src/shared/qcm/qcmFeedback.js';

describe('qcmFeedback (shared)', () => {
  test('getQcmFeedbackText extrait le message API', () => {
    assert.equal(getQcmFeedbackText({ correct: true, feedback: '  Bravo !  ' }), 'Bravo !');
  });

  test('getQcmFeedbackText utilise un défaut si feedback vide mais correct défini', () => {
    assert.equal(getQcmFeedbackText({ correct: true }), 'Bonne réponse !');
    assert.match(getQcmFeedbackText({ correct: false }), /pas la bonne/i);
  });

  test('hasQcmAnswerFeedback ignore les erreurs', () => {
    assert.equal(hasQcmAnswerFeedback({ error: 'échec' }), false);
    assert.equal(hasQcmAnswerFeedback({ feedback: 'Non.' }), true);
    assert.equal(hasQcmAnswerFeedback({ correct: true }), true);
  });

  test('shouldShowQcmAnswerPhase avec correct booléen', () => {
    assert.equal(shouldShowQcmAnswerPhase({ correct: false }), true);
    assert.equal(shouldShowQcmAnswerPhase(null), false);
    assert.equal(shouldShowQcmAnswerPhase({ error: 'x' }), false);
  });
});
