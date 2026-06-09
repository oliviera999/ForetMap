'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const AdmZip = require('adm-zip');
const {
  classifyContentFile,
  decodeBase64Payload,
  extractZipEntries,
} = require('../lib/contentLibraryBulk');
const { buildSpeciesTemplateWorkbook } = require('../lib/glSpeciesImport');
const { buildGlossaryTemplateWorkbook } = require('../lib/glGlossaryImport');
const { buildQcmTemplateWorkbook } = require('../lib/glQcmImport');
const { previewMediaFromBuffer, saveMediaFromBuffer } = require('../lib/mediaLibrary');
const { MAX_ARCHIVE_BYTES, MAX_FILE_BYTES } = require('../lib/contentLibraryUpload');
const fs = require('fs');
const path = require('path');
const { UPLOADS_DIR } = require('../lib/uploads');

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pJkQAAAAASUVORK5CYII=';

test('classifyContentFile reconnaît média PNG et XLSX catalogues', async () => {
  const pngBuffer = decodeBase64Payload(TINY_PNG_DATA_URL);
  const media = await classifyContentFile('photo.png', pngBuffer);
  assert.strictEqual(media.kind, 'media');
  assert.strictEqual(media.mediaType, 'image');

  const species = await classifyContentFile('biocenose.xlsx', await buildSpeciesTemplateWorkbook());
  assert.strictEqual(species.kind, 'species');

  const glossary = await classifyContentFile('glossaire-svt.xlsx', await buildGlossaryTemplateWorkbook());
  assert.strictEqual(glossary.kind, 'glossary');

  const qcm = await classifyContentFile('qcm.xlsx', await buildQcmTemplateWorkbook());
  assert.strictEqual(qcm.kind, 'qcm');
});

test('extractZipEntries ignore __MACOSX et extrait les fichiers', () => {
  const zip = new AdmZip();
  zip.addFile('assets/photo.png', decodeBase64Payload(TINY_PNG_DATA_URL));
  zip.addFile('__MACOSX/._photo.png', Buffer.from('meta'));
  const entries = extractZipEntries(zip.toBuffer());
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].fileName, 'photo.png');
});

test('saveMediaFromBuffer écrit sous media-library/image', () => {
  const buffer = decodeBase64Payload(TINY_PNG_DATA_URL);
  const saved = saveMediaFromBuffer(buffer, 'image/png', 'unit-test.png');
  assert.ok(saved.relativePath.startsWith('media-library/image/'));
  assert.ok(fs.existsSync(path.join(UPLOADS_DIR, saved.relativePath)));
  fs.unlinkSync(path.join(UPLOADS_DIR, saved.relativePath));
});

test('limites bibliothèque — archive 50 Mo et fichier 32 Mo', () => {
  assert.strictEqual(MAX_ARCHIVE_BYTES, 50 * 1024 * 1024);
  assert.strictEqual(MAX_FILE_BYTES, 32 * 1024 * 1024);
});

test('previewMediaFromBuffer ne crée pas de fichier', () => {
  const buffer = decodeBase64Payload(TINY_PNG_DATA_URL);
  const preview = previewMediaFromBuffer(buffer, 'image/png', 'preview.png');
  assert.strictEqual(preview.dryRun, true);
  assert.ok(!fs.existsSync(path.join(UPLOADS_DIR, preview.relativePath)));
});
