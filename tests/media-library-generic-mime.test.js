'use strict';

/**
 * Import mobile : les sélecteurs Android construisent souvent la data URL avec un type
 * générique (`application/octet-stream`) parce que le `File` n'a pas de `type`. Le
 * serveur doit alors se rabattre sur la signature binaire puis sur l'extension du nom
 * d'origine, au lieu de renvoyer « Type MIME non autorisé ». Test sans base de données.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { saveMediaFromDataUrl } = require('../lib/mediaLibrary');
const { UPLOADS_DIR } = require('../lib/uploads');

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pJkQAAAAASUVORK5CYII=';
const TINY_JPEG_BASE64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]).toString(
  'base64',
);

function cleanup(relativePath) {
  if (!relativePath) return;
  const absolutePath = path.resolve(UPLOADS_DIR, relativePath);
  if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
}

test('data URL générique : le type est déduit de la signature binaire', () => {
  const saved = saveMediaFromDataUrl(`data:application/octet-stream;base64,${TINY_PNG_BASE64}`, {
    originalName: 'IMG_20260818_101500',
    app: 'foretmap',
    skipManifestSync: true,
  });
  try {
    assert.equal(saved.mimeType, 'image/png');
    assert.equal(saved.mediaType, 'image');
    assert.ok(saved.relativePath.endsWith('.png'), `extension inattendue : ${saved.relativePath}`);
    assert.ok(fs.existsSync(path.resolve(UPLOADS_DIR, saved.relativePath)));
  } finally {
    cleanup(saved.relativePath);
  }
});

test('data URL générique sans signature reconnue : repli sur l’extension du nom d’origine', () => {
  // Octets volontairement quelconques : seule l'extension `.mp3` permet de trancher.
  const anonymous = Buffer.from('contenu binaire sans magie').toString('base64');
  const saved = saveMediaFromDataUrl(`data:application/octet-stream;base64,${anonymous}`, {
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

test('data URL générique d’une photo JPEG : signature reconnue', () => {
  const saved = saveMediaFromDataUrl(`data:application/octet-stream;base64,${TINY_JPEG_BASE64}`, {
    originalName: 'IMG_20260818_101500.jpg',
    app: 'foretmap',
    skipManifestSync: true,
  });
  try {
    assert.equal(saved.mimeType, 'image/jpeg');
    assert.ok(saved.relativePath.endsWith('.jpg'));
  } finally {
    cleanup(saved.relativePath);
  }
});

test('alias de type (image/jpg) accepté', () => {
  const saved = saveMediaFromDataUrl(`data:image/jpg;base64,${TINY_JPEG_BASE64}`, {
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

test('contenu non identifiable : toujours refusé en 400', () => {
  assert.throws(
    () =>
      saveMediaFromDataUrl(
        `data:application/octet-stream;base64,${Buffer.from('texte quelconque').toString('base64')}`,
        { originalName: 'note.txt', app: 'foretmap', skipManifestSync: true },
      ),
    (err) => err?.status === 400 && /Type MIME non autorisé/.test(String(err.message || '')),
  );
});
