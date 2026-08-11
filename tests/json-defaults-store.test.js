'use strict';

// Noyau partagé « défauts JSON + surcharge en base » (lib/shared/jsonDefaultsStore.js),
// consommé par lib/helpContent.js (ForetMap) et lib/glHelp.js (GL).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createDefaultsLoader, resolveStoredConfig } = require('../lib/shared/jsonDefaultsStore');

function writeTempJson(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-defaults-'));
  const file = path.join(dir, 'defaults.json');
  fs.writeFileSync(file, JSON.stringify(contents), 'utf8');
  return file;
}

test('createDefaultsLoader — renvoie le contenu du fichier', () => {
  const file = writeTempJson({ entries: { a: { title: 'A' } } });
  const load = createDefaultsLoader(file);
  assert.deepEqual(load(), { entries: { a: { title: 'A' } } });
});

test('createDefaultsLoader — renvoie une copie profonde (mutation sans effet sur le cache)', () => {
  const file = writeTempJson({ entries: { a: { title: 'A' } } });
  const load = createDefaultsLoader(file);

  const first = load();
  first.entries.a.title = 'MUTÉ';
  first.entries.b = { title: 'ajouté' };

  assert.deepEqual(load(), { entries: { a: { title: 'A' } } });
});

test('createDefaultsLoader — ne lit le fichier qu’une fois (cache mémoire)', () => {
  const file = writeTempJson({ n: 1 });
  const load = createDefaultsLoader(file);
  assert.equal(load().n, 1);

  // Le fichier change sur disque : le cache doit primer.
  fs.writeFileSync(file, JSON.stringify({ n: 2 }), 'utf8');
  assert.equal(load().n, 1);
});

test('createDefaultsLoader — lecture paresseuse : aucun accès disque avant le premier appel', () => {
  const file = path.join(os.tmpdir(), 'fm-defaults-inexistant.json');
  // Construire le chargeur sur un chemin absent ne doit pas jeter…
  const load = createDefaultsLoader(file);
  // …c'est l'appel qui échoue, et bruyamment (défauts manquants = erreur de déploiement).
  assert.throws(() => load(), /ENOENT/);
});

test('resolveStoredConfig — valeur absente : retombe sur les défauts', () => {
  const loadDefaults = () => ({ source: 'defaults' });
  const normalize = () => ({ source: 'normalized' });

  for (const empty of [null, undefined, '', 0]) {
    assert.deepEqual(resolveStoredConfig(empty, { loadDefaults, normalize }), {
      source: 'defaults',
    });
  }
});

test('resolveStoredConfig — chaîne JSON : parsée puis normalisée', () => {
  const result = resolveStoredConfig('{"title":"Depuis la base"}', {
    loadDefaults: () => ({ source: 'defaults' }),
    normalize: (raw) => ({ source: 'normalized', title: raw.title }),
  });
  assert.deepEqual(result, { source: 'normalized', title: 'Depuis la base' });
});

test('resolveStoredConfig — objet déjà désérialisé : normalisé sans reparse', () => {
  const result = resolveStoredConfig(
    { title: 'Objet' },
    {
      loadDefaults: () => ({ source: 'defaults' }),
      normalize: (raw) => ({ source: 'normalized', title: raw.title }),
    },
  );
  assert.deepEqual(result, { source: 'normalized', title: 'Objet' });
});

test('resolveStoredConfig — JSON illisible : retombe sur les défauts sans jeter', () => {
  const result = resolveStoredConfig('{ ceci n’est pas du JSON', {
    loadDefaults: () => ({ source: 'defaults' }),
    normalize: () => assert.fail('normalize ne doit pas être appelé sur un JSON invalide'),
  });
  assert.deepEqual(result, { source: 'defaults' });
});

test('resolveStoredConfig — normalisation qui jette : retombe sur les défauts', () => {
  const result = resolveStoredConfig('{"title":"x"}', {
    loadDefaults: () => ({ source: 'defaults' }),
    normalize: () => {
      throw new Error('modèle invalide');
    },
  });
  assert.deepEqual(result, { source: 'defaults' });
});
