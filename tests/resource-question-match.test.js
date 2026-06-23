'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const m = require('../lib/shared/resourceQuestionMatch');

test('normalizeText / tokenize — accents et ponctuation', () => {
  assert.equal(
    m.normalizeText('Écosystème — Nitrification (réseau)'),
    'ecosysteme nitrification reseau',
  );
  assert.deepEqual(m.tokenize('La pollinisation, des fleurs !'), [
    'la',
    'pollinisation',
    'des',
    'fleurs',
  ]);
  assert.deepEqual(m.tokenize(''), []);
});

test('splitLabelVariants — separateurs multiples', () => {
  assert.deepEqual(m.splitLabelVariants('ortie, grande ortie / urtica'), [
    'ortie',
    'grande ortie',
    'urtica',
  ]);
});

test('buildResourceEntries — stopwords, longueur min, dedup, variantes', () => {
  const entries = m.buildResourceEntries([
    { type: 'glossary', ref: 'GL01', labels: ['Nitrification', 'nitrifiantes'] },
    { type: 'glossary', ref: 'GL02', labels: ['Le', 'de'] }, // que des stopwords -> ignore
    { type: 'plant', ref: '42', labels: ['Ortie', 'Ortie'] }, // dedup
    { type: 'glossary', ref: 'GL03', labels: ['azo'] }, // < 4 caracteres -> ignore
  ]);
  const labels = entries.map((e) => `${e.type}:${e.ref}:${e.label}`).sort();
  assert.deepEqual(labels, [
    'glossary:GL01:nitrifiantes',
    'glossary:GL01:nitrification',
    'plant:42:ortie',
  ]);
});

test('suggestLinks — match glossaire + nom scientifique, pas de faux positif', () => {
  const resources = [
    { type: 'glossary', ref: 'GL01', labels: ['Nitrification'] },
    { type: 'plant', ref: '42', labels: ['Ortie', 'Urtica dioica'] },
  ];
  const questions = [
    { code: 'QF1', text: 'Quelle bacterie realise la nitrification ?', tags: 'azote' },
    { code: 'QF2', text: "Reconnais-tu l'ortie (Urtica dioica) ?" },
    { code: 'QF3', text: 'Question totalement hors sujet' },
  ];
  const out = m.suggestLinks({ questions, resources, minConfidence: 0.4 });
  const byQ = Object.fromEntries(out.map((l) => [l.question_code, l]));
  assert.equal(byQ.QF1.resource_ref, 'GL01');
  assert.equal(byQ.QF1.origin, 'auto');
  assert.equal(byQ.QF1.status, 'suggested');
  assert.equal(byQ.QF2.resource_ref, '42');
  // Le nom scientifique (multi-mots) est plus specifique que le terme simple.
  assert.ok(byQ.QF2.confidence > byQ.QF1.confidence);
  assert.equal(byQ.QF3, undefined);
  assert.ok(byQ.QF1.reason.startsWith('text_match:'));
});

test('suggestLinks — exclusion des liens existants + dataset GL', () => {
  const resources = [{ type: 'glossary', ref: 'L1', labels: ['symbiose'] }];
  const questions = [{ code: 'LQCM1', text: 'Explique la symbiose racinaire' }];
  const existing = new Set([m.existKeyFor('qcm_lore', 'glossary', 'L1', 'LQCM1')]);
  const blocked = m.suggestLinks({
    questions,
    resources,
    dataset: 'qcm_lore',
    existing,
    minConfidence: 0.4,
  });
  assert.equal(blocked.length, 0);

  const open = m.suggestLinks({ questions, resources, dataset: 'qcm_lore', minConfidence: 0.4 });
  assert.equal(open.length, 1);
  assert.equal(open[0].question_dataset, 'qcm_lore');
});

test('suggestLinks — seuil de confiance et plafond par question', () => {
  const resources = [
    { type: 'glossary', ref: 'A', labels: ['photosynthese chlorophyllienne'] }, // multi-mots, haute conf
    { type: 'glossary', ref: 'B', labels: ['flux'] }, // court, conf basse
  ];
  const questions = [{ code: 'Q', text: 'La photosynthese chlorophyllienne et le flux d energie' }];

  const high = m.suggestLinks({ questions, resources, minConfidence: 0.7 });
  assert.deepEqual(
    high.map((l) => l.resource_ref),
    ['A'],
  ); // 'flux' sous le seuil

  const capped = m.suggestLinks({ questions, resources, minConfidence: 0.1, maxPerQuestion: 1 });
  assert.equal(capped.length, 1);
  assert.equal(capped[0].resource_ref, 'A'); // la plus confiante d'abord
});
