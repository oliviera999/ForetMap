'use strict';

/**
 * Helpers purs des listes d'ids de catégories (réglages plan) — sans BDD.
 */

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseCategoryIdsSetting,
  placeSurvivesHiddenCategories,
} = require('../lib/categoryIdsSetting');

describe('parseCategoryIdsSetting', () => {
  it('découpe sur ; , et espaces', () => {
    assert.deepEqual(parseCategoryIdsSetting('a;b, c  d'), ['a', 'b', 'c', 'd']);
  });

  it('vide / null → []', () => {
    assert.deepEqual(parseCategoryIdsSetting(''), []);
    assert.deepEqual(parseCategoryIdsSetting(null), []);
  });
});

describe('placeSurvivesHiddenCategories', () => {
  it('sans catégorie → survit', () => {
    assert.equal(placeSurvivesHiddenCategories([], new Set(['h1'])), true);
    assert.equal(placeSurvivesHiddenCategories(null, ['h1']), true);
  });

  it('uniquement catégories masquées → exclu', () => {
    assert.equal(placeSurvivesHiddenCategories(['h1'], new Set(['h1'])), false);
    assert.equal(placeSurvivesHiddenCategories(['h1', 'h2'], ['h1', 'h2']), false);
  });

  it('au moins une catégorie visible → survit', () => {
    assert.equal(placeSurvivesHiddenCategories(['h1', 'v1'], new Set(['h1'])), true);
    assert.equal(placeSurvivesHiddenCategories(['v1'], new Set(['h1'])), true);
  });
});
