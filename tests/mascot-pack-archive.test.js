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
  visitPackToUnifiedForm,
  buildVisitExportArchive,
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

test('mascotPackArchive : visitPackToUnifiedForm produit states[] (label custom préservé)', () => {
  const pack = {
    mascotPackVersion: 2,
    id: 'p',
    label: 'P',
    renderer: 'sprite_cut',
    framesBase: PORTABLE_FRAMES_BASE,
    frameWidth: 64,
    frameHeight: 64,
    fallbackSilhouette: 'gnome',
    stateFrames: {
      idle: { files: ['a.png', 'b.png'], fps: 8 },
      cast_spell: { files: ['c.png'], fps: 6 },
    },
    customStates: [{ key: 'cast_spell', label: 'Incantation' }],
  };
  const unified = visitPackToUnifiedForm(pack);
  assert.ok(Array.isArray(unified.states));
  assert.strictEqual(unified.stateFrames, undefined);
  assert.strictEqual(unified.customStates, undefined);
  const idle = unified.states.find((s) => s.key === 'idle');
  const cast = unified.states.find((s) => s.key === 'cast_spell');
  assert.deepStrictEqual(idle.files, ['a.png', 'b.png']);
  assert.strictEqual(cast.label, 'Incantation');
  assert.strictEqual(cast.fps, 6);
});

test('mascotPackArchive : import accepte la forme states[] (réécrit les refs, conserve la forme)', () => {
  const pack = {
    mascotPackVersion: 2,
    id: 'test-pack',
    label: 'Pack test',
    renderer: 'sprite_cut',
    fallbackSilhouette: 'gnome',
    framesBase: PORTABLE_FRAMES_BASE,
    frameWidth: 64,
    frameHeight: 64,
    states: [
      { key: 'idle', files: ['frame-a.png'], fps: 8 },
      { key: 'cast_spell', label: 'Incantation', files: ['frame-b.png'], fps: 6 },
    ],
  };
  const serverPack = rewriteVisitPackForServerImport(pack, PACK_UUID);
  assert.ok(String(serverPack.framesBase).includes(PACK_UUID));
  // Forme tableau préservée (validateMascotPack désucrera via normalizeUnifiedStates).
  assert.ok(Array.isArray(serverPack.states));
  assert.strictEqual(serverPack.stateFrames, undefined);
  const idle = serverPack.states.find((s) => s.key === 'idle');
  const cast = serverPack.states.find((s) => s.key === 'cast_spell');
  assert.deepStrictEqual(idle.files, ['frame-a.png']);
  assert.deepStrictEqual(cast.files, ['frame-b.png']);
  assert.strictEqual(cast.label, 'Incantation');
});

test('mascotPackArchive : buildVisitExportArchive unified émet pack.json en states[]', () => {
  const built = buildVisitExportArchive({
    packRow: {
      id: PACK_UUID,
      label: 'Pack test',
      map_id: 'm1',
      catalog_id: 'srv-x',
      is_published: 1,
    },
    packJson: buildSampleVisitPack(),
    mapId: 'm1',
    unified: true,
  });
  assert.strictEqual(built.manifest.variant, 'visit');
  assert.strictEqual(built.manifest.statesForm, 'unified');
  assert.ok(Array.isArray(built.pack.states));
  assert.strictEqual(built.pack.stateFrames, undefined);
  assert.ok(built.pack.states.find((s) => s.key === 'idle'));
});

test('mascotPackArchive : buildVisitExportArchive (défaut) reste en stateFrames', () => {
  const built = buildVisitExportArchive({
    packRow: { id: PACK_UUID, label: 'Pack test', map_id: 'm1' },
    packJson: buildSampleVisitPack(),
    mapId: 'm1',
  });
  assert.strictEqual(built.manifest.statesForm, 'stateFrames');
  assert.ok(built.pack.stateFrames && typeof built.pack.stateFrames === 'object');
  assert.strictEqual(built.pack.states, undefined);
});
