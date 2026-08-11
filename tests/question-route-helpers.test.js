'use strict';

// `lib/shared/questionRouteHelpers.normalizeQuestionCode` — duplicata exact
// mutualisé entre `routes/quiz.js` et `routes/gl/qcm.js`. Fonction pure :
// aucune base de données requise.

const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeQuestionCode } = require('../lib/shared/questionRouteHelpers');

test('normalizeQuestionCode — met en majuscules et retire les espaces de bord', () => {
  assert.equal(normalizeQuestionCode('qf001'), 'QF001');
  assert.equal(normalizeQuestionCode('  ql-42  '), 'QL-42');
  assert.equal(normalizeQuestionCode('DéJà'), 'DÉJÀ');
});

test('normalizeQuestionCode — renvoie null pour une valeur vide ou absente', () => {
  for (const empty of [null, undefined, '', '   ', false, 0, NaN]) {
    assert.equal(normalizeQuestionCode(empty), null, `devrait être null : ${String(empty)}`);
  }
});

test('normalizeQuestionCode — accepte les valeurs non chaîne sans jeter', () => {
  assert.equal(normalizeQuestionCode(123), '123');
  assert.equal(normalizeQuestionCode(['qf1']), 'QF1');
  assert.equal(normalizeQuestionCode({}), '[OBJECT OBJECT]');
});

test('normalizeQuestionCode — ne conserve pas les espaces internes en séparateur', () => {
  // Comportement historique préservé : seuls les bords sont rognés.
  assert.equal(normalizeQuestionCode(' qf 001 '), 'QF 001');
});
