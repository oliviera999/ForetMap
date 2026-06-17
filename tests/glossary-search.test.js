'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { glossaryTermMatchesQuery, variantLabels } = require('../lib/glossarySearch');

test('variantLabels — tokenise variantes', () => {
  const labels = variantLabels('Photosynthèse', 'photo-synthèse; lumière verte');
  assert.ok(labels.includes('Photosynthèse'));
  assert.ok(labels.includes('photo-synthèse'));
  assert.ok(labels.includes('lumière verte'));
});

test('glossaryTermMatchesQuery — variante sans accent', () => {
  const term = { terme: 'Photosynthèse', variantes: 'photo-synthèse' };
  assert.ok(glossaryTermMatchesQuery(term, 'photosynthese'));
  assert.ok(glossaryTermMatchesQuery(term, 'photo synth'));
});
