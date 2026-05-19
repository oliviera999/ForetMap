'use strict';

require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const {
  parseArgs,
  mapWpSlugToGlSlug,
  createMarkdownConverter,
  htmlToMarkdown,
  fetchWpCollection,
  transformWpEntries,
  mergeRecordsBySlug,
} = require('../scripts/gl-import-wp');

test('parseArgs active dry-run par defaut et --apply desactive dry-run', () => {
  const parsedDefault = parseArgs([]);
  assert.strictEqual(parsedDefault.dryRun, true);
  assert.strictEqual(parsedDefault.apply, false);
  assert.ok(String(parsedDefault.outputDir).includes(path.join('tmp', 'gl-wp-import')));

  const parsedApply = parseArgs(['--apply', '--source-base-url', 'https://gl.olution.info']);
  assert.strictEqual(parsedApply.apply, true);
  assert.strictEqual(parsedApply.dryRun, false);
  assert.strictEqual(parsedApply.sourceBaseUrl, 'https://gl.olution.info');
});

test('mapWpSlugToGlSlug applique le mapping explicite', () => {
  const slug = mapWpSlugToGlSlug('le-monde-de-gnomes-et-licornes', {
    'le-monde-de-gnomes-et-licornes': 'world',
  });
  assert.strictEqual(slug, 'world');
  assert.strictEqual(mapWpSlugToGlSlug('chapitre-1', {}), 'chapitre-1');
});

test('fetchWpCollection gere la pagination WP', async () => {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    const isPage1 = String(url).includes('page=1');
    return {
      ok: true,
      status: 200,
      headers: {
        get(name) {
          if (String(name).toLowerCase() === 'x-wp-totalpages') return '2';
          return null;
        },
      },
      async json() {
        if (isPage1) return [{ slug: 'page-1' }];
        return [{ slug: 'page-2' }];
      },
    };
  };
  const out = await fetchWpCollection({
    sourceBaseUrl: 'https://gl.olution.info',
    resource: 'pages',
    fetchFn,
  });
  assert.strictEqual(out.length, 2);
  assert.ok(calls.length >= 2);
});

test('transformWpEntries convertit HTML en markdown puis dedupe par slug', () => {
  const turndown = createMarkdownConverter();
  const rows = transformWpEntries(
    [
      {
        slug: 'regles-du-jeu',
        title: { rendered: 'Regles' },
        content: { rendered: '<h2>Test</h2><p>Paragraphe <strong>important</strong>.</p>' },
        modified: '2026-01-01T00:00:00',
      },
      {
        slug: 'regles-du-jeu',
        title: { rendered: 'Regles V2' },
        content: { rendered: '<p>Version 2</p>' },
        modified: '2026-01-02T00:00:00',
      },
    ],
    {
      slugMap: { 'regles-du-jeu': 'rules' },
      sourceType: 'page',
      turndownService: turndown,
    }
  );
  const merged = mergeRecordsBySlug(rows);
  assert.strictEqual(merged.length, 1);
  assert.strictEqual(merged[0].slug, 'rules');
  assert.ok(String(merged[0].bodyMarkdown).includes('Version 2'));

  const md = htmlToMarkdown('<h1>Titre</h1><p>Texte.</p>', turndown);
  assert.ok(md.includes('# Titre'));
});
