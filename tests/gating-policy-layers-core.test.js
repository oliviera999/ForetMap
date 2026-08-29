'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const layers = require('../lib/shared/gatingPolicyLayersCore');

const site = {
  enabled: true,
  defaultMode: 'any',
  defaultRequiredCorrect: 1,
  allowedWrongAttempts: 0,
  maxQuestionsPerSession: 3,
  retryCooldownDays: 3,
  cooldownScope: 'resource',
  granularity: 'player',
};

test('resolveEffectiveGatingPolicy — héritage session site → type → ressource', () => {
  const base = layers.resolveEffectiveGatingPolicy({
    site,
    product: 'fm',
    resourceType: 'tutorial',
  });
  assert.equal(base.allowedWrongAttempts, 0);
  assert.equal(base.effectiveSources.allowedWrongAttempts, 'site');

  const byType = layers.resolveEffectiveGatingPolicy({
    typePolicy: { allowed_wrong_attempts: 2 },
    site,
    product: 'fm',
    resourceType: 'tutorial',
  });
  assert.equal(byType.allowedWrongAttempts, 2);
  assert.equal(byType.effectiveSources.allowedWrongAttempts, 'type:tutorial');

  const byResource = layers.resolveEffectiveGatingPolicy({
    typePolicy: { allowed_wrong_attempts: 2, max_questions_per_session: 5 },
    perResource: { allowed_wrong_attempts: 0 },
    site,
    product: 'fm',
    resourceType: 'glossary',
  });
  assert.equal(byResource.allowedWrongAttempts, 0);
  assert.equal(byResource.maxQuestionsPerSession, 5);
  assert.equal(byResource.effectiveSources.allowedWrongAttempts, 'resource');
  assert.equal(byResource.effectiveSources.maxQuestionsPerSession, 'type:glossary');
});

test('resolveEffectiveGatingPolicy — GL granularité chapitre', () => {
  const gl = layers.resolveEffectiveGatingPolicy({
    typePolicy: { granularity: 'team' },
    chapterGranularity: 'player',
    site: { ...site, granularity: 'team' },
    product: 'gl',
    resourceType: 'feuillet',
  });
  assert.equal(gl.granularity, 'player');
  assert.equal(gl.effectiveSources.granularity, 'chapter');
});

test('sanitizePolicyPatch — null hérite', () => {
  const merged = layers.sanitizePolicyPatch(
    { allowed_wrong_attempts: null, mode: 'inherit' },
    { allowed_wrong_attempts: 1, mode: 'threshold', required_correct: 2, enabled: 1 },
  );
  assert.equal(merged.allowed_wrong_attempts, null);
  assert.equal(merged.mode, 'inherit');
});

test('describeEffectiveGatingPolicy — phrase session', () => {
  const text = layers.describeEffectiveGatingPolicy({
    mode: 'threshold',
    requiredCorrect: 2,
    gatingCount: 5,
    allowedWrongAttempts: 1,
    maxQuestionsPerSession: 2,
    retryCooldownDays: 3,
    cooldownScope: 'question',
  });
  assert.match(text, /2 question/);
  assert.match(text, /1 erreur tolérée/);
  assert.match(text, /verrou 3 jours/);
});
