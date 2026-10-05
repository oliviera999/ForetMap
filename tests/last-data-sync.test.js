'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const loadModule = () => import('../src/utils/lastDataSync.js');

test('offlineBannerText : sans synchronisation connue, parle des données gardées', async () => {
  const { offlineBannerText } = await loadModule();
  const text = offlineBannerText(null);
  assert.match(text, /^Hors ligne — données gardées sur l’appareil\./);
  assert.match(text, /partiront au retour du réseau/);
});

test('offlineBannerText : le jour même, seulement l’heure', async () => {
  const { offlineBannerText } = await loadModule();
  const now = new Date(2026, 9, 5, 14, 30).getTime();
  const at = new Date(2026, 9, 5, 9, 5).getTime();
  assert.match(offlineBannerText(at, now), /dernière synchronisation \(à 09:05\)/);
});

test('offlineBannerText : un autre jour, la date en plus', async () => {
  const { offlineBannerText } = await loadModule();
  const now = new Date(2026, 9, 5, 14, 30).getTime();
  const at = new Date(2026, 9, 3, 16, 45).getTime();
  assert.match(offlineBannerText(at, now), /\(le 3 octobre à 16:45\)/);
});

test('readLastDataSyncAt / rememberLastDataSyncAt : sans stockage, rien ne lève', async () => {
  const { readLastDataSyncAt, rememberLastDataSyncAt } = await loadModule();
  assert.strictEqual(readLastDataSyncAt(), null);
  assert.doesNotThrow(() => rememberLastDataSyncAt(Date.now()));
  assert.doesNotThrow(() => rememberLastDataSyncAt(Number.NaN));
});
