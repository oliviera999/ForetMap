'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const AdmZip = require('adm-zip');
const { extractZipEntries } = require('../lib/contentLibraryBulk');

test('extractZipEntries refuse les basenames dupliqués dans des dossiers différents', () => {
  const zip = new AdmZip();
  zip.addFile('a/glossaire.xlsx', Buffer.from('premier'));
  zip.addFile('b/glossaire.xlsx', Buffer.from('second'));

  assert.throws(
    () => extractZipEntries(zip.toBuffer()),
    /Archive ZIP ambiguë : plusieurs fichiers portent le nom glossaire\.xlsx/,
  );
});
