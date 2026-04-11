'use strict';

require('./helpers/setup');
const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');

let shouldShowVisitMapMascot;
let getVisitMascotVisibilityReason;

before(async () => {
  const mod = await import(pathToFileURL(join(__dirname, '../src/utils/visitMascotVisibility.js')).href);
  shouldShowVisitMapMascot = mod.shouldShowVisitMapMascot;
  getVisitMascotVisibilityReason = mod.getVisitMascotVisibilityReason;
});

describe('visitMascotVisibility', () => {
  it('masquée hors mode view', () => {
    assert.equal(shouldShowVisitMapMascot('draw-zone', 5, [], [{ id: 1 }]), false);
    assert.equal(shouldShowVisitMapMascot('add-marker', 1, [], []), false);
  });

  it('visible en view si au moins un repère', () => {
    assert.equal(shouldShowVisitMapMascot('view', 0, [], [{ id: 1 }]), true);
  });

  it('visible en view si au moins une zone (même si polygone non parcourable)', () => {
    assert.equal(shouldShowVisitMapMascot('view', 0, [{ id: 'z', points: '[]' }], []), true);
  });

  it('visible en view si total parcourable > 0', () => {
    assert.equal(shouldShowVisitMapMascot('view', 3, [], []), true);
  });

  it('masquée en view si carte vide sans tutoriel', () => {
    assert.equal(shouldShowVisitMapMascot('view', 0, [], [], 0), false);
  });

  it('visible en view si au moins un tutoriel (plan sans zone/repère)', () => {
    assert.equal(shouldShowVisitMapMascot('view', 0, [], [], 1), true);
  });

  it('tolère zones / markers non-tableau', () => {
    assert.equal(shouldShowVisitMapMascot('view', 0, null, undefined, 0), false);
  });

  it('raison explicite: contenu vide (pas un bug visuel)', () => {
    assert.equal(getVisitMascotVisibilityReason('view', 0, [], [], 0), 'no-public-content');
  });

  it('raison explicite: mode édition', () => {
    assert.equal(getVisitMascotVisibilityReason('draw-zone', 5, [{ id: 1 }], [{ id: 1 }], 1), 'mode-not-view');
  });
});
