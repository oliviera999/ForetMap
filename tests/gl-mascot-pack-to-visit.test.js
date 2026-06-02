'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const path = require('path');

test('glMascotPackToVisit : map sprite_cut GL vers validation visite', async () => {
  const mod = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'utils', 'glMascotPackToVisit.js')).href);
  const glPack = {
    id: 'gl-pack-test',
    name: 'Pack test',
    renderer: 'sprite_cut',
    assets: [
      { key: 'a', src: 'https://example.com/a.png' },
      { key: 'b', src: 'https://example.com/b.png' },
    ],
    states: [{ key: 'idle', frames: [0, 1], fps: 10, loop: true }],
  };
  const mapped = mod.glMascotPackSpriteCutToVisitValidation(glPack, { relaxAssetPrefix: true });
  assert.equal(mapped.ok, true);
  assert.ok(mapped.spriteCut?.stateFrames?.idle);
  assert.equal(mapped.spriteCut.stateFrames.idle.srcs.length, 2);
  assert.equal(mod.mapGlMascotStateKeyToVisit('talking'), mod.mapGlMascotStateKeyToVisit('talk'));
});

test('glMascotPackToVisit : refuse renderer non sprite_cut', async () => {
  const mod = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'utils', 'glMascotPackToVisit.js')).href);
  const mapped = mod.glMascotPackSpriteCutToVisitValidation({ id: 'x', name: 'x', renderer: 'rive', assets: [], states: [] });
  assert.equal(mapped.ok, false);
});
