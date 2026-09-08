'use strict';

// B6 (docs/AUDIT_VALIDATION_QUIZ_2026-09.md) : les listes de types de ressources et de
// granularités existent en plusieurs exemplaires (cœur partagé, runtime, registre G&L). Ce test
// croisé échoue dès qu'un exemplaire diverge — plutôt qu'un type accepté à la création mais
// jamais validable, ou une granularité refusée d'un côté et acceptée de l'autre.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../lib/shared/resourceQuestionGatingCore');
const settingsCore = require('../lib/shared/gatingSettingsCore');
const runtime = require('../lib/learningGatingRuntime');
const glLearnable = require('../lib/glLearnableResources');

test('les types validables sont un sous-ensemble des types acceptés, dans chaque produit', () => {
  for (const type of runtime.FM_MARKABLE) {
    assert.ok(core.FORETMAP_RESOURCE_TYPES.includes(type), `FM : ${type} validable mais inconnu`);
  }
  for (const type of runtime.GL_MARKABLE) {
    assert.ok(core.GL_RESOURCE_TYPES.includes(type), `GL : ${type} validable mais inconnu`);
  }
});

test('le registre G&L des ressources apprenables et la liste des types validables coïncident', () => {
  const registry = [...glLearnable.LEARNABLE_RESOURCE_TYPES].sort();
  const markable = [...runtime.GL_MARKABLE].sort();
  assert.deepEqual(registry, markable);
});

test('les granularités du catalogue de réglages et du cœur ressource ↔ question sont identiques', () => {
  assert.deepEqual([...settingsCore.GATING_GRANULARITY_VALUES], [...core.GATING_GRANULARITIES]);
  for (const g of settingsCore.GATING_GRANULARITY_VALUES) {
    assert.equal(core.normalizeGranularity(g), g);
  }
});

test('les modes et sévérités du catalogue sont ceux que la cascade de politiques comprend', () => {
  const layers = require('../lib/shared/gatingPolicyLayersCore');
  for (const mode of settingsCore.GATING_MODE_VALUES) {
    assert.ok(core.normalizeMode(mode), `mode ${mode} inconnu du cœur`);
  }
  for (const lockMode of settingsCore.LOCK_MODE_VALUES) {
    assert.equal(layers.normalizeLockMode(lockMode), lockMode);
  }
});
