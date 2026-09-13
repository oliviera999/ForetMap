'use strict';

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  VISITOR_LIKE_ROLE_SLUGS,
  isVisitorLikeSlug,
  isVisitorRole,
} = require('../lib/shared/visitorRoles');

describe('visitorRoles — profils lecture seule', () => {
  it('VISITOR_LIKE_ROLE_SLUGS : visiteur et personnel', () => {
    assert.deepEqual([...VISITOR_LIKE_ROLE_SLUGS].sort(), ['personnel', 'visiteur']);
  });

  it('isVisitorLikeSlug : casse et espaces ignorés', () => {
    assert.equal(isVisitorLikeSlug('visiteur'), true);
    assert.equal(isVisitorLikeSlug(' Personnel '), true);
    assert.equal(isVisitorLikeSlug('eleve_novice'), false);
    assert.equal(isVisitorLikeSlug(''), false);
    assert.equal(isVisitorLikeSlug(null), false);
  });

  it('isVisitorRole : lit roleSlug de l’auth', () => {
    assert.equal(isVisitorRole({ roleSlug: 'personnel' }), true);
    assert.equal(isVisitorRole({ roleSlug: 'Visiteur' }), true);
    assert.equal(isVisitorRole({ roleSlug: 'prof' }), false);
    assert.equal(isVisitorRole(null), false);
  });
});
