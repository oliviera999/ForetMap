'use strict';

require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const CATALOG_PATH = path.join(__dirname, '..', 'src', 'utils', 'glMascotCatalog.js');

let catalogModule = null;
async function loadCatalogModule() {
  if (!catalogModule) {
    catalogModule = await import(pathToFileURL(CATALOG_PATH).href);
  }
  return catalogModule;
}

test('le catalogue contient au moins 6 gnomes et 6 licornes', async () => {
  const mod = await loadCatalogModule();
  const counts = mod.countGlMascots();
  assert.ok(counts.gnomes >= 6, `Au moins 6 gnomes attendus, vu : ${counts.gnomes}`);
  assert.ok(counts.unicorns >= 6, `Au moins 6 licornes attendues, vu : ${counts.unicorns}`);
});

test('chaque entrée du catalogue est unique et a un type/renderer/fallbackVariant', async () => {
  const mod = await loadCatalogModule();
  const seen = new Set();
  for (const entry of mod.GL_MASCOT_CATALOG) {
    assert.strictEqual(typeof entry.id, 'string');
    assert.ok(entry.id.startsWith('gl-'), `id doit être préfixé gl- : ${entry.id}`);
    assert.ok(!seen.has(entry.id), `id dupliqué : ${entry.id}`);
    seen.add(entry.id);
    assert.ok(['gnome', 'unicorn'].includes(entry.type), `type invalide : ${entry.type}`);
    assert.ok(['fallback', 'rive', 'spritesheet', 'sprite_cut'].includes(entry.renderer));
    assert.ok(typeof entry.fallbackVariant === 'string' && entry.fallbackVariant.length > 0);
    assert.ok(/^#[0-9a-fA-F]{3,8}$/.test(entry.primaryColor));
    assert.ok(/^#[0-9a-fA-F]{3,8}$/.test(entry.secondaryColor));
  }
});

test("getGlMascotById retourne l'entrée ou null", async () => {
  const mod = await loadCatalogModule();
  const first = mod.GL_MASCOT_CATALOG[0];
  assert.strictEqual(mod.getGlMascotById(first.id)?.id, first.id);
  assert.strictEqual(mod.getGlMascotById('inconnu'), null);
  assert.strictEqual(mod.getGlMascotById(''), null);
});

test('getGlMascotsByType filtre correctement', async () => {
  const mod = await loadCatalogModule();
  const gnomes = mod.getGlMascotsByType('gnome');
  const unicorns = mod.getGlMascotsByType('unicorn');
  assert.ok(gnomes.every((e) => e.type === 'gnome'));
  assert.ok(unicorns.every((e) => e.type === 'unicorn'));
  assert.strictEqual(gnomes.length + unicorns.length, mod.GL_MASCOT_CATALOG.length);
});
