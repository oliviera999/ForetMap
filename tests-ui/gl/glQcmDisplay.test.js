import { describe, test, expect } from 'vitest';
import {
  getQcmFeedbackText,
  hasQcmAnswerFeedback,
  shouldShowQcmAnswerPhase,
} from '../../src/gl/utils/glQcmDisplay.js';
import {
  OLU_CORRECT_FEEDBACK,
  OLU_WRONG_FEEDBACK,
} from '../../src/shared/utils/oluLearningVoice.js';

describe('glQcmDisplay', () => {
  test('getQcmFeedbackText extrait le message API', () => {
    expect(getQcmFeedbackText({ correct: true, feedback: '  Bravo !  ' })).toBe('Bravo !');
  });

  // Le défaut n'est plus une phrase de formulaire mais la voix d'OLU, tirée d'un pool de
  // variantes (docs/MASCOT_NARRATEUR_OLU.md §7.4) : on vérifie qu'il en sort bien une, et
  // qu'elle vient du bon pool — pas sa formulation exacte, qui dépend de la graine.
  test('getQcmFeedbackText utilise un défaut si feedback vide mais correct défini', () => {
    expect(OLU_CORRECT_FEEDBACK).toContain(getQcmFeedbackText({ correct: true }));
    expect(OLU_WRONG_FEEDBACK).toContain(getQcmFeedbackText({ correct: false }));
  });

  test('la graine choisit la variante, et la même graine rend toujours la même', () => {
    const seeded = getQcmFeedbackText({ correct: true }, { seed: 'GQ0007' });
    expect(getQcmFeedbackText({ correct: true }, { seed: 'GQ0007' })).toBe(seeded);
    expect(OLU_CORRECT_FEEDBACK).toContain(seeded);
  });

  test('hasQcmAnswerFeedback ignore les erreurs', () => {
    expect(hasQcmAnswerFeedback({ error: 'échec' })).toBe(false);
    expect(hasQcmAnswerFeedback({ feedback: 'Non.' })).toBe(true);
    expect(hasQcmAnswerFeedback({ correct: true })).toBe(true);
  });

  test('shouldShowQcmAnswerPhase avec correct booléen', () => {
    expect(shouldShowQcmAnswerPhase({ correct: false })).toBe(true);
    expect(shouldShowQcmAnswerPhase(null)).toBe(false);
    expect(shouldShowQcmAnswerPhase({ error: 'x' })).toBe(false);
  });
});
