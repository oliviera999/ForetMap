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
  extractCssVariablesMap,
  normalizeBrandDataFromWp,
  extractLayoutSlotsFromHomepageHtml,
  buildMediaFetchCandidates,
  isLikelyImageBuffer,
  fetchBinaryBufferForMedia,
  preprocessWpHtmlForMarkdown,
  mirrorWpMediaInMarkdown,
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

  const parsedApply = parseArgs(['--apply', '--source-base-url', 'https://yo.olution.info']);
  assert.strictEqual(parsedApply.apply, true);
  assert.strictEqual(parsedApply.dryRun, false);
  assert.strictEqual(parsedApply.sourceBaseUrl, 'https://yo.olution.info');
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
    sourceBaseUrl: 'https://yo.olution.info',
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
    },
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

test('parseArgs accepte --target=brand/--target=all et --skip-media', () => {
  const a = parseArgs(['--target=brand']);
  assert.strictEqual(a.target, 'brand');
  const b = parseArgs(['--target', 'all', '--skip-media']);
  assert.strictEqual(b.target, 'all');
  assert.strictEqual(b.skipMedia, true);
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
    },
  );
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].slug, 'foret-magique');
  assert.strictEqual(rows[0].biome, 'forêt tempérée');
  assert.strictEqual(rows[0].orderIndex, 10);
  assert.ok(String(rows[0].storyMarkdown).includes('Histoire'));
});

test('extractCssVariablesMap et normalizeBrandDataFromWp lisent les presets Kadence', () => {
  const html = `
    <style>
      :root{
        --wp--preset--color--primary:#013a40;
        --wp--preset--color--secondary:#f2e8d5;
        --wp--preset--color--text-primary:#262626;
        --wp--preset--color--custom-links:#778c88;
        --wp--preset--color--custom-links-hover:#2c5959;
        --wp--preset--font-family--caudex:Caudex, serif;
        --wp--preset--font-family--cinzel:Cinzel, serif;
      }
    </style>
  `;
  const cssVars = extractCssVariablesMap(html);
  assert.strictEqual(cssVars['--wp--preset--color--primary'], '#013a40');

  const brand = normalizeBrandDataFromWp({
    wpRootInfo: { name: 'Gnomes & Licornes', description: 'Le jeu de ST' },
    homepageHtml: html,
  });
  assert.strictEqual(brand.title, 'Gnomes & Licornes');
  assert.strictEqual(brand.subtitle, 'Le jeu de ST');
  assert.strictEqual(brand.colors.primary, '#013a40');
  assert.ok(Array.isArray(brand.fonts.googleFamilies));
});

test('extractLayoutSlotsFromHomepageHtml extrait hero et cartes yo', () => {
  const html = `
    <div class="wp-block-cover hero-image"><h1>Gnomes &amp; Licornes L&rsquo;aventure commence ici !</h1>
      <img src="https://www.gl.olution.info/wp-content/uploads/2025/06/hero.png" /></div>
    <div class="wp-block-column"><p>Découvrir… Un monde</p>
      <img src="https://www.gl.olution.info/wp-content/uploads/2025/06/world.png" /></div>
    <div class="wp-block-column"><p>Les règles du jeu</p>
      <img src="https://www.gl.olution.info/wp-content/uploads/2025/06/rules.png" /></div>
    <div class="wp-block-column"><p>Les sortilèges</p>
      <img src="https://www.gl.olution.info/wp-content/uploads/2025/06/spells.png" /></div>
  `;
  const slots = extractLayoutSlotsFromHomepageHtml(html, 'https://www.yo.olution.info/');
  assert.ok(slots.hero.imageUrl.includes('hero.png'));
  assert.ok(slots.hero.title.includes('Gnomes'));
  assert.ok(slots.card_world.imageUrl.includes('world.png'));
  assert.ok(slots.card_rules.imageUrl.includes('rules.png'));
  assert.ok(slots.card_spells.imageUrl.includes('spells.png'));
});

test('preprocessWpHtmlForMarkdown expose data-src en src', () => {
  const turndown = createMarkdownConverter();
  const md = htmlToMarkdown('<img data-src="/wp-content/uploads/x.png" alt="x" />', turndown);
  assert.ok(md.includes('](/wp-content/uploads/x.png)'));
});

test('buildMediaFetchCandidates retente yo.olution.info pour gl.olution.info', () => {
  const candidates = buildMediaFetchCandidates(
    'https://www.gl.olution.info/wp-content/uploads/2025/06/world.png',
    {
      sourceBaseUrl: 'https://yo.olution.info',
      canonicalHost: 'www.yo.olution.info',
    },
  );
  assert.ok(
    candidates.includes('https://www.gl.olution.info/wp-content/uploads/2025/06/world.png'),
  );
  assert.ok(candidates.some((url) => /yo\.olution\.info/.test(url)));
});

test('fetchBinaryBufferForMedia refuse le HTML renvoyé par gl.olution.info', async () => {
  const html = Buffer.from('<!doctype html><html></html>', 'utf8');
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const fetchFn = async (url) => {
    if (String(url).includes('gl.olution.info')) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'text/html; charset=UTF-8' },
        async arrayBuffer() {
          return html;
        },
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'image/png' },
      async arrayBuffer() {
        return pngHeader;
      },
    };
  };
  const out = await fetchBinaryBufferForMedia(
    'https://www.gl.olution.info/wp-content/uploads/2025/06/world.png',
    fetchFn,
    { sourceBaseUrl: 'https://yo.olution.info', canonicalHost: 'www.yo.olution.info' },
  );
  assert.ok(out.fetchUrl.includes('yo.olution.info'));
  assert.ok(isLikelyImageBuffer(out.buffer, out.contentType));
});

test('mirrorWpMediaInMarkdown remplace les URLs médias WP', async () => {
  const source = 'Visuel: https://www.yo.olution.info/wp-content/uploads/2026/01/hero.png';
  const cache = new Map();
  const out = await mirrorWpMediaInMarkdown(source, {
    sourceHosts: ['yo.olution.info', 'www.yo.olution.info'],
    mediaCache: cache,
    apply: false,
    targetDir: 'gl_import/wp',
  });
  assert.ok(out.includes('/uploads/gl_import/wp/'));
  assert.strictEqual(cache.size, 1);
});
