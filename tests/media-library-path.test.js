const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { deleteMediaLibraryItem } = require('../lib/mediaLibrary');
const { UPLOADS_DIR, ensureDir } = require('../lib/uploads');

test('deleteMediaLibraryItem refuse les traversées hors de uploads/media-library', () => {
  const victimRelativePath = `media-library-path-victim-${Date.now()}.txt`;
  const victimAbsolutePath = path.join(UPLOADS_DIR, victimRelativePath);
  ensureDir(path.dirname(victimAbsolutePath));
  fs.writeFileSync(victimAbsolutePath, 'victime');

  try {
    assert.throws(
      () => deleteMediaLibraryItem(`media-library/../${victimRelativePath}`),
      (err) => err?.status === 400 && /Chemin média invalide/.test(String(err.message || ''))
    );
    assert.ok(fs.existsSync(victimAbsolutePath), 'Le fichier hors médiathèque ne doit pas être supprimé');
  } finally {
    if (fs.existsSync(victimAbsolutePath)) fs.unlinkSync(victimAbsolutePath);
  }
});

