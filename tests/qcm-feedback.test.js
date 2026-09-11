import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getQcmFeedbackText,
  hasQcmAnswerFeedback,
  shouldShowQcmAnswerPhase,
} from '../src/shared/qcm/qcmFeedback.js';
import { OLU_CORRECT_FEEDBACK, OLU_WRONG_FEEDBACK } from '../src/shared/utils/oluLearningVoice.js';

describe('qcmFeedback (shared)', () => {
  test('getQcmFeedbackText extrait le message API', () => {
    assert.equal(getQcmFeedbackText({ correct: true, feedback: '  Bravo !  ' }), 'Bravo !');
  });

  // Le défaut est désormais une variante de la voix d'OLU, tirée sur la graine fournie par
  // l'appelant (docs/MASCOT_NARRATEUR_OLU.md §7.4) : ce qui se vérifie, c'est le pool
  // d'origine et la stabilité du tirage — pas une formulation figée.
  test('getQcmFeedbackText utilise un défaut si feedback vide mais correct défini', () => {
    assert.ok(OLU_CORRECT_FEEDBACK.includes(getQcmFeedbackText({ correct: true })));
    assert.ok(OLU_WRONG_FEEDBACK.includes(getQcmFeedbackText({ correct: false })));
  });

  test('la graine fixe la variante servie', () => {
    const seeded = getQcmFeedbackText({ correct: false }, { seed: 'QF0100' });
    assert.equal(getQcmFeedbackText({ correct: false }, { seed: 'QF0100' }), seeded);
    assert.ok(OLU_WRONG_FEEDBACK.includes(seeded));
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
