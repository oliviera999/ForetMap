'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const path = require('path');

test('glMascotPackToVisit : map sprite_cut GL vers validation visite', async () => {
  const mod = await import(
    pathToFileURL(path.join(__dirname, '..', 'src', 'utils', 'glMascotPackToVisit.js')).href
  );
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

test('glMascotPackToVisit : préserve un état GL personnalisé + porte les triggers', async () => {
  const mod = await import(
    pathToFileURL(path.join(__dirname, '..', 'src', 'utils', 'glMascotPackToVisit.js')).href
  );
  const glPack = {
    id: 'gl-custom',
    name: 'GL custom',
    renderer: 'sprite_cut',
    assets: [
      { key: 'a', src: 'https://example.com/a.png' },
      { key: 'b', src: 'https://example.com/b.png' },
    ],
    states: [
      { key: 'idle', frames: [0] },
      { key: 'cast_spell', label: 'Incantation', frames: [1] },
    ],
    triggers: [
      {
        key: 'ambient_cast',
        label: 'Incante régulièrement',
        type: 'periodic',
        state: 'cast_spell',
        durationMs: 1200,
        everyMs: 9000,
      },
    ],
  };
  const mapped = mod.glMascotPackSpriteCutToVisitValidation(glPack, { relaxAssetPrefix: true });
  assert.equal(mapped.ok, true);
  // L'état GL non canonique est préservé (et non écrasé en idle).
  assert.ok(mapped.spriteCut.stateFrames.cast_spell);
  assert.ok(Array.isArray(mapped.pack.customStates));
  assert.equal(mapped.pack.customStates[0].key, 'cast_spell');
  assert.equal(mapped.pack.mascotPackVersion, 2);
  assert.equal(mapped.pack.customTriggers[0].state, 'cast_spell');
  assert.equal(mapped.pack.customTriggers[0].type, 'periodic');
});

test('glMascotPack : refuse un trigger périodique sans everyMs', async () => {
  const mod = await import(
    pathToFileURL(path.join(__dirname, '..', 'src', 'utils', 'glMascotPack.js')).href
  );
  const r = mod.validateGlMascotPack({
    id: 'gl-bad-trig',
    name: 'X',
    renderer: 'sprite_cut',
    assets: [{ key: 'a', src: 'x' }],
    states: [{ key: 'idle', frames: [0] }],
    triggers: [{ key: 'amb', label: 'A', type: 'periodic', state: 'idle', durationMs: 900 }],
  });
  assert.equal(r.success, false);
});

test('glMascotPackToVisit : refuse renderer non sprite_cut', async () => {
  const mod = await import(
    pathToFileURL(path.join(__dirname, '..', 'src', 'utils', 'glMascotPackToVisit.js')).href
  );
  const mapped = mod.glMascotPackSpriteCutToVisitValidation({
    id: 'x',
    name: 'x',
    renderer: 'rive',
    assets: [],
    states: [],
  });
  assert.equal(mapped.ok, false);
});

test('glMascotPackToVisit : defaults d’animation viennent du seul chemin visite (fps/pixelated/displayScale)', async () => {
  const mod = await import(
    pathToFileURL(path.join(__dirname, '..', 'src', 'utils', 'glMascotPackToVisit.js')).href
  );
  // Aucun fps / pixelated / displayScale fourni : tout doit être défauté par le cœur visite.
  const mapped = mod.glMascotPackSpriteCutToVisitValidation(
    {
      id: 'gl-defaults',
      name: 'GL defaults',
      renderer: 'sprite_cut',
      assets: [{ key: 'a', src: 'https://example.com/a.png' }],
      states: [{ key: 'idle', frames: [0] }],
    },
    { relaxAssetPrefix: true },
  );
  assert.equal(mapped.ok, true);
  // fps : default 8 appliqué par expandMascotPackToSpriteCut (pas par l’adaptateur GL).
  assert.equal(mapped.spriteCut.stateFrames.idle.fps, 8);
  // pixelated : default true (cœur visite) ; displayScale : default 1 (cœur visite).
  assert.equal(mapped.spriteCut.pixelated, true);
  assert.equal(mapped.spriteCut.displayScale, 1);
});

test('glMascotPackToVisit : clamp displayScale appliqué par le cœur visite (un seul chemin)', async () => {
  const mod = await import(
    pathToFileURL(path.join(__dirname, '..', 'src', 'utils', 'glMascotPackToVisit.js')).href
  );
  // displayScale < 0.25 : accepté par le schéma (positif) puis clampé à 0.25 par l’expansion.
  const mapped = mod.glMascotPackSpriteCutToVisitValidation(
    {
      id: 'gl-scale',
      name: 'GL scale',
      renderer: 'sprite_cut',
      displayScale: 0.1,
      assets: [{ key: 'a', src: 'https://example.com/a.png' }],
      states: [{ key: 'idle', frames: [0], fps: 12 }],
    },
    { relaxAssetPrefix: true },
  );
  assert.equal(mapped.ok, true);
  assert.equal(mapped.spriteCut.displayScale, 0.25);
  // fps explicite préservé (transmis tel quel, sans re-duplication de default).
  assert.equal(mapped.spriteCut.stateFrames.idle.fps, 12);
});
