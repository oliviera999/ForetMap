'use strict';

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { visitContentRowIsPublicActive } = require('../lib/visitContentPublicActive');

describe('visitContentRowIsPublicActive', () => {
  it('exclut uniquement les désactivations explicites', () => {
    assert.equal(visitContentRowIsPublicActive({ visit_is_active: 0 }), false);
    assert.equal(visitContentRowIsPublicActive({ visit_is_active: false }), false);
    assert.equal(visitContentRowIsPublicActive({ visit_is_active: '0' }), false);
    assert.equal(visitContentRowIsPublicActive({ visit_is_active: ' 0 ' }), false);
  });

  it('accepte 1, true et chaîne "1"', () => {
    assert.equal(visitContentRowIsPublicActive({ visit_is_active: 1 }), true);
    assert.equal(visitContentRowIsPublicActive({ visit_is_active: true }), true);
    assert.equal(visitContentRowIsPublicActive({ visit_is_active: '1' }), true);
  });

  it('accepte null / undefined (défaut schéma)', () => {
    assert.equal(visitContentRowIsPublicActive({ visit_is_active: null }), true);
    assert.equal(visitContentRowIsPublicActive({ visit_is_active: undefined }), true);
    assert.equal(visitContentRowIsPublicActive({}), true);
  });
});
