import { describe, test, expect } from 'vitest';
import {
  getQcmFeedbackText,
  hasQcmAnswerFeedback,
  shouldShowQcmAnswerPhase,
} from '../../src/gl/utils/glQcmDisplay.js';

describe('glQcmDisplay', () => {
  test('getQcmFeedbackText extrait le message API', () => {
    expect(getQcmFeedbackText({ correct: true, feedback: '  Bravo !  ' })).toBe('Bravo !');
  });

  test('getQcmFeedbackText utilise un défaut si feedback vide mais correct défini', () => {
    expect(getQcmFeedbackText({ correct: true })).toBe('Bonne réponse !');
    expect(getQcmFeedbackText({ correct: false })).toMatch(/pas la bonne/i);
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
