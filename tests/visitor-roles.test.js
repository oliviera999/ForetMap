'use strict';

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  VISITOR_LIKE_ROLE_SLUGS,
  PARTICIPATION_EXCLUDED_ROLE_SLUGS,
  isVisitorLikeSlug,
  isVisitorRole,
  isParticipationExcludedSlug,
  isParticipationExcludedRole,
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

/**
 * Parcours et parole sont deux questions distinctes. Les confondre — c'était le cas avant le
 * réalignement du 22/09/2026 — fermait le forum et les commentaires à tout le personnel du
 * lycée, au motif qu'il n'a ni carte de travail ni tâches.
 */
describe('visitorRoles — exclusion de participation', () => {
  it('PARTICIPATION_EXCLUDED_ROLE_SLUGS : visiteur seul', () => {
    assert.deepEqual([...PARTICIPATION_EXCLUDED_ROLE_SLUGS], ['visiteur']);
  });

  it('personnel suit le parcours visiteur mais garde la parole', () => {
    assert.equal(isVisitorLikeSlug('personnel'), true);
    assert.equal(isParticipationExcludedSlug('personnel'), false);
    assert.equal(isParticipationExcludedRole({ roleSlug: 'Personnel' }), false);
  });

  it('visiteur est exclu des deux', () => {
    assert.equal(isVisitorLikeSlug('visiteur'), true);
    assert.equal(isParticipationExcludedSlug(' VISITEUR '), true);
    assert.equal(isParticipationExcludedRole({ roleSlug: 'visiteur' }), true);
  });

  it('un profil inconnu ou absent n’est jamais exclu', () => {
    assert.equal(isParticipationExcludedSlug('eleve_novice'), false);
    assert.equal(isParticipationExcludedSlug(''), false);
    assert.equal(isParticipationExcludedRole(null), false);
  });
});
