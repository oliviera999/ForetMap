import { describe, test, expect } from 'vitest';
import { buildButtonAnnounce } from '../../src/shared/components/LearningAcknowledgeButton.jsx';
import {
  buildGatingRules,
  pendingChallengeQuestions,
} from '../../src/shared/utils/learningGatingChallengeClient.js';

describe('buildButtonAnnounce — prévenir avant le clic', () => {
  test('rien à annoncer sans conditionnement', () => {
    expect(buildButtonAnnounce(null)).toEqual({ announceBadge: '', announceTitle: '' });
    expect(buildButtonAnnounce({ required: false, ask_count: 3 }).announceBadge).toBe('');
  });

  test('rien à annoncer si le contrôle est déjà satisfait', () => {
    expect(
      buildButtonAnnounce({ required: true, satisfied: true, ask_count: 2 }).announceBadge,
    ).toBe('');
  });

  test('annonce le nombre de questions à venir', () => {
    const one = buildButtonAnnounce({ required: true, ask_count: 1, pending_count: 1 }, 'Compost');
    expect(one.announceBadge).toBe('1 question');
    expect(one.announceTitle).toMatch(/Compost/);

    const many = buildButtonAnnounce({ required: true, ask_count: 2, pending_count: 2 });
    expect(many.announceBadge).toBe('2 questions');
  });

  test('distingue ce qui est posé maintenant du total restant', () => {
    const partial = buildButtonAnnounce({ required: true, ask_count: 3, pending_count: 8 });
    expect(partial.announceBadge).toBe('3 questions');
    expect(partial.announceTitle).toMatch(/8 au total/);
  });

  test('une ressource verrouillée l’annonce, avec le délai', () => {
    const locked = buildButtonAnnounce(
      { required: true, locked: true, remaining_days: 2, ask_count: 1 },
      'Compost',
    );
    expect(locked.announceBadge).toBe('🔒');
    expect(locked.announceTitle).toMatch(/2 jours/);
  });
});

describe('buildGatingRules — dire ce qui va se passer', () => {
  const base = { required: true, ask_count: 1, pending_count: 1, cooldown: { retry_days: 3 } };

  test('aucune règle si rien n’est exigé', () => {
    expect(buildGatingRules({ required: false })).toEqual([]);
    expect(buildGatingRules(null)).toEqual([]);
  });

  test('sans tolérance, annonce qu’une seule erreur bloque', () => {
    const rules = buildGatingRules({ ...base, allowed_wrong_attempts: 0 });
    expect(rules.join(' ')).toMatch(/une seule erreur/i);
    expect(rules.join(' ')).toMatch(/3 jours/);
  });

  test('avec tolérance, annonce le nombre d’erreurs restantes', () => {
    const rules = buildGatingRules({ ...base, allowed_wrong_attempts: 2 });
    expect(rules.join(' ')).toMatch(/2 erreurs/);
  });

  test('la tolérance déjà entamée est décomptée', () => {
    const rules = buildGatingRules({
      ...base,
      allowed_wrong_attempts: 2,
      cooldown: { retry_days: 3, wrong_attempts: 1 },
    });
    expect(rules.join(' ')).toMatch(/reste 1 erreur/i);
  });

  test('sans délai de blocage, annonce le réessai immédiat', () => {
    const rules = buildGatingRules({ ...base, cooldown: { retry_days: 0 } });
    expect(rules.join(' ')).toMatch(/tout de suite/i);
    expect(rules.join(' ')).not.toMatch(/bloqu/i);
  });

  test('annonce le reliquat quand la session ne pose pas tout', () => {
    const rules = buildGatingRules({ ...base, ask_count: 3, pending_count: 8 });
    expect(rules.join(' ')).toMatch(/5 à réussir plus tard/);
    expect(rules.join(' ')).toMatch(/gardées/);
  });

  test('rappelle toujours que l’abandon ne coûte rien', () => {
    expect(buildGatingRules(base).join(' ')).toMatch(/Abandonner/i);
  });
});

describe('pendingChallengeQuestions — plafond par session', () => {
  const questions = [
    { question_code: 'A', already_correct: false },
    { question_code: 'B', already_correct: false },
    { question_code: 'C', already_correct: false },
  ];

  test('respecte ask_count quand le serveur le fournit', () => {
    const asked = pendingChallengeQuestions({
      required: true,
      questions,
      pending_count: 3,
      ask_count: 2,
    });
    expect(asked).toHaveLength(2);
  });

  test('retombe sur pending_count si ask_count est absent (serveur antérieur)', () => {
    const asked = pendingChallengeQuestions({ required: true, questions, pending_count: 3 });
    expect(asked).toHaveLength(3);
  });

  test('ne repose jamais une question déjà réussie', () => {
    const asked = pendingChallengeQuestions({
      required: true,
      questions: [{ question_code: 'A', already_correct: true }, ...questions],
      pending_count: 5,
      ask_count: 5,
    });
    expect(asked.every((q) => !q.already_correct)).toBe(true);
  });
});

describe('annonce et réglage de présentation', () => {
  test('le réglage prof « annoncer sur le bouton » éteint l’annonce', () => {
    // `announce` est recopié sur chaque ligne de résumé par le serveur : le front ne
    // lit pas les réglages prof, mais doit les respecter.
    const summary = { required: true, ask_count: 2, pending_count: 2 };
    expect(buildButtonAnnounce(summary, 'Le compostage').announceBadge).toBe('2 questions');
    expect(buildButtonAnnounce({ ...summary, announce: false }, 'Le compostage')).toEqual({
      announceBadge: '',
      announceTitle: '',
    });
  });

  test('rien à annoncer quand le contrôle est déjà acquis', () => {
    // La pastille d'état, elle, montre encore le « ✓ » : c'est une information,
    // pas un avertissement.
    expect(
      buildButtonAnnounce({ required: true, satisfied: true, pending_count: 0 }, 'Fiche'),
    ).toEqual({ announceBadge: '', announceTitle: '' });
  });
});
