'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
  answerLengthProfile,
  hasAnswerLengthBias,
  summarizeAnswerLengthBias,
  detectQuestionIssues,
  analyzePedagoSnapshot,
  formatAuditReport,
  LENGTH_BIAS_RATIO,
  LENGTH_BIAS_GAP,
} = require('../lib/pedagoContentAudit');

/**
 * Biais de longueur des QCM.
 *
 * Le biais de **position** (« la bonne réponse est A une fois sur deux ») est déjà neutralisé
 * en production : `lib/qcmChoices.js` mélange les propositions par Fisher-Yates à chaque
 * présentation et n'envoie jamais la bonne lettre au client. Le biais de **longueur**, lui,
 * survit au mélange — d'où ce détecteur.
 */

/** Bonne réponse développée, distracteurs expédiés : le cas que le détecteur vise. */
const BIAISEE = {
  question_code: 'QF0001',
  reponse_correcte: 'B',
  choix_a: 'Non',
  choix_b:
    'Parce qu’une partie de l’énergie est dissipée sous forme de chaleur à chaque niveau trophique',
  choix_c: 'Oui',
  choix_d: 'Parfois',
};

/**
 * Quatre propositions de longueur comparable, et la bonne n'est pas la plus longue :
 * rien à signaler, et la stratégie « choisir la plus longue » échoue.
 */
const EQUILIBREE = {
  question_code: 'QF0002',
  reponse_correcte: 'C',
  choix_a: 'Le lombric fragmente la litière du sol',
  choix_b: 'Le lombric pollinise les fleurs du verger',
  choix_c: 'Le lombric aère le sol en creusant',
  choix_d: 'Le lombric chasse les pucerons des feuilles',
};

describe('answerLengthProfile', () => {
  test('compare la bonne réponse à la moyenne et au maximum des distracteurs', () => {
    const profile = answerLengthProfile(BIAISEE);
    assert.ok(profile);
    assert.strictEqual(profile.isLongest, true);
    assert.ok(profile.correct > profile.distractorMax);
    assert.ok(profile.ratio > LENGTH_BIAS_RATIO);
  });

  test('rend null si la bonne réponse désignée n’existe pas', () => {
    assert.strictEqual(
      answerLengthProfile({ reponse_correcte: 'E', choix_a: 'x', choix_b: 'y' }),
      null,
    );
  });

  test('rend null s’il n’y a pas au moins deux propositions', () => {
    assert.strictEqual(answerLengthProfile({ reponse_correcte: 'A', choix_a: 'Seule' }), null);
    assert.strictEqual(answerLengthProfile({}), null);
  });

  test('ignore les propositions vides', () => {
    const profile = answerLengthProfile({
      reponse_correcte: 'A',
      choix_a: 'Bonne réponse',
      choix_b: 'Non',
      choix_c: '',
      choix_d: null,
    });
    assert.strictEqual(profile.distractorMean, 3);
  });
});

describe('hasAnswerLengthBias', () => {
  test('signale une bonne réponse nettement plus longue', () => {
    assert.strictEqual(hasAnswerLengthBias(BIAISEE), true);
  });

  test('ne signale pas des propositions de longueur comparable', () => {
    assert.strictEqual(hasAnswerLengthBias(EQUILIBREE), false);
  });

  test('être la plus longue ne suffit pas sans avance nette', () => {
    // Un caractère de plus : la plus longue, mais indétectable à l’œil.
    const serree = {
      reponse_correcte: 'A',
      choix_a: 'Le sol vivant abrite des milliers',
      choix_b: 'Le sol vivant abrite des millier',
      choix_c: 'Le sol vivant abrite des millie',
      choix_d: 'Le sol vivant abrite des milli',
    };
    assert.strictEqual(answerLengthProfile(serree).isLongest, true);
    assert.strictEqual(hasAnswerLengthBias(serree), false);
  });

  test('l’écart absolu suffit même sans atteindre le ratio', () => {
    const base = 'x'.repeat(60);
    const question = {
      reponse_correcte: 'A',
      choix_a: base + 'y'.repeat(LENGTH_BIAS_GAP + 5),
      choix_b: base,
      choix_c: base,
      choix_d: base,
    };
    assert.ok(answerLengthProfile(question).ratio < LENGTH_BIAS_RATIO);
    assert.strictEqual(hasAnswerLengthBias(question), true);
  });

  test('une bonne réponse plus courte n’est jamais signalée', () => {
    assert.strictEqual(
      hasAnswerLengthBias({
        reponse_correcte: 'A',
        choix_a: 'Oui',
        choix_b: 'Une très longue explication qui ne sert que de distracteur ici',
        choix_c: 'Autre longue proposition tout aussi développée que la précédente',
      }),
      false,
    );
  });
});

describe('summarizeAnswerLengthBias', () => {
  test('mesure le taux de réussite de la stratégie « choisir la plus longue »', () => {
    const summary = summarizeAnswerLengthBias([BIAISEE, EQUILIBREE]);
    assert.strictEqual(summary.counted, 2);
    assert.strictEqual(summary.longestWins, 1);
    assert.strictEqual(summary.longestStrategyRate, 0.5);
    assert.strictEqual(summary.biased, 1);
  });

  test('un corpus vide ne divise pas par zéro', () => {
    const summary = summarizeAnswerLengthBias([]);
    assert.strictEqual(summary.counted, 0);
    assert.strictEqual(summary.longestStrategyRate, 0);
    assert.strictEqual(summary.meanCorrectLength, 0);
  });

  test('les questions inexploitables ne sont pas comptées', () => {
    const summary = summarizeAnswerLengthBias([{ reponse_correcte: 'A' }, BIAISEE]);
    assert.strictEqual(summary.counted, 1);
  });
});

describe('intégration à l’audit pédagogique', () => {
  test('le biais remonte comme anomalie de question', () => {
    const findings = detectQuestionIssues([BIAISEE]);
    assert.ok(findings.some((row) => row.kind === 'length_bias_answer' && row.code === 'QF0001'));
  });

  test('une question équilibrée ne produit pas d’anomalie de longueur', () => {
    const findings = detectQuestionIssues([EQUILIBREE]);
    assert.ok(!findings.some((row) => row.kind === 'length_bias_answer'));
  });

  test('le biais n’est pas bloquant : c’est une reprise éditoriale, pas une panne', () => {
    const result = analyzePedagoSnapshot({ quizQuestions: [BIAISEE] });
    assert.strictEqual(result.blockingCount, 0);
    assert.strictEqual(result.answerLengthBias.biased, 1);
  });

  test('le rapport chiffre la stratégie et la compare au hasard', () => {
    const report = formatAuditReport(analyzePedagoSnapshot({ quizQuestions: [BIAISEE] }));
    assert.match(report, /Biais de longueur/);
    assert.match(report, /hasard : 25 %/);
  });

  test('le rapport ne parle pas de biais quand il n’y a pas de corpus', () => {
    const report = formatAuditReport(analyzePedagoSnapshot({}));
    assert.ok(!/Biais de longueur/.test(report));
  });
});
