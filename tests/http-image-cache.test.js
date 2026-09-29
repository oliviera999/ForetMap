'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PUBLIC_IMAGE_CACHE_CONTROL,
  IMMUTABLE_IMAGE_CACHE_CONTROL,
  sendFilePrivateImageOptions,
  publicImageCacheControlForPath,
} = require('../lib/httpImageCache');

test('médiathèque (nom horodaté unique) : cache immuable, vignette comprise', () => {
  for (const p of [
    '/srv/app/uploads/media-library/image/foretmap/1790000000000-abcdef0123.jpg',
    'C:\\app\\uploads\\media-library\\image\\gl\\1790000000000-abcdef0123.png',
    '/srv/app/uploads/media-thumbs/media-library/image/foretmap/1790000000000-abcdef0123.thumb.jpg',
  ]) {
    assert.equal(publicImageCacheControlForPath(p), IMMUTABLE_IMAGE_CACHE_CONTROL, p);
  }
});

test('noms réécrits sur place (zones, tâches, avatars) : cache public revalidé', () => {
  for (const p of [
    '/srv/app/uploads/zones/z1/12.jpg',
    '/srv/app/uploads/tasks/abc.jpg',
    '/srv/app/uploads/media-library/image/foretmap/logo.png',
  ]) {
    assert.equal(publicImageCacheControlForPath(p), PUBLIC_IMAGE_CACHE_CONTROL, p);
  }
});

test('images privées : private, no-store et pas de Cache-Control automatique', () => {
  const opts = sendFilePrivateImageOptions();
  assert.equal(opts.headers['Cache-Control'], 'private, no-store');
  assert.equal(opts.cacheControl, false);
  assert.equal(opts.dotfiles, 'allow');
});
