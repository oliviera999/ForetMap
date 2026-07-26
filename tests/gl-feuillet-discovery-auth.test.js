'use strict';

/**
 * Tests purs (sans BDD) des garde-fous découverte / progression feuillets.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  discoveryAllowedFromEvidence,
  progressAllowedFromEvidence,
} = require('../lib/glFeuilletDiscoveryAuth');

describe('discoveryAllowedFromEvidence', () => {
  it('autorise le MJ sans preuve', () => {
    assert.equal(discoveryAllowedFromEvidence({ isMj: true, feuilletCode: 'ep-I-01' }), true);
  });

  it('refuse un joueur sans zone présentée ni kingdomZoneId', () => {
    assert.equal(
      discoveryAllowedFromEvidence({
        isMj: false,
        presentedZoneCodes: new Set(),
        feuilletCode: 'ep-I-01',
      }),
      false,
    );
  });

  it('autorise après présentation de la zone carte correspondante', () => {
    assert.equal(
      discoveryAllowedFromEvidence({
        isMj: false,
        presentedZoneCodes: new Set(['ep-I-01', 'ep-I-02']),
        feuilletCode: 'ep-I-01',
      }),
      true,
    );
  });

  it('autorise via kingdomZoneId seulement si le feuillet est candidat', () => {
    assert.equal(
      discoveryAllowedFromEvidence({
        isMj: false,
        kingdomZoneId: 12,
        candidateCodes: new Set(['ep-I-03']),
        feuilletCode: 'ep-I-03',
      }),
      true,
    );
    assert.equal(
      discoveryAllowedFromEvidence({
        isMj: false,
        kingdomZoneId: 12,
        candidateCodes: new Set(['ep-I-03']),
        feuilletCode: 'ep-I-99',
      }),
      false,
    );
  });
});

describe('progressAllowedFromEvidence', () => {
  it('autorise le MJ même sans état', () => {
    assert.equal(progressAllowedFromEvidence({ isMj: true, status: null }), true);
  });

  it('refuse read/hold si le feuillet n’est pas trouvé', () => {
    assert.equal(progressAllowedFromEvidence({ isMj: false, status: null }), false);
    assert.equal(progressAllowedFromEvidence({ isMj: false, status: 'locked' }), false);
  });

  it('autorise read/hold une fois découvert', () => {
    assert.equal(progressAllowedFromEvidence({ isMj: false, status: 'discovered' }), true);
    assert.equal(progressAllowedFromEvidence({ isMj: false, status: 'read' }), true);
    assert.equal(progressAllowedFromEvidence({ isMj: false, status: 'held' }), true);
  });
});
