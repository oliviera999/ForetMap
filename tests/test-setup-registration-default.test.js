'use strict';

/**
 * Garde de l'outillage de test : une suite e2e interrompue (phase de fin sautée) laisse
 * `ui.auth.allow_register` à `false` dans la base partagée. `tests/helpers/setup.js` doit
 * rouvrir l'inscription à l'initialisation de chaque fichier, sinon `npm test` tombe en
 * dizaines d'échecs 403/401 sans rapport avec le code (constaté le 22/11/2026).
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');

const { initSchema } = require('../database');
const { setSetting, getSettingValue } = require('../lib/settings');

test('initSchema rouvre une inscription laissée fermée par un e2e interrompu', async () => {
  await initSchema();
  await setSetting('ui.auth.allow_register', false);
  assert.equal(await getSettingValue('ui.auth.allow_register', true), false);

  await initSchema();

  assert.equal(await getSettingValue('ui.auth.allow_register', true), true);
});
