'use strict';

/**
 * Audit ForetMap du 19/11/2026, lot 11 — F9 : bornes de dates calculées en UTC au lieu de
 * l'heure locale (filtre de période du carnet, plages par défaut audit / usage / suivi).
 * Scénario : à UTC+1, un article écrit entre 0 h et 1 h sortait de la période du jour.
 *
 * Test en node:test (et non Vitest) : chaque fichier tourne dans son propre processus, où
 * fixer `process.env.TZ` change réellement le fuseau — ce que les fils du pool vm ignorent.
 */
process.env.TZ = 'Europe/Paris';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function load(rel) {
  return import(pathToFileURL(path.join(__dirname, '..', rel)).href);
}

test('F9 — le fuseau du test est bien Europe/Paris', () => {
  assert.strictEqual(new Date('2026-11-19T12:00:00Z').getTimezoneOffset(), -60);
});

test('F9 — bornes du jour du carnet : minuit local, pas minuit UTC', async () => {
  const { localDayStartMs, localDayEndMs } = await load('src/shared/journal/journalPeriod.js');
  assert.strictEqual(localDayStartMs('2026-11-19'), Date.parse('2026-11-19T00:00:00+01:00'));
  assert.strictEqual(localDayEndMs('2026-11-19'), Date.parse('2026-11-20T00:00:00+01:00') - 1);
  // Passage à l'heure d'été : le 29/03/2026 ne dure que 23 h.
  assert.strictEqual(localDayEndMs('2026-03-29'), Date.parse('2026-03-30T00:00:00+02:00') - 1);
  assert.strictEqual(localDayStartMs(''), null);
  assert.strictEqual(localDayStartMs('pas une date'), null);
});

test('F9 — carnet : un article écrit à 0 h 30 reste dans la période du jour', async () => {
  const { filterRowsByLocalPeriod } = await load('src/shared/journal/journalPeriod.js');
  const rows = [
    { id: 'veille', createdAt: '2026-11-18T23:30:00+01:00' },
    { id: 'nuit', createdAt: '2026-11-19T00:30:00+01:00' },
    { id: 'soir', createdAt: '2026-11-19T23:30:00+01:00' },
    { id: 'lendemain', createdAt: '2026-11-20T00:30:00+01:00' },
  ];
  const ids = filterRowsByLocalPeriod(rows, '2026-11-19', '2026-11-19').map((r) => r.id);
  assert.deepStrictEqual(ids, ['nuit', 'soir']);
  assert.strictEqual(filterRowsByLocalPeriod(rows, '', '').length, 4);
});

test('F9 — plages par défaut : « aujourd’hui » local entre 0 h et 1 h', async () => {
  const { localDateInput } = await load('src/utils/localDateInput.js');
  const now = new Date('2026-11-19T00:30:00+01:00');
  assert.strictEqual(localDateInput(0, now), '2026-11-19');
  assert.strictEqual(localDateInput(-29, now), '2026-10-21');
  // Décalage en jours civils à travers le changement d'heure.
  assert.strictEqual(localDateInput(-1, new Date('2026-03-30T00:30:00+02:00')), '2026-03-29');
});
