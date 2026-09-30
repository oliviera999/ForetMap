'use strict';

/**
 * Import mobile : les sélecteurs Android construisent souvent la data URL avec un type
 * générique (`application/octet-stream`) parce que le `File` n'a pas de `type`. Le
 * serveur doit alors se rabattre sur la signature binaire puis sur l'extension du nom
 * d'origine, au lieu de renvoyer « Type MIME non autorisé ». Test sans base de données.
 *
 * Une image annoncée doit aussi être confirmée par sa signature, et ses métadonnées
 * retirées à l'écriture (`docs/AUDIT_AFFICHAGE_PHOTOS_2026-09-29.md` PH-B3).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { saveMediaFromDataUrl } = require('../lib/mediaLibrary');
const { UPLOADS_DIR } = require('../lib/uploads');

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pJkQAAAAASUVORK5CYII=';
// Vrai JPEG 1×1 (268 octets) : depuis l'échec fermé du retrait EXIF (RG7, audit RGPD du
// 30/09/2026), un contenu à signature JPEG que sharp ne sait pas lire est refusé en 422 — les
// huit octets d'en-tête d'avant ne suffisent plus.
const TINY_JPEG_BASE64 =
  '/9j/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AIgAsM//2Q==';

function cleanup(relativePath) {
  if (!relativePath) return;
  const absolutePath = path.resolve(UPLOADS_DIR, relativePath);
  if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
}

test('data URL générique : le type est déduit de la signature binaire', async () => {
  const saved = await saveMediaFromDataUrl(
    `data:application/octet-stream;base64,${TINY_PNG_BASE64}`,
    { originalName: 'IMG_20260818_101500', app: 'foretmap', skipManifestSync: true },
  );
  try {
    assert.equal(saved.mimeType, 'image/png');
    assert.equal(saved.mediaType, 'image');
    assert.ok(saved.relativePath.endsWith('.png'), `extension inattendue : ${saved.relativePath}`);
    assert.ok(fs.existsSync(path.resolve(UPLOADS_DIR, saved.relativePath)));
  } finally {
    cleanup(saved.relativePath);
  }
});

test('data URL générique sans signature reconnue : repli sur l’extension du nom d’origine', async () => {
  // Octets volontairement quelconques : seule l'extension `.mp3` permet de trancher.
  const anonymous = Buffer.from('contenu binaire sans magie').toString('base64');
  const saved = await saveMediaFromDataUrl(`data:application/octet-stream;base64,${anonymous}`, {
    originalName: 'chanson-du-verger.mp3',
    app: 'foretmap',
    skipManifestSync: true,
  });
  try {
    assert.equal(saved.mimeType, 'audio/mpeg');
    assert.equal(saved.mediaType, 'audio');
    assert.ok(saved.relativePath.endsWith('.mp3'));
  } finally {
    cleanup(saved.relativePath);
  }
});

test('data URL générique d’une photo JPEG : signature reconnue', async () => {
  const saved = await saveMediaFromDataUrl(
    `data:application/octet-stream;base64,${TINY_JPEG_BASE64}`,
    { originalName: 'IMG_20260818_101500.jpg', app: 'foretmap', skipManifestSync: true },
  );
  try {
    assert.equal(saved.mimeType, 'image/jpeg');
    assert.ok(saved.relativePath.endsWith('.jpg'));
  } finally {
    cleanup(saved.relativePath);
  }
});

test('alias de type (image/jpg) accepté', async () => {
  const saved = await saveMediaFromDataUrl(`data:image/jpg;base64,${TINY_JPEG_BASE64}`, {
    originalName: 'photo.jpg',
    app: 'foretmap',
    skipManifestSync: true,
  });
  try {
    assert.equal(saved.mimeType, 'image/jpeg');
  } finally {
    cleanup(saved.relativePath);
  }
});

test('type annoncé contredit par la signature : le vrai format est retenu', async () => {
  const saved = await saveMediaFromDataUrl(`data:image/jpeg;base64,${TINY_PNG_BASE64}`, {
    originalName: 'photo.jpg',
    app: 'foretmap',
    skipManifestSync: true,
  });
  try {
    assert.equal(saved.mimeType, 'image/png');
    assert.ok(saved.relativePath.endsWith('.png'));
  } finally {
    cleanup(saved.relativePath);
  }
});

test('image annoncée dont le contenu n’est pas une image : refus 400', async () => {
  const fake = Buffer.from('<html><script>alert(1)</script></html>').toString('base64');
  await assert.rejects(
    () =>
      saveMediaFromDataUrl(`data:image/jpeg;base64,${fake}`, {
        originalName: 'piege.jpg',
        app: 'foretmap',
        skipManifestSync: true,
      }),
    (err) => err?.status === 400 && /ne correspond pas à une image/.test(String(err.message)),
  );
});

test('SVG annoncé sans balise svg : refus 400', async () => {
  const fake = Buffer.from('pas du tout du svg').toString('base64');
  await assert.rejects(
    () =>
      saveMediaFromDataUrl(`data:image/svg+xml;base64,${fake}`, {
        originalName: 'logo.svg',
        app: 'foretmap',
        skipManifestSync: true,
      }),
    (err) => err?.status === 400,
  );
});

test('contenu non identifiable : toujours refusé en 400', async () => {
  await assert.rejects(
    () =>
      saveMediaFromDataUrl(
        `data:application/octet-stream;base64,${Buffer.from('texte quelconque').toString('base64')}`,
        { originalName: 'note.txt', app: 'foretmap', skipManifestSync: true },
      ),
    (err) => err?.status === 400 && /Type MIME non autorisé/.test(String(err.message || '')),
  );
});
