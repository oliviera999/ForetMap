const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMarkerEmoji } = require('../lib/markerEmoji');

describe('normalizeMarkerEmoji', () => {
  it('retourne le fallback si valeur vide et allowEmpty false', () => {
    assert.equal(normalizeMarkerEmoji(''), '🌱');
    assert.equal(normalizeMarkerEmoji('   '), '🌱');
    assert.equal(normalizeMarkerEmoji(null), '🌱');
  });

  it('accepte une chaîne vide si allowEmpty', () => {
    assert.equal(normalizeMarkerEmoji('', { allowEmpty: true, fallback: '' }), '');
    assert.equal(normalizeMarkerEmoji('  ', { allowEmpty: true, fallback: '📍' }), '');
    assert.equal(normalizeMarkerEmoji(null, { allowEmpty: true, fallback: '' }), '');
  });

  it('tronque à 16 caractères', () => {
    const long = '🌱'.repeat(20);
    assert.equal(normalizeMarkerEmoji(long).length, 16);
  });

  it('conserve un emoji valide', () => {
    assert.equal(normalizeMarkerEmoji('🍄'), '🍄');
    assert.equal(normalizeMarkerEmoji('  🦔  '), '🦔');
  });
});
