'use strict';

// Test pur (sans BDD) : `inlineLegacyTutorialHtmlToDb` avec un faux `db` { queryAll, execute }.
const test = require('node:test');
const assert = require('node:assert');
const {
  inlineLegacyTutorialHtmlToDb,
  isInlinableHtmlSourceFilePath,
} = require('../lib/inlineLegacyTutorialHtml');

/** Fichier HTML réellement présent dans `tutos/` (le module lit le disque). */
const FICHIER_HTML_EXISTANT = '/tutos/fiche-arrosage-punk.html';

/**
 * Émule côté JS les garde-fous du SELECT du module, après avoir vérifié qu'ils y figurent bien.
 * Ainsi le faux `db` reste fidèle à la requête réelle (idempotence, exclusion des liens).
 */
function selectionEmulee(sql, rows) {
  assert.match(sql, /FROM tutorials/i);
  assert.match(sql, /<>\s*'link'/i, 'le SELECT doit exclure les tutoriels de type lien');
  assert.match(sql, /html_content IS NULL/i, 'le SELECT doit ignorer les lignes déjà pourvues');
  assert.doesNotMatch(sql, /type\s*=\s*'html'/i, "le filtre type = 'html' doit avoir disparu");
  return rows.filter(
    (r) =>
      String(r.type || '') !== 'link' &&
      String(r.source_file_path || '').trim() !== '' &&
      String(r.html_content || '').trim() === '',
  );
}

function fauxDb(rows) {
  const updates = [];
  return {
    updates,
    queryAll: async (sql) => selectionEmulee(sql, rows),
    execute: async (sql, params) => {
      updates.push({ sql, params });
      return { affectedRows: 1 };
    },
  };
}

test('isInlinableHtmlSourceFilePath : HTML sous /tutos/ uniquement', () => {
  assert.strictEqual(isInlinableHtmlSourceFilePath('/tutos/fiche.html'), true);
  assert.strictEqual(isInlinableHtmlSourceFilePath('/tutos/fiche.HTM'), true);
  assert.strictEqual(isInlinableHtmlSourceFilePath('/tutos/guide.pdf'), false);
  assert.strictEqual(isInlinableHtmlSourceFilePath('/tutos/photo.png'), false);
  assert.strictEqual(isInlinableHtmlSourceFilePath('/uploads/fiche.html'), false);
  assert.strictEqual(isInlinableHtmlSourceFilePath('/tutos/../secret.html'), false);
  assert.strictEqual(isInlinableHtmlSourceFilePath(''), false);
});

test('un fichier HTML est rapatrié quel que soit le type, sans toucher au type', async () => {
  const db = fauxDb([
    {
      id: 42,
      title: 'Fiche typée autrement',
      type: 'fiche',
      source_file_path: FICHIER_HTML_EXISTANT,
      html_content: null,
    },
  ]);
  const res = await inlineLegacyTutorialHtmlToDb(db);
  assert.deepStrictEqual(res, { applied: 1, skipped: 0, errors: 0 });
  assert.strictEqual(db.updates.length, 1);
  const [{ sql, params }] = db.updates;
  assert.match(sql, /UPDATE tutorials SET html_content = \?, source_file_path = NULL/i);
  assert.doesNotMatch(sql, /\btype\s*=/i, 'le type métier ne doit pas être réécrit');
  assert.ok(String(params[0]).trim().length > 50, 'le HTML du fichier doit être copié');
  assert.strictEqual(params[2], 42);
});

test('un fichier non HTML (PDF) est ignoré et jamais avalé dans html_content', async () => {
  const db = fauxDb([
    {
      id: 7,
      title: 'Guide PDF',
      type: 'pdf',
      source_file_path: '/tutos/guide-jardin.pdf',
      html_content: null,
    },
  ]);
  const res = await inlineLegacyTutorialHtmlToDb(db);
  assert.deepStrictEqual(res, { applied: 0, skipped: 1, errors: 0 });
  assert.strictEqual(db.updates.length, 0);
});

test('idempotence : une ligne déjà pourvue de html_content ou de type lien est hors périmètre', async () => {
  const db = fauxDb([
    {
      id: 1,
      title: 'Déjà en base',
      type: 'html',
      source_file_path: FICHIER_HTML_EXISTANT,
      html_content: '<p>déjà là</p>',
    },
    {
      id: 2,
      title: 'Lien externe',
      type: 'link',
      source_file_path: FICHIER_HTML_EXISTANT,
      html_content: null,
    },
  ]);
  const res = await inlineLegacyTutorialHtmlToDb(db);
  assert.deepStrictEqual(res, { applied: 0, skipped: 0, errors: 0 });
  assert.strictEqual(db.updates.length, 0);
});

test('fichier introuvable : source_file_path conservé, compté en skipped', async () => {
  const db = fauxDb([
    {
      id: 9,
      title: 'Fiche disparue',
      type: 'autre',
      source_file_path: '/tutos/fiche-inexistante-xyz.html',
      html_content: null,
    },
  ]);
  const res = await inlineLegacyTutorialHtmlToDb(db);
  assert.deepStrictEqual(res, { applied: 0, skipped: 1, errors: 0 });
  assert.strictEqual(db.updates.length, 0);
});

test('table absente : compteurs à zéro, aucune exception', async () => {
  const res = await inlineLegacyTutorialHtmlToDb({
    queryAll: async () => {
      throw new Error("Table 'tutorials' doesn't exist");
    },
    execute: async () => {
      throw new Error('ne doit pas être appelé');
    },
  });
  assert.deepStrictEqual(res, { applied: 0, skipped: 0, errors: 0 });
});

test('db invalide : erreur explicite', async () => {
  await assert.rejects(() => inlineLegacyTutorialHtmlToDb({}), /queryAll et execute sont requis/);
});
