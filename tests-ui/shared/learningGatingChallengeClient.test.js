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

  // F1 (audit 2026-08) : en mode « any », le serveur n'attend qu'une bonne réponse — on ne
  // pose donc qu'une question, même si trois sont liées.
  it('se limite au nombre de réponses encore attendues (pending_count)', () => {
    const pending = pendingChallengeQuestions({
      required: true,
      pending_count: 1,
      questions: [
        { question_code: 'Q1', already_correct: false },
        { question_code: 'Q2', already_correct: false },
        { question_code: 'Q3', already_correct: false },
      ],
    });
    expect(pending).toHaveLength(1);
    expect(pending[0].question_code).toBe('Q1');
  });

  it('pose toutes les questions restantes quand pending_count les couvre', () => {
    const pending = pendingChallengeQuestions({
      required: true,
      pending_count: 3,
      questions: [
        { question_code: 'Q1', already_correct: true },
        { question_code: 'Q2', already_correct: false },
        { question_code: 'Q3', already_correct: false },
      ],
    });
    expect(pending.map((q) => q.question_code)).toEqual(['Q2', 'Q3']);
  });

  it('retombe sur « toutes les non réussies » sans pending_count (serveur ancien)', () => {
    const pending = pendingChallengeQuestions({
      required: true,
      questions: [
        { question_code: 'Q1', already_correct: false },
        { question_code: 'Q2', already_correct: false },
      ],
    });
    expect(pending).toHaveLength(2);
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

  // F6 (audit 2026-08) : promettre « tu pourras réessayer » alors qu'une erreur verrouille
  // la ressource 3 jours était faux. Le message suit désormais le délai réel.
  it('annonce le verrou quand un délai de nouvelle tentative est configuré (heures)', () => {
    const msg = buildGatingQuizIntroMessage(1, 'Feuillet', 72);
    expect(msg).toContain('3 jours');
    expect(msg).not.toContain('Tu pourras réessayer');
    expect(buildGatingQuizIntroMessage(1, 'Feuillet', 6)).toContain('6 h.');
  });

  it('accorde le singulier du délai et lit le challenge lui-même', () => {
    expect(buildGatingQuizIntroMessage(2, 'Feuillet', 24)).toContain('1 jour.');
    expect(buildGatingQuizIntroMessage(2, 'Feuillet', { retry_cooldown_hours: 36 })).toContain(
      '1 j 12 h.',
    );
    // Serveur antérieur : `retry_days` (jours) reste compris.
    expect(buildGatingQuizIntroMessage(2, 'Feuillet', { retry_days: 2 })).toContain('2 jours.');
  });

  it('promet le réessai immédiat quand le délai est nul', () => {
    const msg = buildGatingQuizIntroMessage(1, 'Feuillet', 0);
    expect(msg).toContain('Tu pourras réessayer');
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

  it('préfère le temps restant formaté par le serveur, en heures', () => {
    expect(buildCooldownLockMessage({ locked: true, remaining_days: 1 })).toContain('1 jour');
    expect(buildCooldownLockMessage({ locked: true, remaining_label: '5 h' })).toContain('5 h');
    expect(
      buildCooldownLockMessage({ locked: true, remaining_ms: 40 * 60 * 1000, remaining_days: 1 }),
    ).toContain('40 min');
    expect(buildCooldownLockMessage({ locked: true, remaining_days: 0 })).toContain(
      'quelques minutes',
    );
  });
});

// Portée « question seule » branchée (docs/AUDIT_VALIDATION_QUIZ_2026-09.md, lot 3).
import {
  buildGatingRules,
  buildQuestionLockMessage,
  isQuestionScopedLock,
} from '../../src/shared/utils/learningGatingChallengeClient.js';

describe('portée « question seule » — côté client', () => {
  it('pendingChallengeQuestions ne pose pas une question verrouillée', () => {
    const pending = pendingChallengeQuestions({
      required: true,
      pending_count: 2,
      ask_count: 2,
      questions: [
        { question_code: 'Q1', already_correct: false, locked: true },
        { question_code: 'Q2', already_correct: false, locked: false },
      ],
    });
    expect(pending.map((q) => q.question_code)).toEqual(['Q2']);
  });

  it('isQuestionScopedLock distingue la portée', () => {
    expect(isQuestionScopedLock({ locked: true, scope: 'question' })).toBe(true);
    expect(isQuestionScopedLock({ locked: true, scope: 'resource' })).toBe(false);
    expect(isQuestionScopedLock(null)).toBe(false);
  });

  it('buildQuestionLockMessage invite à continuer sur les autres questions', () => {
    const msg = buildQuestionLockMessage({
      locked: true,
      scope: 'question',
      remaining_label: '6 h',
    });
    expect(msg).toContain('6 h');
    expect(msg).toMatch(/continuer/i);
  });

  it('buildCooldownLockMessage explique qu’il ne reste plus de question à passer', () => {
    const msg = buildCooldownLockMessage(
      { locked: true, scope: 'question', remaining_label: '2 h', locked_questions: ['Q1'] },
      'Compost',
    );
    expect(msg).toMatch(/aucune autre/i);
    expect(msg).toContain('2 h');
    expect(msg).toContain('Compost');
  });

  it('buildGatingRules annonce la portée et les questions déjà bloquées', () => {
    const rules = buildGatingRules({
      required: true,
      ask_count: 1,
      pending_count: 2,
      retry_cooldown_hours: 6,
      cooldown_scope: 'question',
      cooldown: { locked: false, scope: 'question', locked_questions: ['Q1'] },
    }).join(' ');
    expect(rules).toMatch(/ne bloque que la question ratée/i);
    expect(rules).toMatch(/encore bloquée/i);
  });

  it('sans délai, la portée n’est pas annoncée (rien ne bloque)', () => {
    const rules = buildGatingRules({
      required: true,
      ask_count: 1,
      pending_count: 1,
      retry_cooldown_hours: 0,
      cooldown_scope: 'question',
    }).join(' ');
    expect(rules).not.toMatch(/question ratée/i);
  });
});
