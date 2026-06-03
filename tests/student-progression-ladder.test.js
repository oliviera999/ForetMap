'use strict';

require('./helpers/setup');
const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');

let sortProgressionSteps;
let resolveTaskTierSlug;
let findProgressionStep;
let getNextProgressionStep;
let getProgressionStepIndex;
let computeProgressPercent;

const LADDER = [
  { roleSlug: 'eleve_novice', min: 0, displayOrder: 50, label: 'novice' },
  { roleSlug: 'eleve_chevronne', min: 10, displayOrder: 30, label: 'chevronné' },
  { roleSlug: 'n3beur_expert', min: 40, displayOrder: 35, label: 'expert' },
  { roleSlug: 'n3beur_ultime', min: 100, displayOrder: 25, label: 'ultime' },
];

describe('studentProgressionLadder', () => {
  before(async () => {
    const mod = await import(pathToFileURL(join(__dirname, '../src/utils/studentProgressionLadder.js')).href);
    sortProgressionSteps = mod.sortProgressionSteps;
    resolveTaskTierSlug = mod.resolveTaskTierSlug;
    findProgressionStep = mod.findProgressionStep;
    getNextProgressionStep = mod.getNextProgressionStep;
    getProgressionStepIndex = mod.getProgressionStepIndex;
    computeProgressPercent = mod.computeProgressPercent;
  });

  it('sortProgressionSteps trie par min puis displayOrder', () => {
    const shuffled = [LADDER[3], LADDER[1], LADDER[2], LADDER[0]];
    const sorted = sortProgressionSteps(shuffled);
    assert.deepStrictEqual(
      sorted.map((s) => s.roleSlug),
      ['eleve_novice', 'eleve_chevronne', 'n3beur_expert', 'n3beur_ultime']
    );
  });

  it('resolveTaskTierSlug choisit expert à 48 tâches (pas chevronné)', () => {
    assert.strictEqual(resolveTaskTierSlug(48, LADDER), 'n3beur_expert');
  });

  it('resolveTaskTierSlug respecte displayOrder en cas de seuils égaux', () => {
    const tied = [
      { roleSlug: 'palier_a', min: 40, displayOrder: 10, label: 'A' },
      { roleSlug: 'palier_b', min: 40, displayOrder: 20, label: 'B' },
    ];
    assert.strictEqual(resolveTaskTierSlug(40, tied), 'palier_b');
  });

  it('getNextProgressionStep renvoie ultime après expert', () => {
    assert.strictEqual(getNextProgressionStep(LADDER, 'n3beur_expert')?.roleSlug, 'n3beur_ultime');
    assert.strictEqual(getNextProgressionStep(LADDER, 'eleve_chevronne')?.roleSlug, 'n3beur_expert');
  });

  it('computeProgressPercent calcule la jauge expert → ultime', () => {
    const expert = findProgressionStep(LADDER, 'n3beur_expert');
    const ultime = findProgressionStep(LADDER, 'n3beur_ultime');
    const pct = computeProgressPercent(48, expert, ultime);
    assert.strictEqual(pct, ((48 - 40) / (100 - 40)) * 100);
  });

  it('getProgressionStepIndex permet de comparer profil vs objectif tâches', () => {
    assert.ok(getProgressionStepIndex(LADDER, 'eleve_chevronne') < getProgressionStepIndex(LADDER, 'n3beur_expert'));
  });
});
