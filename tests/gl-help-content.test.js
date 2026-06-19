'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  loadDefaultGlHelpConfig,
  normalizeGlHelpConfig,
  HELP_ENTRY_KEYS,
} = require('../lib/glHelp');

test('loadDefaultGlHelpConfig contient les onglets GL', () => {
  const defaults = loadDefaultGlHelpConfig();
  assert.ok(defaults.entries['tab:maps']?.body);
  assert.ok(defaults.entries['tab:my-journal']?.title);
  assert.ok(HELP_ENTRY_KEYS.includes('tab:mj'));
});

test('normalizeGlHelpConfig préserve une surcharge', () => {
  const normalized = normalizeGlHelpConfig({
    entries: {
      'tab:rules': { title: 'Aide règles', body: 'Texte custom' },
    },
  });
  assert.equal(normalized.entries['tab:rules'].body, 'Texte custom');
  assert.ok(normalized.entries['tab:maps']?.body);
});
