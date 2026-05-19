'use strict';

require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const {
  parseArgs,
  mapWpSlugToGlSlug,
  mapWpSlugToChapterMeta,
  createMarkdownConverter,
  htmlToMarkdown,
  fetchWpCollection,
  transformWpEntries,
  transformWpEntriesAsChapters,
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

test('parseArgs accepte --target=chapters', () => {
  const a = parseArgs(['--target=chapters']);
  assert.strictEqual(a.target, 'chapters');
  const b = parseArgs(['--target', 'chapters']);
  assert.strictEqual(b.target, 'chapters');
  const c = parseArgs([]);
  assert.strictEqual(c.target, 'pages');
  const d = parseArgs(['--target=invalid']);
  assert.strictEqual(d.target, 'pages');
});

test('mapWpSlugToChapterMeta retourne meta pour slug mappé, null sinon', () => {
  const map = {
    'chapitre-1-la-foret-magique': {
      slug: 'foret-magique',
      biome: 'forêt tempérée',
      mapImageUrl: '/maps/map-foret.svg',
      orderIndex: 10,
    },
  };
  const meta = mapWpSlugToChapterMeta('chapitre-1-la-foret-magique', map);
  assert.strictEqual(meta.slug, 'foret-magique');
  assert.strictEqual(meta.biome, 'forêt tempérée');
  assert.strictEqual(meta.orderIndex, 10);
  assert.strictEqual(mapWpSlugToChapterMeta('autre-page', map), null);
});

test('transformWpEntriesAsChapters ne retient que les slugs mappés en chapitre', () => {
  const turndown = createMarkdownConverter();
  const rows = transformWpEntriesAsChapters(
    [
      {
        slug: 'chapitre-1-la-foret-magique',
        title: { rendered: 'Chapitre 1 — La forêt magique' },
        content: { rendered: '<p>Histoire du chapitre 1.</p>' },
        modified: '2026-01-01T00:00:00',
      },
      {
        slug: 'page-non-chapitre',
        title: { rendered: 'Autre page' },
        content: { rendered: '<p>Hors champ.</p>' },
        modified: '2026-01-01T00:00:00',
      },
    ],
    {
      chapterMap: {
        'chapitre-1-la-foret-magique': {
          slug: 'foret-magique',
          biome: 'forêt tempérée',
          mapImageUrl: '/maps/map-foret.svg',
          orderIndex: 10,
        },
      },
      sourceType: 'page',
      turndownService: turndown,
    }
  );
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].slug, 'foret-magique');
  assert.strictEqual(rows[0].biome, 'forêt tempérée');
  assert.strictEqual(rows[0].orderIndex, 10);
  assert.ok(String(rows[0].storyMarkdown).includes('Histoire'));
});
