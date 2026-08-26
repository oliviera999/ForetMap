'use strict';

// Catalogue commun des réglages de conditionnement (lib pure, sans BDD).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../lib/shared/gatingSettingsCore');

test('les deux produits partagent le même catalogue', () => {
  const fm = core.gatingKeysFor('fm');
  const gl = core.gatingKeysFor('gl');
  // GL a la granularité en plus : ForetMap n'a pas d'équipes.
  assert.equal(gl.length, fm.length + 1);
  assert.ok(gl.includes('gating.granularity'));
  assert.ok(!fm.includes('learning.gating.granularity'));
  // Toutes les clés ForetMap sont préfixées, toutes les clés GL le sont aussi.
  for (const key of fm) assert.match(key, /^learning\.gating\./);
  for (const key of gl) assert.match(key, /^gating\./);
});

test('les réglages nés dans un produit existent désormais dans les deux', () => {
  // C'est la divergence que ce cœur corrige : tolérance et plafond n'existaient
  // que côté ForetMap, la granularité que côté GL.
  for (const name of ['allowedWrongAttempts', 'maxQuestionsPerSession', 'announceOnButton']) {
    assert.ok(core.GATING_SETTING_DEFS[name].fmKey, `${name} manque côté ForetMap`);
    assert.ok(core.GATING_SETTING_DEFS[name].glKey, `${name} manque côté GL`);
  }
});

test('auto_mark_on_correct a bien disparu du catalogue', () => {
  const all = [...core.gatingKeysFor('fm'), ...core.gatingKeysFor('gl')];
  assert.ok(!all.some((k) => k.includes('auto_mark')));
  assert.equal(core.GATING_SETTING_DEFS.autoMarkOnCorrect, undefined);
});

test('gatingNameForKey retrouve le nom logique dans les deux sens', () => {
  assert.equal(
    core.gatingNameForKey('fm', 'learning.gating.retry_cooldown_days'),
    'retryCooldownDays',
  );
  assert.equal(core.gatingNameForKey('gl', 'gating.retry_cooldown_days'), 'retryCooldownDays');
  assert.equal(core.gatingNameForKey('fm', 'gating.granularity'), null);
  assert.equal(core.gatingNameForKey('fm', 'inconnu'), null);
});

test('normalisation — bornage numérique', () => {
  assert.equal(core.normalizeGatingSetting('allowedWrongAttempts', 99), 10);
  assert.equal(core.normalizeGatingSetting('allowedWrongAttempts', -4), 0);
  assert.equal(core.normalizeGatingSetting('retryCooldownDays', 1000), 365);
  assert.equal(core.normalizeGatingSetting('maxQuestionsPerSession', 0), 1);
  assert.equal(core.normalizeGatingSetting('defaultRequiredCorrect', 2.9), 2);
});

test('normalisation — enum inconnu retombe sur le défaut', () => {
  assert.equal(core.normalizeGatingSetting('cooldownScope', 'question'), 'question');
  assert.equal(core.normalizeGatingSetting('cooldownScope', 'n’importe quoi'), 'resource');
  assert.equal(core.normalizeGatingSetting('defaultMode', 'ALL'), 'all');
  // 'inherit' n'est pas un mode de SITE : il ne se surcharge qu'au niveau ressource.
  assert.equal(core.normalizeGatingSetting('defaultMode', 'inherit'), 'any');
});

test('normalisation — booléens tolérants aux formes stockées', () => {
  for (const truthy of [true, 'true', 1, '1']) {
    assert.equal(core.normalizeGatingSetting('announceOnButton', truthy), true);
  }
  for (const falsy of [false, 'false', 0, '0']) {
    assert.equal(core.normalizeGatingSetting('announceOnButton', falsy), false);
  }
  // Valeur inexploitable → défaut, jamais d'exception : un réglage illisible ne
  // doit pas casser une lecture d'élève.
  assert.equal(core.normalizeGatingSetting('announceOnButton', 'peut-être'), true);
  assert.equal(core.normalizeGatingSetting('enabled', 'peut-être'), false);
});

test('buildGatingSettings — défauts complets et omission du hors-produit', () => {
  const fm = core.buildGatingSettings({}, 'fm');
  assert.equal(fm.enabled, false);
  assert.equal(fm.retryCooldownDays, 3);
  assert.equal(fm.granularity, undefined, 'la granularité n’a pas de sens côté ForetMap');

  const gl = core.buildGatingSettings({}, 'gl');
  assert.equal(gl.granularity, 'player');
});

test('buildGatingSettings — les valeurs brutes sont normalisées au passage', () => {
  const s = core.buildGatingSettings(
    { enabled: '1', allowedWrongAttempts: '42', defaultMode: 'THRESHOLD' },
    'fm',
  );
  assert.equal(s.enabled, true);
  assert.equal(s.allowedWrongAttempts, 10);
  assert.equal(s.defaultMode, 'threshold');
});

test('validateGatingSetting — refuse hors bornes plutôt que de borner en silence', () => {
  // À l'écriture, mieux vaut un refus explicite : borner silencieusement ferait
  // croire au professeur que sa valeur a été prise en compte.
  assert.equal(core.validateGatingSetting('allowedWrongAttempts', 3).value, 3);
  assert.equal(core.validateGatingSetting('allowedWrongAttempts', 99).ok, false);
  assert.equal(core.validateGatingSetting('allowedWrongAttempts', 'abc').ok, false);
  assert.equal(core.validateGatingSetting('cooldownScope', 'question').value, 'question');
  assert.equal(core.validateGatingSetting('cooldownScope', 'autre').ok, false);
  assert.equal(core.validateGatingSetting('enabled', 'true').value, true);
  assert.equal(core.validateGatingSetting('enabled', 'bof').ok, false);
  assert.equal(core.validateGatingSetting('inconnu', 1).ok, false);
});

test('isQuestionScopedCooldown', () => {
  assert.equal(core.isQuestionScopedCooldown({ cooldownScope: 'question' }), true);
  assert.equal(core.isQuestionScopedCooldown({ cooldownScope: 'resource' }), false);
  assert.equal(core.isQuestionScopedCooldown({}), false, 'défaut = ressource entière');
  assert.equal(core.isQuestionScopedCooldown(null), false);
});
