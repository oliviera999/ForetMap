'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  PSEUDO_RE,
  PSEUDO_MAX_LEN,
  isValidPseudo,
  sanitizePseudoBase,
} = require('../lib/shared/pseudo');

describe('lib/shared/pseudo', () => {
  it('accepte points, tirets, underscores, plus et accents', () => {
    assert.ok(isValidPseudo('jean.dupont'));
    assert.ok(isValidPseudo('j.d-2_x'));
    assert.ok(isValidPseudo('élève+n3'));
    assert.ok(PSEUDO_RE.test('Aurore.Dupont'));
  });

  it('refuse espaces, @, trop court / trop long', () => {
    assert.ok(!isValidPseudo('ab'));
    assert.ok(!isValidPseudo('avec espace'));
    assert.ok(!isValidPseudo('user@domaine'));
    assert.ok(!isValidPseudo('a'.repeat(PSEUDO_MAX_LEN + 1)));
    assert.ok(isValidPseudo('a'.repeat(PSEUDO_MAX_LEN)));
  });

  it('sanitizePseudoBase conserve le point Moodle (prenom.nom)', () => {
    assert.equal(sanitizePseudoBase('Jean.Dupont'), 'Jean.Dupont');
    assert.equal(sanitizePseudoBase('  prenom.nom_2  '), 'prenom.nom_2');
    assert.equal(sanitizePseudoBase('a b@c!'), 'abc');
    assert.equal(sanitizePseudoBase('x'.repeat(80), 10).length, 10);
  });
});
