'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  DEFAULT_QUESTION_MARKER_EMOJI,
  normalizeDisplayMode,
  normalizeIconUrl,
  defaultAppearanceForEventType,
  resolveMarkerAppearance,
  validateMarkerAppearance,
  parseAppearanceInput,
} = require('../lib/glMarkerAppearance');

test('normalizeDisplayMode accepte label, emoji et icon', () => {
  assert.strictEqual(normalizeDisplayMode('label'), 'label');
  assert.strictEqual(normalizeDisplayMode('EMOJI'), 'emoji');
  assert.strictEqual(normalizeDisplayMode('icon'), 'icon');
  assert.strictEqual(normalizeDisplayMode('invalid'), null);
});

test('normalizeIconUrl refuse javascript et data URLs', () => {
  assert.strictEqual(normalizeIconUrl('/uploads/media-library/image/x.png'), '/uploads/media-library/image/x.png');
  assert.strictEqual(normalizeIconUrl('https://example.org/icon.png'), 'https://example.org/icon.png');
  assert.strictEqual(normalizeIconUrl('javascript:alert(1)'), null);
  assert.strictEqual(normalizeIconUrl('data:image/png;base64,abc'), null);
});

test('defaultAppearanceForEventType question → emoji ❓', () => {
  const appearance = defaultAppearanceForEventType('question');
  assert.strictEqual(appearance.displayMode, 'emoji');
  assert.strictEqual(appearance.emoji, DEFAULT_QUESTION_MARKER_EMOJI);
  assert.strictEqual(appearance.iconUrl, null);
});

test('defaultAppearanceForEventType start → label', () => {
  const appearance = defaultAppearanceForEventType('start');
  assert.strictEqual(appearance.displayMode, 'label');
  assert.strictEqual(appearance.emoji, null);
});

test('resolveMarkerAppearance question sans colonnes explicites → ❓', () => {
  const resolved = resolveMarkerAppearance({
    label: 'Quiz foret',
    event_type: 'quiz',
  });
  assert.strictEqual(resolved.displayMode, 'emoji');
  assert.strictEqual(resolved.emoji, '❓');
  assert.strictEqual(resolved.ariaLabel, 'Quiz foret');
});

test('resolveMarkerAppearance mode icon sans URL retombe sur label', () => {
  const resolved = resolveMarkerAppearance({
    label: 'Portail',
    event_type: 'story',
    display_mode: 'icon',
    icon_url: null,
  });
  assert.strictEqual(resolved.displayMode, 'label');
  assert.strictEqual(resolved.visualContent, 'Portail');
});

test('validateMarkerAppearance mode icon exige iconUrl', () => {
  const invalid = validateMarkerAppearance({
    displayMode: 'icon',
    iconUrl: '',
    eventType: 'story',
  });
  assert.ok(invalid.error);
});

test('parseAppearanceInput sans champs retourne défaut question', () => {
  const parsed = parseAppearanceInput({}, 'question');
  assert.strictEqual(parsed.skip, true);
  assert.strictEqual(parsed.displayMode, 'emoji');
  assert.strictEqual(parsed.emoji, '❓');
});

test('parseAppearanceInput avec displayMode label', () => {
  const parsed = parseAppearanceInput({ displayMode: 'label' }, 'question');
  assert.strictEqual(parsed.skip, false);
  assert.strictEqual(parsed.displayMode, 'label');
  assert.strictEqual(parsed.emoji, null);
  assert.strictEqual(parsed.iconUrl, null);
});
