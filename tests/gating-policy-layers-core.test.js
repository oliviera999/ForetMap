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
  retryCooldownHours: 72,
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
    retryCooldownHours: 72,
    cooldownScope: 'question',
  });
  assert.match(text, /2 question/);
  assert.match(text, /1 erreur tolérée/);
  assert.match(text, /verrou 3 jours/);
  const hours = layers.describeEffectiveGatingPolicy({
    mode: 'any',
    gatingCount: 2,
    retryCooldownHours: 6,
    lockMode: 'strict',
  });
  assert.match(hours, /verrou 6 h/);
  assert.match(hours, /réservées à la validation/);
});

test('resolveEffectiveGatingPolicy — délai en heures, ancienne colonne en jours reprise', () => {
  const fromDays = layers.resolveEffectiveGatingPolicy({
    typePolicy: { retry_cooldown_days: 2 },
    site,
    product: 'fm',
    resourceType: 'tutorial',
  });
  assert.equal(fromDays.retryCooldownHours, 48, 'jours × 24 tant que la ligne n’est pas migrée');
  assert.equal(fromDays.retryCooldownLabel, '2 jours');
  const fromHours = layers.resolveEffectiveGatingPolicy({
    typePolicy: { retry_cooldown_days: 2, retry_cooldown_hours: 6 },
    perResource: { lock_mode: 'strict' },
    site,
    product: 'fm',
    resourceType: 'tutorial',
  });
  assert.equal(fromHours.retryCooldownHours, 6, 'la colonne en heures prime');
  assert.equal(fromHours.effectiveSources.retryCooldownHours, 'type:tutorial');
  assert.equal(fromHours.lockMode, 'strict');
  assert.equal(fromHours.effectiveSources.lockMode, 'resource');
  const siteOnly = layers.resolveEffectiveGatingPolicy({ site: {}, product: 'fm' });
  assert.equal(siteOnly.retryCooldownHours, 6, 'défaut : 6 h');
  assert.equal(siteOnly.lockMode, 'flow', 'défaut : normal');
});

test('sanitizePolicyPatch — heures, jours anciens convertis, lock_mode', () => {
  const hours = layers.sanitizePolicyPatch({ retry_cooldown_hours: 12, lock_mode: 'strict' }, {});
  assert.equal(hours.retry_cooldown_hours, 12);
  assert.equal(hours.lock_mode, 'strict');
  const days = layers.sanitizePolicyPatch({ retry_cooldown_days: 2 }, {});
  assert.equal(days.retry_cooldown_hours, 48, 'un client ancien qui envoie des jours');
  const inherit = layers.sanitizePolicyPatch(
    { lock_mode: 'inherit', retryCooldownHours: null },
    {},
  );
  assert.equal(inherit.lock_mode, null);
  assert.equal(inherit.retry_cooldown_hours, null);
  const kept = layers.sanitizePolicyPatch({}, { retry_cooldown_days: 1 });
  assert.equal(kept.retry_cooldown_hours, 24, 'ligne ancienne reprise en heures, jamais perdue');
  assert.equal(layers.sanitizePolicyPatch({ lock_mode: 'n’importe' }, {}).lock_mode, null);
});
