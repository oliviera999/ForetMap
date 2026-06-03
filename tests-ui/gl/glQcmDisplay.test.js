import { describe, test, expect } from 'vitest';
import { getQcmFeedbackText, hasQcmAnswerFeedback } from '../../src/gl/utils/glQcmDisplay.js';

describe('glQcmDisplay', () => {
  test('getQcmFeedbackText extrait le message API', () => {
    expect(getQcmFeedbackText({ correct: true, feedback: '  Bravo !  ' })).toBe('Bravo !');
  });

  test('hasQcmAnswerFeedback ignore les erreurs', () => {
    expect(hasQcmAnswerFeedback({ error: 'échec' })).toBe(false);
    expect(hasQcmAnswerFeedback({ feedback: 'Non.' })).toBe(true);
  });
});
