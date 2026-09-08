'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  isProbableGenusName,
  hasDuplicateChoices,
  missingCorrectAnswer,
  isEchoFeedback,
  detectOrphanLinks,
  buildPedagoMatrix,
  isolatedMatrixNotions,
  analyzePedagoSnapshot,
} = require('../lib/pedagoContentAudit');

test('isProbableGenusName — un mot capitalisé sans sp.', () => {
  assert.strictEqual(isProbableGenusName('Tamarix'), true);
  assert.strictEqual(isProbableGenusName('Tamarix sp.'), false);
  assert.strictEqual(isProbableGenusName('Lepus arcticus'), false);
  assert.strictEqual(isProbableGenusName(''), false);
});

test('hasDuplicateChoices et missingCorrectAnswer', () => {
  assert.strictEqual(hasDuplicateChoices({ choix_a: 'Oui', choix_b: 'Non', choix_c: 'oui' }), true);
  assert.strictEqual(
    hasDuplicateChoices({ choix_a: 'Oui', choix_b: 'Non', choix_c: 'Parfois' }),
    false,
  );
  assert.strictEqual(missingCorrectAnswer({ reponse_correcte: 'A', choix_a: 'x' }), false);
  assert.strictEqual(missingCorrectAnswer({ reponse_correcte: 'D', choix_a: 'x' }), true);
});

test('isEchoFeedback détecte un feedback qui recopie la question', () => {
  const question = 'Pourquoi l’énergie diminue-t-elle ?';
  assert.strictEqual(isEchoFeedback({ question, feedback_correct: `Exact. ${question}` }), true);
  assert.strictEqual(
    isEchoFeedback({ question, feedback_correct: 'Parce qu’une part est dissipée en chaleur.' }),
    false,
  );
});

test('detectOrphanLinks', () => {
  const orphans = detectOrphanLinks(
    [{ question_code: 'QF1', glossary_code: 'FM9999' }],
    ['FM0001'],
    { linkKey: 'question_code', targetKey: 'glossary_code' },
  );
  assert.strictEqual(orphans.length, 1);
  assert.strictEqual(orphans[0].missing, 'FM9999');
});

test('buildPedagoMatrix et notions isolées', () => {
  const matrix = buildPedagoMatrix({
    glossaryTerms: [{ glossary_code: 'FM0010', terme: 'chaîne alimentaire' }],
    quizGlossary: [{ question_code: 'QF0010', glossary_code: 'FM0010' }],
    glossarySpecies: [{ glossary_code: 'FM0010', plant_id: 1 }],
    glossaryInteractions: [{ glossary_code: 'FM0010', interaction_id: 9 }],
    plants: [{ id: 1, name: 'Laitue' }],
    interactions: [{ id: 9, from_id: 1, interaction_type: 'herbivorie' }],
  });
  assert.ok(matrix.some((row) => row.question_code === 'QF0010'));
  assert.ok(matrix.some((row) => row.interaction_type === 'herbivorie'));
  const isolated = isolatedMatrixNotions([
    { notion: 'seul', glossary_code: 'X', question_code: 'Q1' },
  ]);
  assert.strictEqual(isolated[0].notion, 'seul');
  assert.strictEqual(isolatedMatrixNotions(matrix).length, 0);
});

test('analyzePedagoSnapshot agrège les findings', () => {
  const result = analyzePedagoSnapshot({
    glSpecies: [{ species_code: 'SP0015', nom_commun: 'Tamaris', nom_scientifique: 'Tamarix' }],
    quizQuestions: [
      {
        question_code: 'QF1',
        categorie_slug: 'ecologie_reseaux',
        question: 'Q ?',
        choix_a: 'A',
        choix_b: 'B',
        reponse_correcte: 'A',
        feedback_correct: 'Q ?',
      },
    ],
    glossaryCodes: ['FM0001'],
    quizGlossaryLinks: [{ question_code: 'QF1', glossary_code: 'FM9999' }],
  });
  assert.ok(result.findings.some((row) => row.kind === 'genus_as_species'));
  assert.ok(result.findings.some((row) => row.kind === 'echo_feedback'));
  assert.ok(result.findings.some((row) => row.kind === 'orphan_link'));
  assert.ok(result.blockingCount >= 1);
});
