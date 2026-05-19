#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const TurndownService = require('turndown');

const DEFAULT_CONFIG_PATH = path.join(__dirname, 'gl-import-wp.config.json');
const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), 'tmp', 'gl-wp-import');

const VALID_TARGETS = new Set(['pages', 'chapters']);

function parseArgs(argv) {
  const args = {
    configPath: DEFAULT_CONFIG_PATH,
    sourceBaseUrl: '',
    outputDir: DEFAULT_OUTPUT_DIR,
    includePosts: false,
    apply: false,
    dryRun: true,
    target: 'pages',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] || '').trim();
    if (token === '--config') args.configPath = String(argv[i + 1] || '').trim() || args.configPath;
    if (token === '--source-base-url') args.sourceBaseUrl = String(argv[i + 1] || '').trim();
    if (token === '--output-dir') args.outputDir = String(argv[i + 1] || '').trim() || args.outputDir;
    if (token === '--include-posts') args.includePosts = true;
    if (token === '--apply') {
      args.apply = true;
      args.dryRun = false;
    }
    if (token === '--dry-run') args.dryRun = true;
    if (token.startsWith('--target=')) {
      const raw = token.slice('--target='.length).trim().toLowerCase();
      if (VALID_TARGETS.has(raw)) args.target = raw;
    } else if (token === '--target') {
      const raw = String(argv[i + 1] || '').trim().toLowerCase();
      if (VALID_TARGETS.has(raw)) args.target = raw;
    }
  }
  return args;
}

async function loadConfig(configPath) {
  const raw = await fs.readFile(configPath, 'utf8');
  const parsed = JSON.parse(raw);
  return {
    sourceBaseUrl: String(parsed?.sourceBaseUrl || '').trim(),
    slugMap: parsed?.slugMap && typeof parsed.slugMap === 'object' ? parsed.slugMap : {},
    chapterMap: parsed?.chapterMap && typeof parsed.chapterMap === 'object' ? parsed.chapterMap : {},
  };
}

function normalizeSlug(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeRenderedText(value) {
  const html = String(value || '');
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function createMarkdownConverter() {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });
  turndown.remove(['script', 'style']);
  return turndown;
}

function htmlToMarkdown(html, turndownService) {
  const source = String(html || '').trim();
  if (!source) return '';
  try {
    return String(turndownService.turndown(source) || '').trim();
  } catch (_) {
    return source;
  }
}

function mapWpSlugToGlSlug(wpSlug, slugMap) {
  const normalized = normalizeSlug(wpSlug);
  const explicit = normalizeSlug(slugMap?.[normalized] || '');
  return explicit || normalized;
}

function mapWpSlugToChapterMeta(wpSlug, chapterMap) {
  const normalized = normalizeSlug(wpSlug);
  const meta = chapterMap?.[normalized];
  if (!meta) return null;
  return {
    slug: normalizeSlug(meta.slug || normalized),
    biome: meta.biome ?? null,
    mapImageUrl: meta.mapImageUrl ?? null,
    orderIndex: Number.isFinite(Number(meta.orderIndex)) ? Number(meta.orderIndex) : 0,
  };
}

async function fetchWpCollection({ sourceBaseUrl, resource, fetchFn = fetch }) {
  const entries = [];
  const normalizedBase = String(sourceBaseUrl || '').replace(/\/+$/, '');
  if (!normalizedBase) throw new Error('sourceBaseUrl requis');
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const url =
      `${normalizedBase}/wp-json/wp/v2/${resource}`
      + `?per_page=100&page=${page}&_fields=slug,title,content,modified`;
    const res = await fetchFn(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'ForetMap-GL-WP-Import/1.0',
      },
    });
    if (!res.ok) {
      throw new Error(`WP ${resource} page=${page}: HTTP ${res.status}`);
    }
    const body = await res.json();
    if (Array.isArray(body)) entries.push(...body);
    const headerPages = Number(res.headers?.get?.('x-wp-totalpages') || 1);
    totalPages = Number.isFinite(headerPages) && headerPages > 0 ? headerPages : totalPages;
    page += 1;
  }
  return entries;
}

function transformWpEntries(rawEntries, { slugMap, sourceType, turndownService }) {
  return (Array.isArray(rawEntries) ? rawEntries : [])
    .map((entry) => {
      const wpSlug = normalizeSlug(entry?.slug);
      if (!wpSlug) return null;
      const slug = mapWpSlugToGlSlug(wpSlug, slugMap);
      const title = normalizeRenderedText(entry?.title?.rendered || wpSlug || slug);
      const bodyMarkdown = htmlToMarkdown(entry?.content?.rendered || '', turndownService);
      return {
        slug,
        title: title || slug,
        bodyMarkdown,
        sourceType,
        sourceSlug: wpSlug,
        sourceModifiedAt: entry?.modified || null,
      };
    })
    .filter(Boolean);
}

/**
 * Convertit les entrées WP vers le schéma `gl_chapters`. Seules les entrées
 * dont le slug WP est référencé dans `chapterMap` sont retenues.
 */
function transformWpEntriesAsChapters(rawEntries, { chapterMap, sourceType, turndownService }) {
  return (Array.isArray(rawEntries) ? rawEntries : [])
    .map((entry) => {
      const wpSlug = normalizeSlug(entry?.slug);
      if (!wpSlug) return null;
      const meta = mapWpSlugToChapterMeta(wpSlug, chapterMap);
      if (!meta) return null;
      const title = normalizeRenderedText(entry?.title?.rendered || wpSlug || meta.slug);
      const storyMarkdown = htmlToMarkdown(entry?.content?.rendered || '', turndownService);
      return {
        slug: meta.slug,
        title: title || meta.slug,
        biome: meta.biome,
        mapImageUrl: meta.mapImageUrl,
        orderIndex: meta.orderIndex,
        storyMarkdown,
        biotopeMarkdown: '',
        biocenoseMarkdown: '',
        sourceType,
        sourceSlug: wpSlug,
        sourceModifiedAt: entry?.modified || null,
      };
    })
    .filter(Boolean);
}

function mergeRecordsBySlug(records) {
  const out = new Map();
  for (const record of records) {
    out.set(record.slug, record);
  }
  return [...out.values()].sort((a, b) => a.slug.localeCompare(b.slug, 'fr'));
}

async function writeDryRun(records, outputDir, label = 'pages') {
  await fs.mkdir(outputDir, { recursive: true });
  for (const row of records) {
    const filePath = path.join(outputDir, `${label === 'chapters' ? 'chapter-' : ''}${row.slug}.md`);
    const body =
      `# ${row.title}\n\n`
      + `<!-- source: ${row.sourceType}:${row.sourceSlug} | modified: ${row.sourceModifiedAt || 'unknown'} -->\n\n`
      + `${row.bodyMarkdown || row.storyMarkdown || '_Aucun contenu converti._'}\n`;
    await fs.writeFile(filePath, body, 'utf8');
  }
}

async function applyRecords(records) {
  const { execute } = require('../database');
  for (const row of records) {
    await execute(
      `INSERT INTO gl_content_pages (slug, title, body_markdown, updated_by, updated_at)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         title = VALUES(title),
         body_markdown = VALUES(body_markdown),
         updated_by = VALUES(updated_by),
         updated_at = NOW()`,
      [row.slug, row.title, row.bodyMarkdown || '', 'wp-import']
    );
  }
}

async function applyChapterRecords(records) {
  const { execute } = require('../database');
  for (const row of records) {
    await execute(
      `INSERT INTO gl_chapters (slug, title, biome, map_image_url, story_markdown,
                                 biotope_markdown, biocenose_markdown, order_index,
                                 created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         title = VALUES(title),
         biome = VALUES(biome),
         map_image_url = VALUES(map_image_url),
         story_markdown = VALUES(story_markdown),
         order_index = VALUES(order_index),
         updated_at = NOW()`,
      [
        row.slug,
        row.title,
        row.biome,
        row.mapImageUrl,
        row.storyMarkdown || '',
        row.biotopeMarkdown || '',
        row.biocenoseMarkdown || '',
        row.orderIndex,
      ]
    );
  }
}

async function runImport(options = {}) {
  const args = {
    configPath: options.configPath || DEFAULT_CONFIG_PATH,
    sourceBaseUrl: options.sourceBaseUrl || '',
    outputDir: options.outputDir || DEFAULT_OUTPUT_DIR,
    includePosts: Boolean(options.includePosts),
    apply: Boolean(options.apply),
    dryRun: options.dryRun !== false,
    target: VALID_TARGETS.has(String(options.target || '').toLowerCase())
      ? String(options.target).toLowerCase()
      : 'pages',
    fetchFn: options.fetchFn || fetch,
  };
  const config = await loadConfig(args.configPath);
  const sourceBaseUrl = args.sourceBaseUrl || config.sourceBaseUrl;
  if (!sourceBaseUrl) throw new Error('sourceBaseUrl manquant (config ou --source-base-url)');

  const turndownService = createMarkdownConverter();

  if (args.target === 'chapters') {
    const pageEntries = await fetchWpCollection({ sourceBaseUrl, resource: 'pages', fetchFn: args.fetchFn });
    const postEntries = args.includePosts
      ? await fetchWpCollection({ sourceBaseUrl, resource: 'posts', fetchFn: args.fetchFn })
      : [];
    const records = mergeRecordsBySlug([
      ...transformWpEntriesAsChapters(pageEntries, { chapterMap: config.chapterMap, sourceType: 'page', turndownService }),
      ...transformWpEntriesAsChapters(postEntries, { chapterMap: config.chapterMap, sourceType: 'post', turndownService }),
    ]);
    if (args.dryRun) await writeDryRun(records, args.outputDir, 'chapters');
    if (args.apply) await applyChapterRecords(records);
    return { sourceBaseUrl, target: 'chapters', recordsCount: records.length, records };
  }

  const pageEntries = await fetchWpCollection({ sourceBaseUrl, resource: 'pages', fetchFn: args.fetchFn });
  const postEntries = args.includePosts
    ? await fetchWpCollection({ sourceBaseUrl, resource: 'posts', fetchFn: args.fetchFn })
    : [];
  const records = mergeRecordsBySlug([
    ...transformWpEntries(pageEntries, { slugMap: config.slugMap, sourceType: 'page', turndownService }),
    ...transformWpEntries(postEntries, { slugMap: config.slugMap, sourceType: 'post', turndownService }),
  ]);
  if (args.dryRun) await writeDryRun(records, args.outputDir, 'pages');
  if (args.apply) await applyRecords(records);
  return { sourceBaseUrl, target: 'pages', recordsCount: records.length, records };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const out = await runImport(args);
  const label = out.target === 'chapters' ? 'chapitres' : 'pages';
  if (args.dryRun) {
    console.log(`[gl-import-wp] dry-run OK (${label}): ${out.recordsCount} contenus exportés dans ${args.outputDir}`);
  }
  if (args.apply) {
    const table = out.target === 'chapters' ? 'gl_chapters' : 'gl_content_pages';
    console.log(`[gl-import-wp] apply OK (${label}): ${out.recordsCount} contenus UPSERT dans ${table}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[gl-import-wp] erreur:', err.message || err);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  loadConfig,
  normalizeSlug,
  mapWpSlugToGlSlug,
  mapWpSlugToChapterMeta,
  createMarkdownConverter,
  htmlToMarkdown,
  fetchWpCollection,
  transformWpEntries,
  transformWpEntriesAsChapters,
  mergeRecordsBySlug,
  runImport,
};
