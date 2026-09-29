'use strict';

/**
 * Vignettes des familles publiques affichées en tuiles (plantes, tâches, médiathèque) —
 * `docs/AUDIT_AFFICHAGE_PHOTOS_2026-09-29.md` PH-M1. Sans base de données.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { UPLOADS_DIR, writeBufferToDisk, getAbsolutePath, deleteFile } = require('../lib/uploads');
const {
  publicUploadThumbRelativePath,
  deletePublicUploadThumb,
  THUMB_MAX_WIDTH,
} = require('../lib/imageThumb');

const STAMP = Date.now();

async function bigJpeg() {
  return sharp({
    create: { width: 1600, height: 1200, channels: 3, background: { r: 40, g: 110, b: 50 } },
  })
    .jpeg()
    .toBuffer();
}

test('chemin de vignette : même règle que le front (uploadThumbUrl)', () => {
  assert.equal(publicUploadThumbRelativePath('plants/3/photo-1.png'), 'plants/3/photo-1.thumb.jpg');
  assert.equal(publicUploadThumbRelativePath('tasks/abc.webp'), 'tasks/abc.thumb.jpg');
  assert.equal(
    publicUploadThumbRelativePath('media-library/image/2026/09/x.jpg'),
    'media-thumbs/media-library/image/2026/09/x.thumb.jpg',
  );
  for (const p of [
    'zones/z/1.jpg',
    'task-logs/t_1.jpg',
    'plants/3/photo.thumb.jpg',
    'plants/3/../../x.jpg',
    '',
  ]) {
    assert.equal(publicUploadThumbRelativePath(p), null, p);
  }
});

test('écrire une photo de fiche produit sa vignette de 520 px', async () => {
  const main = `plants/${STAMP}/photo-1.jpg`;
  await writeBufferToDisk(main, await bigJpeg());
  try {
    const thumbAbs = getAbsolutePath(publicUploadThumbRelativePath(main));
    assert.ok(fs.existsSync(thumbAbs), 'vignette absente');
    const meta = await sharp(thumbAbs).metadata();
    assert.equal(meta.width, THUMB_MAX_WIDTH);
    assert.equal(meta.format, 'jpeg');
  } finally {
    fs.rmSync(path.join(UPLOADS_DIR, 'plants', String(STAMP)), { recursive: true, force: true });
  }
});

test('médiathèque : vignette rangée hors du catalogue, supprimée avec le média', async () => {
  const {
    saveMediaFromBuffer,
    deleteMediaLibraryItem,
    listMediaLibraryItems,
  } = require('../lib/mediaLibrary');
  const saved = await saveMediaFromBuffer(await bigJpeg(), 'image/jpeg', `vignette-${STAMP}.jpg`, {
    app: 'foretmap',
    skipManifestSync: true,
  });
  const thumbRel = publicUploadThumbRelativePath(saved.relativePath);
  assert.ok(thumbRel.startsWith('media-thumbs/'));
  assert.ok(fs.existsSync(getAbsolutePath(thumbRel)), 'vignette médiathèque absente');
  if (typeof listMediaLibraryItems === 'function') {
    const listed = await listMediaLibraryItems({ app: 'foretmap' });
    const items = Array.isArray(listed) ? listed : listed?.items || [];
    assert.ok(
      items.every((i) => !/\.thumb\.jpg$/i.test(String(i.relativePath || i.relative_path || ''))),
      'une vignette ne doit jamais apparaître dans le catalogue',
    );
  }
  deleteMediaLibraryItem(saved.relativePath, { skipManifestSync: true });
  assert.equal(fs.existsSync(getAbsolutePath(thumbRel)), false, 'vignette restée');
});

test('changement d’extension : la vignette partagée n’est pas supprimée avec l’ancien fichier', async () => {
  const oldMain = `tasks/thumb-${STAMP}.png`;
  const newMain = `tasks/thumb-${STAMP}.jpg`;
  const png = await sharp(await bigJpeg())
    .png()
    .toBuffer();
  await writeBufferToDisk(oldMain, png);
  await writeBufferToDisk(newMain, await bigJpeg());
  const thumbRel = publicUploadThumbRelativePath(newMain);
  try {
    deleteFile(oldMain);
    deletePublicUploadThumb(oldMain);
    assert.ok(fs.existsSync(getAbsolutePath(thumbRel)), 'vignette du nouveau fichier perdue');
    deleteFile(newMain);
    deletePublicUploadThumb(newMain);
    assert.equal(fs.existsSync(getAbsolutePath(thumbRel)), false);
  } finally {
    deleteFile(oldMain);
    deleteFile(newMain);
    deleteFile(thumbRel);
  }
});
