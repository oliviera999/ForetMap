'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolveVisitMascotImportPublishState } = require('../lib/visitMascotPackHelpers');

describe('resolveVisitMascotImportPublishState', () => {
  it('create : publié par défaut (sans is_published explicite)', () => {
    assert.equal(resolveVisitMascotImportPublishState({ mode: 'create' }), 1);
    assert.equal(resolveVisitMascotImportPublishState({ mode: 'create', requested: undefined }), 1);
    assert.equal(resolveVisitMascotImportPublishState({ mode: 'create', requested: null }), 1);
    assert.equal(resolveVisitMascotImportPublishState({ mode: 'create', requested: '' }), 1);
  });

  it('create : override explicite en brouillon', () => {
    assert.equal(resolveVisitMascotImportPublishState({ mode: 'create', requested: 0 }), 0);
    assert.equal(resolveVisitMascotImportPublishState({ mode: 'create', requested: '0' }), 0);
    assert.equal(resolveVisitMascotImportPublishState({ mode: 'create', requested: 2 }), 0);
  });

  it('create : override explicite en publié', () => {
    assert.equal(resolveVisitMascotImportPublishState({ mode: 'create', requested: 1 }), 1);
    assert.equal(resolveVisitMascotImportPublishState({ mode: 'create', requested: '1' }), 1);
  });

  it('replace : conserve l’état du pack cible', () => {
    assert.equal(
      resolveVisitMascotImportPublishState({ mode: 'replace', existingPublished: 1 }),
      1,
    );
    assert.equal(
      resolveVisitMascotImportPublishState({ mode: 'replace', existingPublished: 0 }),
      0,
    );
  });

  it('replace : ignore is_published demandé (pas de (dé)publication par surprise)', () => {
    assert.equal(
      resolveVisitMascotImportPublishState({
        mode: 'replace',
        existingPublished: 0,
        requested: 1,
      }),
      0,
    );
    assert.equal(
      resolveVisitMascotImportPublishState({
        mode: 'replace',
        existingPublished: 1,
        requested: 0,
      }),
      1,
    );
  });

  it('replace sans pack cible connu : retombe sur publié par défaut', () => {
    // garde-fou : si existingPublished absent, on ne bloque pas l’affichage
    assert.equal(
      resolveVisitMascotImportPublishState({ mode: 'replace', existingPublished: null }),
      1,
    );
  });
});
