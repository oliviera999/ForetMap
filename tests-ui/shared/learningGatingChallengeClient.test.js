import { describe, expect, it } from 'vitest';
import {
  pendingChallengeQuestions,
  buildGatingQuizIntroMessage,
  isCooldownLocked,
  buildCooldownLockMessage,
} from '../../src/shared/utils/learningGatingChallengeClient.js';

describe('pendingChallengeQuestions', () => {
  it('retourne les questions sans bonne réponse', () => {
    const pending = pendingChallengeQuestions({
      required: true,
      questions: [
        { question_code: 'Q1', already_correct: true },
        { question_code: 'Q2', already_correct: false },
      ],
    });
    expect(pending).toHaveLength(1);
    expect(pending[0].question_code).toBe('Q2');
  });

  it('retourne vide si challenge non requis', () => {
    expect(
      pendingChallengeQuestions({ required: false, questions: [{ question_code: 'Q1' }] }),
    ).toEqual([]);
  });
});

describe('buildGatingQuizIntroMessage', () => {
  it('formule au singulier', () => {
    const msg = buildGatingQuizIntroMessage(1, 'Gnou bleu');
    expect(msg).toContain('une question');
    expect(msg).toContain('sera posée');
    expect(msg).toContain('Gnou bleu');
  });

  it('formule au pluriel', () => {
    const msg = buildGatingQuizIntroMessage(3, 'Tutoriel');
    expect(msg).toContain('3 questions');
    expect(msg).toContain('seront posées');
  });

  it('retourne vide si aucune question', () => {
    expect(buildGatingQuizIntroMessage(0)).toBe('');
  });
});

describe('isCooldownLocked', () => {
  it('vrai seulement si locked', () => {
    expect(isCooldownLocked({ locked: true, remaining_days: 3 })).toBe(true);
    expect(isCooldownLocked({ locked: false })).toBe(false);
    expect(isCooldownLocked(null)).toBe(false);
    expect(isCooldownLocked(undefined)).toBe(false);
  });
});

describe('buildCooldownLockMessage', () => {
  it('formule au pluriel avec le titre', () => {
    const msg = buildCooldownLockMessage({ locked: true, remaining_days: 3 }, 'Gnou bleu');
    expect(msg).toContain('3 jours');
    expect(msg).toContain('Gnou bleu');
    expect(msg.toLowerCase()).toContain('erreur');
  });

  it('formule au singulier et borne à 1 jour minimum', () => {
    expect(buildCooldownLockMessage({ locked: true, remaining_days: 1 })).toContain('1 jour');
    expect(buildCooldownLockMessage({ locked: true, remaining_days: 0 })).toContain('1 jour');
  });
});
