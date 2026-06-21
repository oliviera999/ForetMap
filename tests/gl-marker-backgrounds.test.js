'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  DEFAULT_MARKER_BACKGROUNDS,
  normalizeMarkerBackgrounds,
  validateMarkerBackgrounds,
  resolveMarkerBackgroundCssVars,
  resolveBackgroundCssValue,
} = require('../lib/glMarkerBackgrounds');

test('normalizeMarkerBackgrounds défaut transparent pour tous', () => {
  assert.deepStrictEqual(normalizeMarkerBackgrounds(null), {
    label: 'transparent',
    emoji: 'transparent',
    icon: 'transparent',
  });
});

test('normalizeMarkerBackgrounds accepte hex et presets', () => {
  assert.deepStrictEqual(
    normalizeMarkerBackgrounds({ label: 'classic', emoji: '#aabbcc', icon: 'TRANSPARENT' }),
    { label: 'classic', emoji: '#aabbcc', icon: 'transparent' },
  );
});

test('validateMarkerBackgrounds rejette valeur invalide', () => {
  const invalid = validateMarkerBackgrounds({
    label: 'orange',
    emoji: 'transparent',
    icon: 'transparent',
  });
  assert.ok(invalid.error);
  const valid = validateMarkerBackgrounds({
    label: 'classic',
    emoji: '#112233',
    icon: 'transparent',
  });
  assert.strictEqual(valid.error, null);
  assert.deepStrictEqual(valid.value, {
    label: 'classic',
    emoji: '#112233',
    icon: 'transparent',
  });
});

test('resolveMarkerBackgroundCssVars transparent avec text-shadow label', () => {
  const vars = resolveMarkerBackgroundCssVars(DEFAULT_MARKER_BACKGROUNDS);
  assert.strictEqual(vars['--gl-marker-bg-label'], 'transparent');
  assert.strictEqual(vars['--gl-marker-bg-emoji'], 'transparent');
  assert.strictEqual(vars['--gl-marker-bg-icon'], 'transparent');
  assert.strictEqual(vars['--gl-marker-bg-emoji-shadow'], 'none');
  assert.notStrictEqual(vars['--gl-marker-label-text-shadow'], 'none');
});

test('resolveBackgroundCssValue classic label orange', () => {
  assert.strictEqual(resolveBackgroundCssValue('label', 'classic'), '#fb923c');
  assert.strictEqual(resolveBackgroundCssValue('emoji', 'classic'), 'rgba(255, 255, 255, 0.92)');
});

test('resolveMarkerBackgroundCssVars classic emoji avec ombre', () => {
  const vars = resolveMarkerBackgroundCssVars({
    label: 'classic',
    emoji: 'classic',
    icon: 'classic',
  });
  assert.strictEqual(vars['--gl-marker-bg-label'], '#fb923c');
  assert.strictEqual(vars['--gl-marker-bg-emoji-shadow'], '0 1px 4px rgba(15, 23, 42, 0.18)');
  assert.strictEqual(vars['--gl-marker-label-text-shadow'], 'none');
});
