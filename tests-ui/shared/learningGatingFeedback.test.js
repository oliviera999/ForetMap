import { describe, expect, it } from 'vitest';
import { oluControlPassedSentence } from '../../src/shared/utils/oluLearningVoice.js';
import {
  buildCorrectAnswerNotice,
  buildWrongAnswerNotice,
  buildSessionPausedMessage,
  buildGatingQuizIntroMessage,
  buildGatingRules,
  buildCooldownLockMessage,
  buildQuestionLockMessage,
  readToleranceState,
} from '../../src/shared/utils/learningGatingChallengeClient.js';

// Les messages du contrôle de compréhension disaient des choses fausses (« une erreur
// bloque tout » même avec une tolérance réglée) ou ne disaient rien du tout (essais
// restants, progression, félicitations). Ces cas verrouillent les corrections.

describe('readToleranceState', () => {
  it('lit la tolérance d’un challenge, compteur de série compris', () => {
    expect(
      readToleranceState({ allowed_wrong_attempts: 2, cooldown: { wrong_attempts: 1 } }),
    ).toEqual({ tolerance: 2, used: 1, left: 1 });
  });

  it('préfère `attempts_left` quand le serveur le donne (bloc cooldown d’une réponse)', () => {
    expect(
      readToleranceState({ allowed_wrong_attempts: 3, wrong_attempts: 1, attempts_left: 2 }),
    ).toEqual({ tolerance: 3, used: 1, left: 2 });
  });

  it('ne descend jamais sous zéro, et supporte l’absence de source', () => {
    expect(readToleranceState(null)).toEqual({ tolerance: 0, used: 0, left: 0 });
    expect(readToleranceState({ allowed_wrong_attempts: 1, wrong_attempts: 4 }).left).toBe(0);
  });
});

describe('buildGatingQuizIntroMessage — ne plus promettre un blocage qui n’aura pas lieu', () => {
  it('annonce les erreurs restantes quand une tolérance est réglée', () => {
    const msg = buildGatingQuizIntroMessage(1, 'Compost', {
      retry_cooldown_hours: 6,
      allowed_wrong_attempts: 2,
    });
    expect(msg).toContain('il te reste 2 erreurs possibles');
    // Le mensonge d'avant : « une erreur bloquera la validation » malgré la tolérance.
    expect(msg).not.toMatch(/une erreur bloquera/);
  });

  it('décompte la tolérance déjà entamée', () => {
    const msg = buildGatingQuizIntroMessage(1, 'Compost', {
      retry_cooldown_hours: 6,
      allowed_wrong_attempts: 2,
      cooldown: { wrong_attempts: 1 },
    });
    expect(msg).toContain('il te reste 1 erreur possible');
  });

  it('en portée « question seule », c’est la question qui se ferme, pas la validation', () => {
    const msg = buildGatingQuizIntroMessage(1, 'Compost', {
      retry_cooldown_hours: 6,
      cooldown_scope: 'question',
    });
    expect(msg).toContain('bloquera cette question');
    expect(msg).not.toContain('bloquera la validation');
  });

  it('ne promet plus l’abandon « à tout moment » sans condition', () => {
    const msg = buildGatingQuizIntroMessage(1, 'Compost', 6);
    expect(msg).toContain("Tant que tu n'as pas répondu");
  });
});

describe('buildGatingRules — accord avec la portée du verrou', () => {
  it('ne dit plus « la validation sera bloquée » en portée question seule', () => {
    const rules = buildGatingRules({
      required: true,
      ask_count: 2,
      pending_count: 2,
      retry_cooldown_hours: 6,
      cooldown_scope: 'question',
      allowed_wrong_attempts: 0,
    }).join(' ');
    expect(rules).toContain('la question ratée sera bloquée');
    expect(rules).not.toContain('la validation sera bloquée');
  });
});

// La ligne ne félicite plus (le retour de la question le fait déjà) : elle situe. Les
// assertions portent donc sur les nombres et le titre, pas sur la formulation — celle-ci
// tourne d'une question à l'autre (voix d'OLU, §7.4).
describe('buildCorrectAnswerNotice — situer dans la série', () => {
  it('annonce ce qui reste dans la série', () => {
    const msg = buildCorrectAnswerNotice({
      questionIndex: 0,
      questionTotal: 3,
      itemTitle: 'Compost',
    });
    expect(msg).toContain('1 sur 3');
    expect(msg).toContain('2 questions');
    expect(msg).toContain('« Compost »');
  });

  it('annonce l’ouverture de la validation à la dernière question', () => {
    const msg = buildCorrectAnswerNotice({
      questionIndex: 1,
      questionTotal: 2,
      pendingTotal: 2,
      itemTitle: 'Compost',
    });
    expect(msg).toBe(oluControlPassedSentence('« Compost »'));
    expect(msg).toContain('« Compost »');
  });

  it('dit le reliquat quand la série ne couvre pas tout le contrôle', () => {
    const msg = buildCorrectAnswerNotice({ questionIndex: 2, questionTotal: 3, pendingTotal: 8 });
    expect(msg).toContain('5 questions');
    expect(msg).not.toBe(oluControlPassedSentence('ce contenu'));
  });
});

describe('buildWrongAnswerNotice — dire les essais restants', () => {
  it('annonce les erreurs encore permises', () => {
    expect(
      buildWrongAnswerNotice({
        locked: false,
        retry_hours: 6,
        allowed_wrong_attempts: 2,
        wrong_attempts: 1,
        attempts_left: 1,
      }),
    ).toContain('Il te reste 1 erreur possible');
  });

  it('prévient quand la prochaine erreur bloque', () => {
    const msg = buildWrongAnswerNotice({
      locked: false,
      retry_hours: 6,
      allowed_wrong_attempts: 2,
      wrong_attempts: 2,
      attempts_left: 0,
    });
    expect(msg).toContain('la prochaine erreur bloquera la validation');
    expect(msg).toContain('6 h');
  });

  it('se tait quand il n’y a rien à annoncer (verrou posé, aucun délai, aucune tolérance)', () => {
    expect(buildWrongAnswerNotice(null)).toBe('');
    expect(buildWrongAnswerNotice({ locked: true, retry_hours: 6 })).toBe('');
    expect(buildWrongAnswerNotice({ locked: false, retry_hours: 0 })).toBe('');
    expect(
      buildWrongAnswerNotice({ locked: false, retry_hours: 6, allowed_wrong_attempts: 0 }),
    ).toBe('');
  });

  it('vise la question en portée « question seule »', () => {
    expect(
      buildWrongAnswerNotice({
        locked: false,
        scope: 'question',
        retry_hours: 6,
        allowed_wrong_attempts: 1,
        attempts_left: 0,
      }),
    ).toContain('bloquera cette question');
  });
});

describe('buildSessionPausedMessage — série finie, contrôle inachevé', () => {
  it('dit combien il reste et que les bonnes réponses sont gardées', () => {
    const msg = buildSessionPausedMessage(5, 'Compost');
    expect(msg).toContain('5 questions');
    expect(msg).toContain('« Compost »');
    expect(msg).toMatch(/gardées/);
  });
});

describe('messages de verrou — compter les erreurs réellement commises', () => {
  it('accorde le pluriel quand la tolérance a été consommée', () => {
    expect(
      buildCooldownLockMessage(
        { locked: true, remaining_label: '6 h', wrong_attempts: 3 },
        'Compost',
      ),
    ).toContain('3 erreurs ont été commises');
  });

  it('ne promet plus « continue avec les autres » quand il n’y en a pas', () => {
    const msg = buildQuestionLockMessage(
      { locked: true, scope: 'question', remaining_label: '6 h' },
      { hasOtherQuestions: false },
    );
    expect(msg).not.toMatch(/continuer avec les autres/);
    expect(msg).toContain('6 h');
  });
});
