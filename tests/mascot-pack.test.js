const test = require('node:test');
const assert = require('node:assert/strict');

async function loadMascotPack() {
  return import('../src/utils/mascotPack.js');
}

test('validateMascotPackV1 accepte le pack exemple (chemins /assets/)', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { validateMascotPackV1 } = await loadMascotPack();
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/mascot-pack.example.json'), 'utf8'));
  const r = validateMascotPackV1(raw, { relaxAssetPrefix: false });
  assert.equal(r.ok, true);
  assert.equal(r.pack.id, 'exemple-pack');
  assert.equal(r.spriteCut.stateFrames.idle.srcs.length, 2);
  assert.ok(Array.isArray(r.spriteCut.stateFrames.idle.frameDwellMs));
  assert.equal(r.spriteCut.stateFrames.idle.frameDwellMs.length, 2);
  assert.equal(r.spriteCut.displayScale, 1);
});

test('validateMascotPackV1 refuse un état inconnu', async () => {
  const { validateMascotPackV1 } = await loadMascotPack();
  const r = validateMascotPackV1({
    mascotPackVersion: 1,
    id: 'bad',
    label: 'x',
    renderer: 'sprite_cut',
    framesBase: '/assets/mascots/bad/frames/',
    frameWidth: 32,
    frameHeight: 32,
    fallbackSilhouette: 'gnome',
    stateFrames: {
      idle: { files: ['a.png'], fps: 1 },
      not_a_real_state: { files: ['b.png'], fps: 1 },
    },
  }, { relaxAssetPrefix: false });
  assert.equal(r.ok, false);
});

test('validateMascotPackV1 refuse frameDwellMs de mauvaise longueur', async () => {
  const { validateMascotPackV1 } = await loadMascotPack();
  const r = validateMascotPackV1({
    mascotPackVersion: 1,
    id: 'dwell-bad',
    label: 'x',
    renderer: 'sprite_cut',
    framesBase: '/assets/mascots/dwell-bad/frames/',
    frameWidth: 32,
    frameHeight: 32,
    fallbackSilhouette: 'gnome',
    stateFrames: {
      idle: { files: ['a.png', 'b.png'], fps: 4, frameDwellMs: [100] },
    },
  }, { relaxAssetPrefix: false });
  assert.equal(r.ok, false);
});

test('expandMascotPackToSpriteCut sans frameDwellMs remplit fps seulement', async () => {
  const { validateMascotPackV1 } = await loadMascotPack();
  const r = validateMascotPackV1({
    mascotPackVersion: 1,
    id: 'no-dwell',
    label: 'x',
    renderer: 'sprite_cut',
    framesBase: '/assets/mascots/no-dwell/frames/',
    frameWidth: 64,
    frameHeight: 64,
    fallbackSilhouette: 'gnome',
    stateFrames: {
      idle: { files: ['a.png', 'b.png'], fps: 10 },
    },
  }, { relaxAssetPrefix: false });
  assert.equal(r.ok, true);
  assert.equal(r.spriteCut.stateFrames.idle.frameDwellMs, undefined);
  assert.equal(r.spriteCut.stateFrames.idle.srcs.length, 2);
});

test('allowedFramesBasePrefixes autorise une base API pack', async () => {
  const { validateMascotPackV1 } = await loadMascotPack();
  const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const base = `/api/visit/mascot-packs/${uuid}/assets/`;
  const r = validateMascotPackV1({
    mascotPackVersion: 1,
    id: 'api-pack',
    label: 'API',
    renderer: 'sprite_cut',
    framesBase: base,
    frameWidth: 16,
    frameHeight: 16,
    fallbackSilhouette: 'gnome',
    stateFrames: {
      idle: { files: ['a.png'], fps: 2 },
    },
  }, { allowedFramesBasePrefixes: [base] });
  assert.equal(r.ok, true);
});

test('relaxAssetPrefix autorise framesBase hors /assets/', async () => {
  const { validateMascotPackV1 } = await loadMascotPack();
  const r = validateMascotPackV1({
    mascotPackVersion: 1,
    id: 'blob-test',
    label: 'Blob',
    renderer: 'sprite_cut',
    framesBase: '/virtual/',
    frameWidth: 8,
    frameHeight: 8,
    fallbackSilhouette: 'gnome',
    stateFrames: {
      idle: { srcs: ['blob:http://x/1'], fps: 2 },
    },
  }, { relaxAssetPrefix: true });
  assert.equal(r.ok, true);
});
