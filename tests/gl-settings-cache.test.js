'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const { initSchema, execute } = require('../database');
const {
  getGameplaySettings,
  invalidateGameplayCache,
  setGameplayCacheForTests,
  DEFAULT_GAMEPLAY,
  camelKeyFor,
  settingKeyForCamel,
} = require('../lib/glSettings');

before(async () => {
  await initSchema();
  await execute("DELETE FROM gl_settings WHERE `key` LIKE 'gameplay.%'");
  invalidateGameplayCache();
});

test('glSettings mappe bien les clés camel <-> SQL', () => {
  assert.strictEqual(camelKeyFor('gameplay.turns_enabled'), 'turnsEnabled');
  assert.strictEqual(settingKeyForCamel('scoringEnabled'), 'gameplay.scoring_enabled');
});

test('glSettings retourne les valeurs par défaut si table vide', async () => {
  const settings = await getGameplaySettings({ forceRefresh: true });
  assert.deepStrictEqual(settings, DEFAULT_GAMEPLAY);
});

test('invalidateGameplayCache recharge depuis la BDD', async () => {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.turns_enabled', 'true', NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`
  );
  invalidateGameplayCache();
  const settings = await getGameplaySettings();
  assert.strictEqual(settings.turnsEnabled, true);
});

test('setGameplayCacheForTests surcharge le cache en mémoire', async () => {
  setGameplayCacheForTests({ narrationEnabled: true });
  const settings = await getGameplaySettings();
  assert.strictEqual(settings.narrationEnabled, true);
  setGameplayCacheForTests(null);
});
