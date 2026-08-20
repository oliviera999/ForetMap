'use strict';

/**
 * Les deux médiathèques logiques (ForetMap et G&L) partagent le **même dossier** sur
 * disque ; seule l'étiquette `app` de `_keys.json` les sépare. La lecture en tenait
 * compte, les suppressions non : une purge déclenchée d'un côté emportait les médias de
 * l'autre, et un chemin suffisait à supprimer le fichier du produit voisin.
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {
  saveMediaFromBuffer,
  listMediaLibraryItems,
  executeMediaLibraryDeleteRequest,
  mediaLibraryItemApp,
} = require('../lib/mediaLibrary');

const stamp = Date.now();
const created = [];

/** Un PNG 1×1 minimal : le type doit être accepté par la médiathèque. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function makeMedia(app, name) {
  const item = saveMediaFromBuffer(PNG_1PX, 'image/png', `${name}-${stamp}.png`, { app });
  created.push(item.relativePath);
  return item;
}

function exists(relativePath) {
  return fs.existsSync(path.join(__dirname, '..', 'uploads', relativePath));
}

before(() => {
  // Rien à initialiser en base : la médiathèque est un dossier + un index de clés.
});

after(() => {
  for (const rel of created) {
    const abs = path.join(__dirname, '..', 'uploads', rel);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  }
});

test('une suppression ciblée ne franchit pas la frontière des médiathèques', () => {
  const foret = makeMedia('foretmap', 'fm-cible');
  assert.strictEqual(mediaLibraryItemApp(foret.relativePath), 'foretmap');

  assert.throws(
    () => executeMediaLibraryDeleteRequest({ relative_path: foret.relativePath }, { app: 'gl' }),
    /autre médiathèque/i,
    'un admin G&L ne doit pas pouvoir supprimer un média ForetMap',
  );
  assert.ok(exists(foret.relativePath), 'le fichier doit être intact');

  // Le propriétaire, lui, supprime normalement.
  executeMediaLibraryDeleteRequest({ relative_path: foret.relativePath }, { app: 'foretmap' });
  assert.ok(!exists(foret.relativePath));
});

test('une purge G&L laisse la médiathèque ForetMap intacte', () => {
  const gl = makeMedia('gl', 'gl-purge');
  const foret = makeMedia('foretmap', 'fm-survivant');

  executeMediaLibraryDeleteRequest({ clear_all: true }, { app: 'gl' });

  assert.ok(!exists(gl.relativePath), 'le média G&L devait partir');
  assert.ok(
    exists(foret.relativePath),
    'le média ForetMap ne devait pas être emporté par une purge G&L',
  );
  assert.ok(
    listMediaLibraryItems(800, { app: 'foretmap' }).some(
      (item) => item.relativePath === foret.relativePath,
    ),
  );
});

test('une purge ForetMap laisse la médiathèque G&L intacte', () => {
  const gl = makeMedia('gl', 'gl-survivant');
  const foret = makeMedia('foretmap', 'fm-purge');

  executeMediaLibraryDeleteRequest({ clear_all: true }, { app: 'foretmap' });

  assert.ok(!exists(foret.relativePath));
  assert.ok(exists(gl.relativePath), 'le média G&L ne devait pas être emporté');
});
