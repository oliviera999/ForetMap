'use strict';

// Noyau partagé de lecture des documents de référence
// (`lib/shared/referenceDocsFiles.js`) et lecteur ForetMap en lecture seule
// (`lib/foretmapReferenceDocs.js`). Aucune base de données requise.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  isValidReferenceSlug,
  extractMarkdownTitle,
  extractMarkdownSummary,
  createReferenceDocsFileReader,
} = require('../lib/shared/referenceDocsFiles');

const foretmapDocs = require('../lib/foretmapReferenceDocs');

function makeDocsDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-refdocs-'));
  for (const [name, contents] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), contents, 'utf8');
  }
  return dir;
}

test('isValidReferenceSlug — accepte le kebab-case, rejette la traversée de chemin', () => {
  assert.equal(isValidReferenceSlug('carte-et-zones'), true);
  assert.equal(isValidReferenceSlug('presentation'), true);
  for (const bogus of [
    '',
    '../secret',
    'a/b',
    'Majuscule',
    'accentué',
    '-lead',
    'trail-',
    'a--b',
  ]) {
    assert.equal(isValidReferenceSlug(bogus), false, `devrait rejeter : ${bogus}`);
  }
  assert.equal(isValidReferenceSlug('a'.repeat(81)), false);
});

test('extractMarkdownTitle — premier titre de niveau 1, sinon le repli', () => {
  assert.equal(extractMarkdownTitle('# Mon titre\n\ntexte'), 'Mon titre');
  assert.equal(extractMarkdownTitle('## Sous-titre\n# Vrai titre'), 'Vrai titre');
  assert.equal(extractMarkdownTitle('aucun titre', 'repli'), 'repli');
});

test('extractMarkdownSummary — ignore titres, citations, tableaux et code', () => {
  const md = [
    '# Titre',
    '',
    '> Note d’orientation',
    '',
    '---',
    '| a | b |',
    '```js',
    '',
    'Le **premier** paragraphe utile avec un [lien](http://x) et une ![image](y).',
  ].join('\n');
  assert.equal(extractMarkdownSummary(md), 'Le premier paragraphe utile avec un lien et une .');
});

test('extractMarkdownSummary — tronque au-delà de la longueur maximale', () => {
  const long = 'a'.repeat(400);
  const summary = extractMarkdownSummary(`# T\n\n${long}`);
  assert.equal(summary.length, 200);
  assert.ok(summary.endsWith('…'));
});

test('listReferenceDocFileSlugs — respecte le sommaire puis l’alphabétique', () => {
  const dir = makeDocsDir({
    'zebre.md': '# Z',
    'presentation.md': '# P',
    'alpha.md': '# A',
    'carte-et-zones.md': '# C',
    'notes.txt': 'ignoré',
  });
  const reader = createReferenceDocsFileReader({
    docsDir: dir,
    readingOrder: ['presentation', 'carte-et-zones'],
  });
  assert.deepEqual(reader.listReferenceDocFileSlugs(), [
    'presentation',
    'carte-et-zones',
    'alpha',
    'zebre',
  ]);
});

test('listReferenceDocFileSlugs — répertoire absent : tableau vide, pas d’exception', () => {
  const reader = createReferenceDocsFileReader({
    docsDir: path.join(os.tmpdir(), 'fm-refdocs-inexistant'),
  });
  assert.deepEqual(reader.listReferenceDocFileSlugs(), []);
});

test('readReferenceDocFile — renvoie corps, titre et date ; null si absent', () => {
  const dir = makeDocsDir({ 'presentation.md': '# Présentation\n\nCorps.' });
  const reader = createReferenceDocsFileReader({ docsDir: dir });

  const doc = reader.readReferenceDocFile('presentation');
  assert.equal(doc.slug, 'presentation');
  assert.equal(doc.title, 'Présentation');
  assert.match(doc.bodyMarkdown, /Corps\./);
  assert.ok(Date.parse(doc.updatedAt) > 0);

  assert.equal(reader.readReferenceDocFile('absent'), null);
});

test('readReferenceDocFile — un slug invalide ne lit aucun fichier', () => {
  const dir = makeDocsDir({ 'presentation.md': '# P' });
  const reader = createReferenceDocsFileReader({ docsDir: dir });
  assert.equal(reader.readReferenceDocFile('../presentation'), null);
  assert.equal(reader.readReferenceDocFile('a/b'), null);
});

test('ForetMap — le sommaire expose les documents réellement versionnés', () => {
  const docs = foretmapDocs.listReferenceDocs();
  assert.ok(docs.length >= 8, `attendu au moins 8 documents, obtenu ${docs.length}`);

  const slugs = docs.map((d) => d.slug);
  assert.equal(slugs[0], 'presentation', 'la présentation ouvre le sommaire');
  for (const expected of ['carte-et-zones', 'visite-et-mascottes', 'stats-forum-et-suivi']) {
    assert.ok(slugs.includes(expected), `document manquant : ${expected}`);
  }

  for (const doc of docs) {
    assert.ok(doc.title.length > 0, `titre vide pour ${doc.slug}`);
    assert.equal(typeof doc.summary, 'string');
    // Le sommaire ne transporte pas le corps : il reste léger.
    assert.equal(doc.bodyMarkdown, undefined);
  }
});

test('ForetMap — l’ordre de lecture suit le sommaire de docs/reference/README.md', () => {
  const slugs = foretmapDocs.listReferenceDocs().map((d) => d.slug);
  const ordered = foretmapDocs.READING_ORDER.filter((slug) => slugs.includes(slug));
  assert.deepEqual(slugs.slice(0, ordered.length), ordered);
});

test('ForetMap — getReferenceDoc renvoie le corps, et null sur slug invalide', () => {
  const doc = foretmapDocs.getReferenceDoc('presentation');
  assert.ok(doc, 'presentation.md doit exister');
  assert.ok(doc.bodyMarkdown.length > 0);

  assert.equal(foretmapDocs.getReferenceDoc('../../package'), null);
  assert.equal(foretmapDocs.getReferenceDoc('inexistant'), null);
});
