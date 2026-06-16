'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const {
  deriveMediaStableKey,
  syncAssetManifests,
  loadMediaKeyIndex,
  resolveMediaByStableKey,
} = require('../lib/glAssetManifest');
const { saveMediaFromBuffer, deleteMediaLibraryItem } = require('../lib/mediaLibrary');
const { biomeAssetSlug } = require('../lib/glBiomesRegistry');
const { buildPublicIntroPayload, loadDefaultIntroConfig } = require('../lib/glIntro');
const { auditGlMediaKeys } = require('../lib/glMediaKeysAudit');

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pJkQAAAAASUVORK5CYII=',
  'base64',
);

/** En-tête MP3 minimal valide (silence, ~0.1 s) */
const TINY_MP3 = Buffer.from([
  0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

const FIXTURE_FILES = [
  { fileName: 'GL_plateau-1_tropiques-africains.jpg', buffer: TINY_PNG, mime: 'image/jpeg' },
  { fileName: 'GL_biome_jungle.png', buffer: TINY_PNG, mime: 'image/png' },
  { fileName: 'GL_recit_feuillet-action_ep-V-03_scene.png', buffer: TINY_PNG, mime: 'image/png' },
  { fileName: 'GL_intro_01_la-boite.png', buffer: TINY_PNG, mime: 'image/png' },
  { fileName: 'GL_plateau-2_savane.mp3', buffer: TINY_MP3, mime: 'audio/mpeg' },
  { fileName: 'GL_plateau-1_jungle.mp3', buffer: TINY_MP3, mime: 'audio/mpeg' },
];

function importFixtures() {
  const saved = [];
  for (const file of FIXTURE_FILES) {
    saved.push(
      saveMediaFromBuffer(file.buffer, file.mime, file.fileName, { skipManifestSync: true }),
    );
  }
  syncAssetManifests();
  return saved;
}

function cleanupSaved(saved) {
  for (const item of saved) {
    if (item?.relativePath) {
      deleteMediaLibraryItem(item.relativePath, { skipManifestSync: true });
    }
  }
  syncAssetManifests();
}

test('liaison média → chapitre après import conventionnel (plateau, biome, feuillet, audio)', () => {
  const saved = importFixtures();
  try {
    const index = loadMediaKeyIndex();
    const keys = Object.keys(index);
    const { resolvePlateauBoardSlug } = require('../src/gl/utils/resolvePlateauBoardSlug.js');
    const { resolvePlateauAudioSlug } = require('../src/gl/utils/resolvePlateauAudioSlug.js');

    const boardSlug = resolvePlateauBoardSlug(1, keys, index);
    assert.strictEqual(boardSlug, 'plateau-1_tropiques-africains');
    assert.ok(resolveMediaByStableKey(boardSlug)?.url?.includes('/uploads/'));

    const biomeSlug = biomeAssetSlug('jungle', 'biome');
    assert.strictEqual(biomeSlug, 'biome_jungle');
    assert.ok(resolveMediaByStableKey(biomeSlug)?.url?.includes('/uploads/'));

    const feuilletPrefix = 'recit_feuillet-action_ep-v-03_';
    const feuilletMatch = keys.find((k) => k.startsWith(feuilletPrefix));
    assert.ok(feuilletMatch, 'clé feuillet ep-V-03 attendue');
    assert.ok(resolveMediaByStableKey(feuilletMatch)?.url?.includes('/uploads/'));

    const audioSlug = resolvePlateauAudioSlug(2, 'savane', null, keys);
    assert.strictEqual(audioSlug, 'plateau-2_savane');
    assert.ok(resolveMediaByStableKey(audioSlug)?.url?.includes('/audio/'));

    const introUrl = resolveMediaByStableKey('intro_01_la-boite');
    assert.ok(introUrl?.url?.includes('/uploads/'));
  } finally {
    cleanupSaved(saved);
  }
});

test('buildPublicIntroPayload résout GL_intro_* via médiathèque', () => {
  const saved = importFixtures();
  try {
    const payload = buildPublicIntroPayload(loadDefaultIntroConfig());
    assert.ok(payload.images.boite.includes('/uploads/media-library/'));
    assert.strictEqual(payload.scenes.length, 9);
  } finally {
    cleanupSaved(saved);
  }
});

test('auditGlMediaKeys — compte les entrées importées', () => {
  const saved = importFixtures();
  try {
    const index = loadMediaKeyIndex();
    const { resolvePlateauBoardSlug } = require('../src/gl/utils/resolvePlateauBoardSlug.js');
    const report = auditGlMediaKeys(index, {
      resolvePlateauBoardSlug: (n, k) => resolvePlateauBoardSlug(n, k, index),
    });

    assert.ok(report.keyCount >= FIXTURE_FILES.length);
    assert.ok(report.ok.some((row) => row.slug === 'plateau-1_tropiques-africains'));
    assert.ok(report.ok.some((row) => row.slug === 'intro_01_la-boite'));
    assert.ok(resolveMediaByStableKey('plateau-2_savane')?.url?.includes('/audio/'));
  } finally {
    cleanupSaved(saved);
  }
});

test('auditGlMediaKeys — branche les scènes de récit de chapitre (recit_0N-chapN_*)', () => {
  const recitFiles = [
    {
      fileName: 'GL_recit_01-chap1_le-carnet-dans-la-savane.png',
      buffer: TINY_PNG,
      mime: 'image/png',
    },
    {
      fileName: 'GL_recit_01-chap1_savane-emerveillement.png',
      buffer: TINY_PNG,
      mime: 'image/png',
    },
    { fileName: 'GL_recit_00-prologue_la-boite-portail.png', buffer: TINY_PNG, mime: 'image/png' },
  ];
  const saved = recitFiles.map((f) =>
    saveMediaFromBuffer(f.buffer, f.mime, f.fileName, { skipManifestSync: true }),
  );
  syncAssetManifests();
  try {
    const index = loadMediaKeyIndex();
    const report = auditGlMediaKeys(index);

    const chap1 = report.ok.find((row) => row.category === 'chapitre-recit' && row.ref === 'chap1');
    assert.ok(chap1, 'le chapitre 1 doit être branché');
    assert.ok(chap1.slug.startsWith('recit_01-chap1_'));

    const prologue = report.ok.find(
      (row) => row.category === 'chapitre-recit' && row.ref === 'prologue',
    );
    assert.ok(prologue, 'le prologue doit être branché');

    // Toutes les scènes du chapitre (pas seulement la couverture) sortent des clés orphelines.
    assert.ok(!report.unwired.includes('recit_01-chap1_savane-emerveillement'));
    assert.ok(!report.unwired.includes('recit_01-chap1_le-carnet-dans-la-savane'));
  } finally {
    cleanupSaved(saved);
  }
});

test('collision de clé stable — avertissement à l’upload (dernier import gagnant)', () => {
  const first = saveMediaFromBuffer(TINY_PNG, 'image/png', 'GL_recit_01-chap1_doublon.png', {
    skipManifestSync: true,
  });
  const second = saveMediaFromBuffer(TINY_PNG, 'image/png', 'GL_recit_01-chap1_doublon.png', {
    skipManifestSync: true,
  });
  try {
    const collision = (second.assetWarnings || []).find((w) => w.type === 'stable_key_collision');
    assert.ok(collision, 'le second upload doit signaler la collision');
    assert.strictEqual(collision.stableKey, 'recit_01-chap1_doublon');
    assert.strictEqual(collision.previousRelativePath, first.relativePath);
    // le premier upload, lui, ne signale rien
    assert.ok(!(first.assetWarnings || []).some((w) => w.type === 'stable_key_collision'));
    // la clé résout vers le dernier fichier importé
    assert.strictEqual(
      resolveMediaByStableKey('recit_01-chap1_doublon')?.relativePath,
      second.relativePath,
    );
  } finally {
    cleanupSaved([first, second]);
  }
});

test('métas de scène (légende / ordre / couverture) — édition, tri et persistance', () => {
  const { listChapterRecitScenes, updateChapterSceneMeta } = require('../lib/glChapterScenes');
  const TEST_SCENE_KEYS = [
    'recit_02-chap2_aaa',
    'recit_02-chap2_bbb',
    'recit_02-chap2_ccc',
  ];
  const pickTestScenes = (scenes) =>
    scenes.filter((scene) => TEST_SCENE_KEYS.includes(scene.stableKey));
  const files = [
    { fileName: 'GL_recit_02-chap2_aaa.png', buffer: TINY_PNG, mime: 'image/png' },
    { fileName: 'GL_recit_02-chap2_bbb.png', buffer: TINY_PNG, mime: 'image/png' },
    { fileName: 'GL_recit_02-chap2_ccc.png', buffer: TINY_PNG, mime: 'image/png' },
  ];
  const saved = files.map((f) =>
    saveMediaFromBuffer(f.buffer, f.mime, f.fileName, { skipManifestSync: true }),
  );
  syncAssetManifests();
  try {
    // sans méta : tri alphabétique (fixtures isolées — le chapitre 2 a des scènes seed en prod)
    let scenes = pickTestScenes(listChapterRecitScenes(2));
    assert.deepStrictEqual(
      scenes.map((s) => s.stableKey),
      TEST_SCENE_KEYS,
    );

    // ordre explicite : ccc passe devant
    updateChapterSceneMeta('recit_02-chap2_ccc', { order: 1, caption: 'La traversée' });
    scenes = listChapterRecitScenes(2);
    assert.strictEqual(scenes[0].stableKey, 'recit_02-chap2_ccc');
    assert.strictEqual(scenes[0].caption, 'La traversée');

    // couverture exclusive par chapitre
    updateChapterSceneMeta('recit_02-chap2_aaa', { cover: true });
    updateChapterSceneMeta('recit_02-chap2_bbb', { cover: true });
    scenes = listChapterRecitScenes(2);
    assert.deepStrictEqual(
      scenes.filter((s) => s.cover).map((s) => s.stableKey),
      ['recit_02-chap2_bbb'],
    );

    // les métas survivent à un ré-import du même fichier (clé identique)
    const reuploaded = saveMediaFromBuffer(TINY_PNG, 'image/png', 'GL_recit_02-chap2_ccc.png', {
      skipManifestSync: true,
    });
    saved.push(reuploaded);
    scenes = listChapterRecitScenes(2);
    const ccc = scenes.find((s) => s.stableKey === 'recit_02-chap2_ccc');
    assert.strictEqual(ccc.caption, 'La traversée');
    assert.strictEqual(ccc.order, 1);

    // clé hors convention refusée
    assert.throws(() => updateChapterSceneMeta('biome_jungle', { caption: 'x' }), /convention/);
  } finally {
    cleanupSaved(saved);
  }
});

test('auditGlMediaKeys — signale les clés récit suspectes (typos)', () => {
  const saved = [
    saveMediaFromBuffer(TINY_PNG, 'image/png', 'GL_recit_1-chap1_typo.png', {
      skipManifestSync: true,
    }),
    saveMediaFromBuffer(TINY_PNG, 'image/png', 'GL_recit_01-chap1_valide.png', {
      skipManifestSync: true,
    }),
  ];
  syncAssetManifests();
  try {
    const report = auditGlMediaKeys(loadMediaKeyIndex());
    assert.ok(report.suspectRecitKeys.includes('recit_1-chap1_typo'));
    assert.ok(!report.suspectRecitKeys.includes('recit_01-chap1_valide'));
  } finally {
    cleanupSaved(saved);
  }
});

test('deriveMediaStableKey — cohérence noms importés images.zip', () => {
  assert.strictEqual(
    deriveMediaStableKey('GL_plateau-1_tropiques-africains.jpg'),
    'plateau-1_tropiques-africains',
  );
  assert.strictEqual(deriveMediaStableKey('GL_plateau-2_savane.mp3'), 'plateau-2_savane');
});
