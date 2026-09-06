'use strict';

// Import des fiches `tutos/*.html` — détection des doublons (aucune BDD réelle : le module
// ne consomme que `queryAll` / `queryOne` / `execute`, remplacés ici par des bouchons).
//
// Régression visée : « le bouton Importer les nouvelles fiches ne fonctionne pas ». Le
// rapprochement de dernier recours entre le nom de fichier et le slug d'un tutoriel
// existant acceptait n'importe quelle inclusion, dans les deux sens et jusqu'aux slugs
// privés de tirets. Une fiche réellement nouvelle était donc classée « déjà en base »,
// `pending` retombait à 0 et le bouton d'import restait grisé sans explication.

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  slugMatchesFilenameStem,
  stemFromTutorialFilename,
  scanTutosForImport,
} = require('../lib/importTutosFromFilesystem');

/** Base bouchonnée : uniquement les colonnes que `loadExistingTutorialIndex` lit. */
function fakeDb(rows) {
  return {
    queryAll: async () => rows,
    queryOne: async () => null,
    execute: async () => ({ insertId: 1 }),
  };
}

async function withTutosDir(files, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'foretmap-tutos-scan-'));
  try {
    for (const [name, html] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), html, 'utf8');
    }
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const htmlWithTitle = (title, body) =>
  `<!doctype html><html lang="fr"><head><title>${title}</title></head><body><p>${body}</p></body></html>`;

describe('slugMatchesFilenameStem (rapprochement nom de fichier ↔ slug)', () => {
  it('accepte les rapprochements historiques du dossier tutos/', () => {
    // Ces trois fiches ne se retrouvent que par ce critère : ni le titre, ni le slug,
    // ni l'empreinte ne concordent avec la ligne semée en base.
    assert.equal(slugMatchesFilenameStem('compostage', 'compost'), true);
    assert.equal(slugMatchesFilenameStem('jardin-n3', 'jardin'), true);
    assert.equal(slugMatchesFilenameStem('desherbage-doux', 'desherbage'), true);
    assert.equal(slugMatchesFilenameStem('semences', 'semences'), true);
  });

  it('refuse une fiche nouvelle dont le radical n’est pas le début du slug', () => {
    // `fiche-plantes-punk.html` était happée par `associations-plantes`.
    assert.equal(slugMatchesFilenameStem('associations-plantes', 'plantes'), false);
    // `fiche-semences-locales-punk.html` était happée par `semences`.
    assert.equal(slugMatchesFilenameStem('semences', 'semences-locales'), false);
    // Le repli « sans tirets » rapprochait deux sujets sans rapport.
    assert.equal(slugMatchesFilenameStem('le-sol-vivant', 'solvivant'), false);
  });

  it('ignore les radicaux trop courts pour discriminer', () => {
    assert.equal(slugMatchesFilenameStem('eau-au-jardin', 'eau'), false);
    assert.equal(slugMatchesFilenameStem('eau', 'eau'), true);
  });

  it('stemFromTutorialFilename retire le préfixe fiche- et le suffixe -punk', () => {
    assert.equal(stemFromTutorialFilename('fiche-compost-punk.html'), 'compost');
    assert.equal(stemFromTutorialFilename('fiche-jardin-punk-n3.html'), 'jardin');
    assert.equal(stemFromTutorialFilename('Fiche-Sol-Vivant-Punk.HTML'), 'sol-vivant');
  });
});

describe('scanTutosForImport (rapport d’analyse du dossier tutos/)', () => {
  it('propose une fiche nouvelle que l’ancien rapprochement écartait', async () => {
    const db = fakeDb([
      { id: 7, slug: 'associations-plantes', title: 'Associations de plantes', html_content: 'x' },
      { id: 8, slug: 'semences', title: 'Semences', html_content: 'y' },
    ]);
    const report = await withTutosDir(
      {
        'fiche-plantes-punk.html': htmlWithTitle('Choisir ses plantes', 'contenu inédit A'),
        'fiche-semences-locales-punk.html': htmlWithTitle('Semences locales', 'contenu inédit B'),
      },
      (dir) => scanTutosForImport(db, { tutosDir: dir }),
    );
    assert.equal(report.totals.on_disk, 2);
    assert.equal(report.totals.pending, 2);
    assert.equal(report.totals.already_imported, 0);
    assert.equal(report.totals.errors, 0);
    assert.ok(report.items.every((item) => item.status === 'pending'));
  });

  it('reconnaît toujours une fiche déjà en base et dit par quel critère', async () => {
    const db = fakeDb([
      { id: 3, slug: 'compostage', title: 'Compostage', html_content: 'contenu différent' },
    ]);
    const report = await withTutosDir(
      { 'fiche-compost-punk.html': htmlWithTitle('Composter', 'contenu du fichier') },
      (dir) => scanTutosForImport(db, { tutosDir: dir }),
    );
    assert.equal(report.totals.pending, 0);
    assert.equal(report.totals.already_imported, 1);
    assert.equal(report.items[0].status, 'already_imported');
    assert.equal(report.items[0].match_reason, 'filename_stem');
    assert.equal(report.items[0].existing_tutorial_id, 3);
  });

  it('rapproche par empreinte de contenu, quel que soit le nom de fichier', async () => {
    const html = htmlWithTitle('Un titre sans rapport', 'contenu strictement identique');
    const db = fakeDb([{ id: 11, slug: 'autre-chose', title: 'Autre chose', html_content: html }]);
    const report = await withTutosDir({ 'fiche-nouveau-nom.html': html }, (dir) =>
      scanTutosForImport(db, { tutosDir: dir }),
    );
    assert.equal(report.items[0].status, 'already_imported');
    assert.equal(report.items[0].match_reason, 'content');
  });
});
