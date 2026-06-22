'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const {
  ARCHIVE_FORMAT,
  parseMascotPackZipBuffer,
  buildMascotPackZipBuffer,
  buildPortableVisitPack,
  rewriteVisitPackForServerImport,
  buildGlExportArchive,
  analyzeVisitArchive,
  slugifyArchiveFilename,
  PORTABLE_FRAMES_BASE,
} = require('../lib/mascotPackArchive');

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5qXg8AAAAASUVORK5CYII=',
  'base64',
);

const PACK_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function buildSampleVisitPack() {
  return {
    mascotPackVersion: 2,
    id: 'test-pack',
    label: 'Pack test',
    renderer: 'sprite_cut',
    fallbackSilhouette: 'backpackFox2',
    framesBase: PORTABLE_FRAMES_BASE,
    frameWidth: 64,
    frameHeight: 64,
    stateFrames: {
      idle: { files: ['frame-a.png'], fps: 8 },
    },
  };
}

function buildSampleZip({ pack, assets = {} }) {
  const manifest = {
    format: ARCHIVE_FORMAT,
    formatVersion: 1,
    variant: 'visit',
    exportedAt: new Date().toISOString(),
    source: { pack_id: PACK_UUID, label: 'Pack test' },
    warnings: [],
  };
  const assetFiles = Object.entries(assets).map(([name, buffer]) => ({
    zipPath: `assets/${name}`,
    buffer,
  }));
  return buildMascotPackZipBuffer({ manifest, pack, assetFiles });
}

test('mascotPackArchive : parse et round-trip visit portable', () => {
  const pack = buildSampleVisitPack();
  const zipBuffer = buildSampleZip({ pack, assets: { 'frame-a.png': TINY_PNG } });
  const parsed = parseMascotPackZipBuffer(zipBuffer);
  assert.strictEqual(parsed.manifest.variant, 'visit');
  assert.strictEqual(parsed.assets.size, 1);
  assert.ok(parsed.assets.has('assets/frame-a.png'));
  const analysis = analyzeVisitArchive(parsed);
  assert.strictEqual(analysis.ok, true);
  assert.strictEqual(analysis.assetCount, 1);

  const serverPack = rewriteVisitPackForServerImport(parsed.pack, PACK_UUID);
  assert.ok(String(serverPack.framesBase).includes(PACK_UUID));
  assert.deepStrictEqual(serverPack.stateFrames.idle.files, ['frame-a.png']);
});

test('mascotPackArchive : import répare les chemins API complets hérités dans files', () => {
  const oldUuid = '11111111-2222-3333-4444-555555555555';
  const pack = {
    framesBase: PORTABLE_FRAMES_BASE,
    stateFrames: {
      idle: {
        files: [`/api/visit/mascot-packs/${oldUuid}/assets/cell-r0-c0.png`, 'cell-r0-c1.png'],
        fps: 3,
      },
    },
  };
  const serverPack = rewriteVisitPackForServerImport(pack, PACK_UUID);
  assert.deepStrictEqual(serverPack.stateFrames.idle.files, ['cell-r0-c0.png', 'cell-r0-c1.png']);
  assert.ok(String(serverPack.framesBase).endsWith('/assets/'));
});

test('mascotPackArchive : assets extraits restent sous assets/', () => {
  const pack = buildSampleVisitPack();
  const zipBuffer = buildSampleZip({ pack, assets: { 'frame-a.png': TINY_PNG } });
  const parsed = parseMascotPackZipBuffer(zipBuffer);
  for (const key of parsed.assets.keys()) {
    assert.ok(key.startsWith('assets/'));
    assert.ok(!key.includes('..'));
  }
});

test('mascotPackArchive : buildPortableVisitPack mappe les fichiers', () => {
  const pack = {
    framesBase: `/api/visit/mascot-packs/${PACK_UUID}/assets/`,
    stateFrames: {
      idle: {
        files: [`/api/visit/mascot-packs/${PACK_UUID}/assets/frame-a.png`],
        fps: 6,
      },
    },
  };
  const fileNameBySource = new Map([
    [`/api/visit/mascot-packs/${PACK_UUID}/assets/frame-a.png`, 'frame-a.png'],
  ]);
  const portable = buildPortableVisitPack(pack, fileNameBySource);
  assert.strictEqual(portable.framesBase, PORTABLE_FRAMES_BASE);
  assert.deepStrictEqual(portable.stateFrames.idle.files, ['frame-a.png']);
});

test('mascotPackArchive : buildGlExportArchive structure', () => {
  const built = buildGlExportArchive({
    packRow: { id: 42, chapter_id: 1, name: 'GL Test', version: '1.0' },
    payload: {
      id: 'gl-test',
      name: 'GL Test',
      type: 'gnome',
      renderer: 'sprite_cut',
      assets: [],
      states: [{ key: 'idle', frames: [0], loop: true, fps: 8 }],
    },
  });
  assert.strictEqual(built.manifest.variant, 'gl');
  assert.ok(built.pack);
});

test('slugifyArchiveFilename nettoie les libellés', () => {
  assert.strictEqual(slugifyArchiveFilename('Mon Renard !'), 'mon-renard');
});
