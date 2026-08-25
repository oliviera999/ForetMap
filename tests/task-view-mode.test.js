'use strict';

require('./helpers/setup');
const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');

let normalizeTaskViewMode;
let defaultTaskViewMode;
let resolveInitialTaskViewMode;

const compactMatcher = () => ({ matches: true });
const wideMatcher = () => ({ matches: false });

describe('taskViewMode', () => {
  before(async () => {
    const mod = await import(pathToFileURL(join(__dirname, '../src/utils/taskViewMode.js')).href);
    normalizeTaskViewMode = mod.normalizeTaskViewMode;
    defaultTaskViewMode = mod.defaultTaskViewMode;
    resolveInitialTaskViewMode = mod.resolveInitialTaskViewMode;
  });

  it('normalise les modes connus et rejette le reste', () => {
    assert.strictEqual(normalizeTaskViewMode('tiles'), 'tiles');
    assert.strictEqual(normalizeTaskViewMode('condensed'), 'condensed');
    assert.strictEqual(normalizeTaskViewMode('list'), 'list');
    assert.strictEqual(normalizeTaskViewMode('grille'), null);
    assert.strictEqual(normalizeTaskViewMode(''), null);
    assert.strictEqual(normalizeTaskViewMode(null), null);
  });

  it('sans préférence : condensé sur écran compact, tuiles sinon', () => {
    assert.strictEqual(defaultTaskViewMode(compactMatcher), 'condensed');
    assert.strictEqual(defaultTaskViewMode(wideMatcher), 'tiles');
  });

  it('sans matchMedia disponible : tuiles (comportement historique)', () => {
    assert.strictEqual(defaultTaskViewMode(null), 'tiles');
    assert.strictEqual(
      defaultTaskViewMode(() => {
        throw new Error('matchMedia indisponible');
      }),
      'tiles',
    );
  });

  it('la préférence mémorisée gagne toujours sur le défaut lié à l’écran', () => {
    assert.strictEqual(resolveInitialTaskViewMode('tiles', compactMatcher), 'tiles');
    assert.strictEqual(resolveInitialTaskViewMode('list', compactMatcher), 'list');
    assert.strictEqual(resolveInitialTaskViewMode('condensed', wideMatcher), 'condensed');
  });

  it('préférence absente ou corrompue : on retombe sur le défaut de l’écran', () => {
    assert.strictEqual(resolveInitialTaskViewMode('', compactMatcher), 'condensed');
    assert.strictEqual(resolveInitialTaskViewMode('n-importe-quoi', wideMatcher), 'tiles');
  });
});
