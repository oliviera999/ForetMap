'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  resolveVisitMascotSpriteLibraryRelPath,
  resolveVisitMascotSpriteLibraryAbsolutePath,
  visitMascotSpriteLibraryFilenameFromUrl,
} = require('../lib/visitMascotSpriteLibraryFiles');
const { UPLOADS_DIR } = require('../lib/uploads');

const ROOT = path.join(UPLOADS_DIR, 'visit_mascot_sprite_library');
const FLAT_NAME = 'test-flat-sprite.png';
const LEGACY_DIR = 'test-legacy-map';
const LEGACY_NAME = 'test-legacy-sprite.png';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5qXg8AAAAASUVORK5CYII=',
  'base64',
);

test.before(() => {
  fs.mkdirSync(path.join(ROOT, LEGACY_DIR), { recursive: true });
  fs.writeFileSync(path.join(ROOT, FLAT_NAME), PNG);
  fs.writeFileSync(path.join(ROOT, LEGACY_DIR, LEGACY_NAME), PNG);
});

test.after(() => {
  fs.rmSync(path.join(ROOT, FLAT_NAME), { force: true });
  fs.rmSync(path.join(ROOT, LEGACY_DIR), { recursive: true, force: true });
});

test('bibliothèque sprites : le fichier à plat est résolu en priorité', () => {
  assert.equal(
    resolveVisitMascotSpriteLibraryRelPath(FLAT_NAME),
    `visit_mascot_sprite_library/${FLAT_NAME}`,
  );
});

test('bibliothèque sprites : repli sur les sous-dossiers hérités (fichiers d’avant la migration 176)', () => {
  assert.equal(
    resolveVisitMascotSpriteLibraryRelPath(LEGACY_NAME),
    `visit_mascot_sprite_library/${LEGACY_DIR}/${LEGACY_NAME}`,
  );
  assert.ok(
    String(resolveVisitMascotSpriteLibraryAbsolutePath(LEGACY_NAME) || '').endsWith(
      path.join(LEGACY_DIR, LEGACY_NAME),
    ),
  );
});

test('bibliothèque sprites : fichier absent ou nom invalide → null', () => {
  assert.equal(resolveVisitMascotSpriteLibraryRelPath('inexistant.png'), null);
  assert.equal(resolveVisitMascotSpriteLibraryRelPath('../etc/passwd'), null);
  assert.equal(resolveVisitMascotSpriteLibraryRelPath(''), null);
  assert.equal(resolveVisitMascotSpriteLibraryAbsolutePath('inexistant.png'), null);
});

test('visitMascotSpriteLibraryFilenameFromUrl accepte URL canonique et URL héritée par carte', () => {
  assert.equal(
    visitMascotSpriteLibraryFilenameFromUrl('/api/visit/mascot-sprite-library/assets/a.png'),
    'a.png',
  );
  assert.equal(
    visitMascotSpriteLibraryFilenameFromUrl('/api/visit/mascot-sprite-library/foret/assets/a.png'),
    'a.png',
  );
  assert.equal(
    visitMascotSpriteLibraryFilenameFromUrl('/api/visit/mascot-packs/x/assets/a.png'),
    null,
  );
  assert.equal(visitMascotSpriteLibraryFilenameFromUrl('/api/visit/mascot-sprite-library/'), null);
});
