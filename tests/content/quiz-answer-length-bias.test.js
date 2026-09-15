'use strict';

require('../helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const { initSchema, queryAll } = require('../../database');
const { summarizeAnswerLengthBias } = require('../../lib/pedagoContentAudit');

/**
 * Biais de longueur du corpus QCM — cliquet anti-régression.
 *
 * Le corpus n'est semé par aucune migration : il est importé par le panneau prof. Ce test
 * ne peut donc pas exiger un corpus donné, et se tait quand la table est vide (base de CI
 * fraîche). Sur une base réellement peuplée, il vérifie que la situation ne s'aggrave pas.
 *
 * Deux mesures de référence, parce que les deux corpus diffèrent :
 *
 *   - export de production du 15/09/2026 : 513 questions, « choisir la proposition la plus
 *     longue » réussit **65,7 %** des questions, rapport de longueur 1,71 ;
 *   - corpus semé par `sql/schema_foretmap.sql`, celui que la CI exécute : 203 questions,
 *     **78,8 %**, rapport 1,92. Le corpus de référence versionné est donc *plus* biaisé que
 *     la production — c'est lui qu'il faut reprendre en premier, puisque c'est lui qui part
 *     sur toute nouvelle installation.
 *
 * Pour 25 % au hasard sur quatre propositions, dans les deux cas.
 *
 * Le plafond est calé sur le corpus le plus défavorable des deux, juste au-dessus : il
 * interdit l'aggravation sans bloquer aujourd'hui. **Il a vocation à être abaissé** au fur
 * et à mesure des reprises éditoriales — c'est le seul intérêt d'un cliquet.
 */

const PLAFOND_STRATEGIE_PLUS_LONGUE = 0.8;
const PLAFOND_RAPPORT_LONGUEUR = 1.95;
const CORPUS_MINIMUM = 50;

let questions = [];

before(async () => {
  await initSchema();
  questions = await queryAll(
    `SELECT question_code, reponse_correcte, choix_a, choix_b, choix_c, choix_d, choix_e
       FROM quiz_questions`,
  );
});

test('la stratégie « choisir la plus longue » ne devient pas plus payante', (t) => {
  if (questions.length < CORPUS_MINIMUM) {
    t.skip(`corpus absent ou trop petit (${questions.length} questions)`);
    return;
  }
  const summary = summarizeAnswerLengthBias(questions);
  assert.ok(
    summary.longestStrategyRate <= PLAFOND_STRATEGIE_PLUS_LONGUE,
    `un élève réussirait ${(summary.longestStrategyRate * 100).toFixed(1)} % des questions en ` +
      'choisissant toujours la proposition la plus longue, sans rien connaître ' +
      `(plafond ${(PLAFOND_STRATEGIE_PLUS_LONGUE * 100).toFixed(0)} %, hasard 25 %). ` +
      `${summary.biased} questions ont une bonne réponse nettement plus longue que ses ` +
      'distracteurs : ce sont elles qu’il faut rééquilibrer.',
  );
});

test('l’écart moyen de longueur reste borné', (t) => {
  if (questions.length < CORPUS_MINIMUM) {
    t.skip('corpus absent ou trop petit');
    return;
  }
  const summary = summarizeAnswerLengthBias(questions);
  // Références : production 1,71 (49,0 car. contre 28,6) ; corpus semé 1,92.
  const ratio = summary.meanCorrectLength / summary.meanDistractorLength;
  assert.ok(
    ratio <= PLAFOND_RAPPORT_LONGUEUR,
    `la bonne réponse fait en moyenne ${summary.meanCorrectLength.toFixed(1)} caractères contre ` +
      `${summary.meanDistractorLength.toFixed(1)} pour les distracteurs (rapport ${ratio.toFixed(2)})`,
  );
});
