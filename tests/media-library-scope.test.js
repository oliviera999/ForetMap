'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  saveMediaFromBuffer,
  listMediaLibraryItems,
  deleteMediaLibraryItem,
  resolveMediaItemApp,
  mediaItemMatchesApp,
} = require('../lib/mediaLibrary');

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pJkQAAAAASUVORK5CYII=',
  'base64'
);

test('resolveMediaItemApp / mediaItemMatchesApp — médias hérités réservés à G&L', () => {
  assert.strictEqual(resolveMediaItemApp(null), 'gl');
  assert.strictEqual(resolveMediaItemApp('foretmap'), 'foretmap');
  assert.strictEqual(resolveMediaItemApp('inconnu'), 'gl');

  // legacy (sans étiquette) : visible côté G&L, masqué côté ForetMap
  assert.strictEqual(mediaItemMatchesApp(null, 'gl'), true);
  assert.strictEqual(mediaItemMatchesApp(null, 'foretmap'), false);
  // étiquetté ForetMap : strictement côté ForetMap
  assert.strictEqual(mediaItemMatchesApp('foretmap', 'foretmap'), true);
  assert.strictEqual(mediaItemMatchesApp('foretmap', 'gl'), false);
  assert.strictEqual(mediaItemMatchesApp('gl', 'gl'), true);
  // sans filtre : tout passe
  assert.strictEqual(mediaItemMatchesApp('foretmap', null), true);
});

test('listMediaLibraryItems cloisonne les deux médiathèques (legacy → G&L)', () => {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const fm = saveMediaFromBuffer(TINY_PNG, 'image/png', `scope-fm-${stamp}.png`, { skipManifestSync: true, app: 'foretmap' });
  const gl = saveMediaFromBuffer(TINY_PNG, 'image/png', `scope-gl-${stamp}.png`, { skipManifestSync: true, app: 'gl' });
  const legacy = saveMediaFromBuffer(TINY_PNG, 'image/png', `scope-legacy-${stamp}.png`, { skipManifestSync: true });

  const created = new Set([fm.relativePath, gl.relativePath, legacy.relativePath]);

  try {
    const foretmap = listMediaLibraryItems(800, { app: 'foretmap' }).filter((i) => created.has(i.relativePath));
    const glList = listMediaLibraryItems(800, { app: 'gl' }).filter((i) => created.has(i.relativePath));

    assert.deepStrictEqual(
      foretmap.map((i) => i.relativePath).sort(),
      [fm.relativePath],
      'ForetMap ne voit que ses propres médias'
    );
    assert.deepStrictEqual(
      glList.map((i) => i.relativePath).sort(),
      [gl.relativePath, legacy.relativePath].sort(),
      'G&L voit ses médias + les médias hérités'
    );

    // Chaque item expose slug + médiathèque d'origine.
    const fmItem = foretmap[0];
    assert.strictEqual(fmItem.app, 'foretmap');
    assert.ok(fmItem.stableKey, 'slug exposé pour l’affichage');

    const legacyItem = glList.find((i) => i.relativePath === legacy.relativePath);
    assert.strictEqual(legacyItem.app, 'gl', 'média hérité rattaché à G&L');
  } finally {
    deleteMediaLibraryItem(fm.relativePath, { skipManifestSync: true });
    deleteMediaLibraryItem(gl.relativePath, { skipManifestSync: true });
    deleteMediaLibraryItem(legacy.relativePath, { skipManifestSync: true });
  }
});
