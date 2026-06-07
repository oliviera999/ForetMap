require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {
  deriveMediaStableKey,
  syncAssetManifests,
  loadMediaKeyIndex,
} = require('../lib/glAssetManifest');
const {
  saveMediaFromBuffer,
  resolveMediaByStableKey,
  deleteMediaLibraryItem,
} = require('../lib/mediaLibrary');
const { UPLOADS_DIR } = require('../lib/uploads');

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pJkQAAAAASUVORK5CYII=',
  'base64',
);

test('deriveMediaStableKey retire GL_ et normalise', () => {
  assert.strictEqual(deriveMediaStableKey('GL_plateau-1_fond.png'), 'plateau-1_fond');
  assert.strictEqual(deriveMediaStableKey('GL_biome_jungle_afc.jpg'), 'biome_jungle_afc');
  assert.strictEqual(deriveMediaStableKey('GL_reçit_feuillet-action_ep-V-03_scene.png'), 'recit_feuillet-action_ep-v-03_scene');
});

test('saveMediaFromBuffer enregistre clé stable et manifeste auto', () => {
  const fileName = `GL_test-stable-${Date.now()}.png`;
  const saved = saveMediaFromBuffer(TINY_PNG, 'image/png', fileName);
  assert.ok(saved.stableKey);
  assert.strictEqual(saved.stableKey, deriveMediaStableKey(fileName));

  const resolved = resolveMediaByStableKey(saved.stableKey);
  assert.ok(resolved?.url?.startsWith('/uploads/media-library/'));

  const manifestPath = path.join(UPLOADS_DIR, 'media-library', '_manifest.images.json');
  assert.ok(fs.existsSync(manifestPath));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.ok(manifest[saved.stableKey]);

  deleteMediaLibraryItem(saved.relativePath);
});

test('re-upload même slug met à jour la résolution', () => {
  const fileName = 'GL_test-reupload.png';
  const first = saveMediaFromBuffer(TINY_PNG, 'image/png', fileName, { skipManifestSync: true });
  const second = saveMediaFromBuffer(TINY_PNG, 'image/png', fileName, { skipManifestSync: true });
  syncAssetManifests();

  const index = loadMediaKeyIndex();
  assert.strictEqual(index[deriveMediaStableKey(fileName)].relativePath, second.relativePath);

  const resolved = resolveMediaByStableKey(deriveMediaStableKey(fileName));
  assert.strictEqual(resolved.url, second.url);

  deleteMediaLibraryItem(first.relativePath, { skipManifestSync: true });
  deleteMediaLibraryItem(second.relativePath);
});

test('resolveMediaByStableKey accepte clé GL_ préfixée (intro)', () => {
  const fileName = 'GL_intro_01_la-boite.png';
  const saved = saveMediaFromBuffer(TINY_PNG, 'image/png', fileName, { skipManifestSync: true });
  syncAssetManifests();
  const resolved = resolveMediaByStableKey('GL_intro_01_la-boite');
  assert.ok(resolved?.url?.includes(saved.relativePath.split('/').pop().split('.')[0].slice(0, 8)) || resolved?.url?.startsWith('/uploads/'));
  deleteMediaLibraryItem(saved.relativePath);
});
