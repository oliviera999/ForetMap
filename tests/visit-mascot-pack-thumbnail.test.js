'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const {
  THUMBNAIL_FILENAME,
  THUMBNAIL_SIZE_PX,
  visitMascotPackThumbnailRelativePath,
  visitMascotPackThumbnailUrl,
  hasVisitMascotPackThumbnail,
  pickVisitMascotThumbnailSource,
  resolveVisitMascotImagePath,
  generateVisitMascotPackThumbnail,
} = require('../lib/visitMascotPackThumbnail');
const { getAbsolutePath } = require('../lib/uploads');

const PACK_ID = '00000000-0000-4000-8000-00000000ab12';
const PUBLIC_DIRS = [path.resolve(__dirname, '..', 'public')];

after(() => {
  fs.rmSync(getAbsolutePath(`visit_mascot_packs/${PACK_ID}`), { recursive: true, force: true });
});

test('vignette : chemin et URL déterministes, sans migration', () => {
  assert.strictEqual(
    visitMascotPackThumbnailRelativePath(PACK_ID),
    `visit_mascot_packs/${PACK_ID}/${THUMBNAIL_FILENAME}`,
  );
  assert.strictEqual(
    visitMascotPackThumbnailUrl(PACK_ID),
    `/api/visit/mascot-packs/${PACK_ID}/assets/_vignette.png`,
  );
  assert.strictEqual(visitMascotPackThumbnailUrl('../etc'), null);
  assert.strictEqual(visitMascotPackThumbnailRelativePath('pas-un-uuid'), null);
});

test('vignette : première trame de l’état idle (planche ou trames découpées), rien pour Rive', () => {
  const sheet = pickVisitMascotThumbnailSource({
    renderer: 'spritesheet',
    spritesheet: {
      src: '/assets/mascots/x/sheet.png',
      frameWidth: 10,
      frameHeight: 20,
      stateFrames: { walking: { row: 0, frames: 4 }, idle: { row: 2, col: 1, frames: 3 } },
    },
  });
  assert.deepStrictEqual(sheet, {
    src: '/assets/mascots/x/sheet.png',
    crop: { left: 10, top: 40, width: 10, height: 20 },
  });
  assert.deepStrictEqual(
    pickVisitMascotThumbnailSource({
      renderer: 'sprite_cut',
      framesBase: '/assets/mascots/y/',
      stateFrames: { talk: { files: ['a.png', 'b.png'] } },
    }),
    { src: '/assets/mascots/y/a.png', crop: null },
  );
  assert.strictEqual(pickVisitMascotThumbnailSource({ renderer: 'rive', rive: {} }), null);
  assert.strictEqual(pickVisitMascotThumbnailSource(null), null);
});

test('vignette : seules les trois origines connues sont lues, jamais hors du dossier', () => {
  const own = resolveVisitMascotImagePath(`/api/visit/mascot-packs/${PACK_ID}/assets/f.png`, {
    packId: PACK_ID,
    publicDirs: PUBLIC_DIRS,
  });
  assert.strictEqual(own, getAbsolutePath(`visit_mascot_packs/${PACK_ID}/f.png`));
  const other = '00000000-0000-4000-8000-0000000000ff';
  assert.strictEqual(
    resolveVisitMascotImagePath(`/api/visit/mascot-packs/${other}/assets/f.png`, {
      packId: PACK_ID,
    }),
    null,
    'l’asset d’un autre pack n’est pas lu',
  );
  assert.strictEqual(
    resolveVisitMascotImagePath('/assets/mascots/../../package.json', {
      packId: PACK_ID,
      publicDirs: PUBLIC_DIRS,
    }),
    null,
  );
  assert.strictEqual(
    resolveVisitMascotImagePath('/assets/mascots/%2e%2e/x.png', { packId: PACK_ID }),
    null,
  );
  assert.strictEqual(
    resolveVisitMascotImagePath('https://exemple.org/a.png', { packId: PACK_ID }),
    null,
  );
});

test('vignette : générée depuis la planche livrée, petite et au bon endroit', async () => {
  assert.strictEqual(hasVisitMascotPackThumbnail(PACK_ID), false);
  const result = await generateVisitMascotPackThumbnail({
    packId: PACK_ID,
    publicDirs: PUBLIC_DIRS,
    pack: {
      renderer: 'spritesheet',
      pixelated: true,
      spritesheet: {
        src: '/assets/mascots/fox-backpack/fox-backpack-spritesheet.png',
        frameWidth: 153,
        frameHeight: 160,
        stateFrames: { idle: { row: 0, frames: 6 } },
      },
    },
  });
  if (result.skipped === 'sharp_indisponible') return; // hébergeur sans binaires
  assert.strictEqual(result.ok, true, JSON.stringify(result));
  assert.strictEqual(result.url, visitMascotPackThumbnailUrl(PACK_ID));
  assert.strictEqual(hasVisitMascotPackThumbnail(PACK_ID), true);
  const meta = await require('sharp')(getAbsolutePath(result.relativePath)).metadata();
  assert.strictEqual(meta.format, 'png');
  assert.ok(Math.max(meta.width, meta.height) <= THUMBNAIL_SIZE_PX);
  const sheetBytes = fs.statSync(
    path.join(PUBLIC_DIRS[0], 'assets/mascots/fox-backpack/fox-backpack-spritesheet.png'),
  ).size;
  assert.ok(
    result.bytes < sheetBytes / 5,
    `${result.bytes} o contre ${sheetBytes} o pour la planche`,
  );
});

test('vignette : source absente ou pack sans image → rien d’écrit, aucune exception', async () => {
  assert.deepStrictEqual(
    await generateVisitMascotPackThumbnail({ packId: PACK_ID, pack: { renderer: 'rive' } }),
    {
      ok: false,
      skipped: 'aucune_image',
    },
  );
  const missing = await generateVisitMascotPackThumbnail({
    packId: PACK_ID,
    publicDirs: PUBLIC_DIRS,
    pack: {
      renderer: 'sprite_cut',
      stateFrames: { idle: { srcs: ['/assets/mascots/absent.png'] } },
    },
  });
  assert.deepStrictEqual(missing, { ok: false, skipped: 'source_introuvable' });
});
