#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const https = require('node:https');
const TurndownService = require('turndown');
const { writeBufferToDisk } = require('../lib/uploads');

const DEFAULT_CONFIG_PATH = path.join(__dirname, 'gl-import-wp.config.json');
const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), 'tmp', 'gl-wp-import');

const VALID_TARGETS = new Set(['pages', 'chapters', 'brand', 'all']);
const EXT_BY_CONTENT_TYPE = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
  ['image/svg+xml', 'svg'],
  ['image/x-icon', 'ico'],
  ['image/vnd.microsoft.icon', 'ico'],
]);

function normalizeHeadersObject(headers = {}) {
  const out = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const k = String(key || '').toLowerCase();
    if (!k) continue;
    out[k] = String(value ?? '');
  }
  return out;
}

function createHeadersApi(headersObj) {
  return {
    get(name) {
      const key = String(name || '').toLowerCase();
      return headersObj[key] ?? null;
    },
  };
}

function lightweightFetch(urlValue, options = {}, redirectDepth = 0) {
  const MAX_REDIRECTS = 5;
  const method = String(options?.method || 'GET').toUpperCase();
  const reqHeaders = normalizeHeadersObject(options?.headers || {});
  const target = new URL(String(urlValue || ''));
  const lib = target.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(target, { method, headers: reqHeaders }, (res) => {
      const status = Number(res.statusCode || 0);
      const headersObj = normalizeHeadersObject(res.headers || {});
      const chunks = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', async () => {
        try {
          const location = headersObj.location;
          if (location && [301, 302, 303, 307, 308].includes(status)) {
            if (redirectDepth >= MAX_REDIRECTS) {
              reject(new Error(`HTTP redirect loop (${MAX_REDIRECTS})`));
              return;
            }
            const nextUrl = new URL(location, target).toString();
            const nextMethod = status === 303 ? 'GET' : method;
            const nextOptions = { ...options, method: nextMethod };
            const redirected = await lightweightFetch(nextUrl, nextOptions, redirectDepth + 1);
            resolve(redirected);
            return;
          }
          const body = Buffer.concat(chunks);
          resolve({
            ok: status >= 200 && status < 300,
            status,
            headers: createHeadersApi(headersObj),
            async json() {
              const text = body.toString('utf8');
              return JSON.parse(text);
            },
            async text() {
              return body.toString('utf8');
            },
            async arrayBuffer() {
              const array = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
              return array;
            },
          });
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', (err) => reject(err));
    req.end();
  });
}

function parseArgs(argv) {
  const args = {
    configPath: DEFAULT_CONFIG_PATH,
    sourceBaseUrl: '',
    outputDir: DEFAULT_OUTPUT_DIR,
    includePosts: false,
    apply: false,
    dryRun: true,
    target: 'pages',
    skipMedia: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] || '').trim();
    if (token === '--config') args.configPath = String(argv[i + 1] || '').trim() || args.configPath;
    if (token === '--source-base-url') args.sourceBaseUrl = String(argv[i + 1] || '').trim();
    if (token === '--output-dir') args.outputDir = String(argv[i + 1] || '').trim() || args.outputDir;
    if (token === '--include-posts') args.includePosts = true;
    if (token === '--skip-media') args.skipMedia = true;
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
  const excludeSlugsRaw = Array.isArray(parsed?.excludeSlugs) ? parsed.excludeSlugs : [];
  return {
    sourceBaseUrl: String(parsed?.sourceBaseUrl || '').trim(),
    canonicalHost: String(parsed?.canonicalHost || '').trim(),
    excludeSlugs: excludeSlugsRaw.map((value) => normalizeSlug(value)).filter(Boolean),
    brandMap: parsed?.brandMap && typeof parsed.brandMap === 'object' ? parsed.brandMap : {},
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

function normalizeUrlHost(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw.replace(/^https?:\/\//, '').replace(/\/+$/, '');
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

async function fetchWpCollection({ sourceBaseUrl, resource, fetchFn = lightweightFetch }) {
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

function transformWpEntries(rawEntries, { slugMap, sourceType, turndownService, excludeSlugs = [] }) {
  const excluded = new Set((Array.isArray(excludeSlugs) ? excludeSlugs : []).map((value) => normalizeSlug(value)));
  return (Array.isArray(rawEntries) ? rawEntries : [])
    .map((entry) => {
      const wpSlug = normalizeSlug(entry?.slug);
      if (!wpSlug) return null;
      if (excluded.has(wpSlug)) return null;
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
function transformWpEntriesAsChapters(rawEntries, { chapterMap, sourceType, turndownService, excludeSlugs = [] }) {
  const excluded = new Set((Array.isArray(excludeSlugs) ? excludeSlugs : []).map((value) => normalizeSlug(value)));
  return (Array.isArray(rawEntries) ? rawEntries : [])
    .map((entry) => {
      const wpSlug = normalizeSlug(entry?.slug);
      if (!wpSlug) return null;
      if (excluded.has(wpSlug)) return null;
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

function getSourceHosts({ sourceBaseUrl, canonicalHost }) {
  const hosts = new Set();
  try {
    hosts.add(normalizeUrlHost(new URL(sourceBaseUrl).hostname));
  } catch (_) {
    // noop
  }
  if (canonicalHost) hosts.add(normalizeUrlHost(canonicalHost));
  return [...hosts].filter(Boolean);
}

function extractUrlsFromMarkdown(markdown) {
  const source = String(markdown || '');
  const seen = new Set();
  const out = [];
  const regex = /(https?:\/\/[^\s<>"')\]]+)/gi;
  let match = regex.exec(source);
  while (match) {
    const value = String(match[1] || '').replace(/[.,;]+$/, '');
    if (value && !seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
    match = regex.exec(source);
  }
  return out;
}

function isWpMediaUrl(urlValue, sourceHosts = []) {
  try {
    const target = new URL(String(urlValue || ''));
    const host = normalizeUrlHost(target.hostname);
    const hostMatch = sourceHosts.includes(host);
    return hostMatch && target.pathname.toLowerCase().includes('/wp-content/uploads/');
  } catch (_) {
    return false;
  }
}

function extFromUrlOrContentType(urlValue, contentType) {
  const fromType = EXT_BY_CONTENT_TYPE.get(String(contentType || '').split(';')[0].trim().toLowerCase());
  if (fromType) return fromType;
  try {
    const parsed = new URL(String(urlValue || ''));
    const ext = path.extname(parsed.pathname || '').replace('.', '').toLowerCase();
    if (ext) return ext;
  } catch (_) {
    // noop
  }
  return 'bin';
}

async function fetchBinaryBuffer(urlValue, fetchFn = lightweightFetch) {
  const res = await fetchFn(urlValue, {
    headers: {
      Accept: '*/*',
      'User-Agent': 'ForetMap-GL-WP-Import/1.0',
    },
  });
  if (!res.ok) {
    throw new Error(`Media ${urlValue}: HTTP ${res.status}`);
  }
  const contentType = String(res.headers?.get?.('content-type') || '').toLowerCase();
  const arrayBuffer = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), contentType };
}

async function mirrorOneMediaUrl(urlValue, {
  fetchFn = lightweightFetch,
  mediaCache,
  targetDir = 'gl_import/wp',
  apply = false,
}) {
  if (mediaCache.has(urlValue)) return mediaCache.get(urlValue);
  const checksum = crypto.createHash('sha1').update(urlValue).digest('hex').slice(0, 16);
  if (!apply) {
    const previewRelative = `${targetDir}/${checksum}.bin`.replace(/\\/g, '/');
    const previewUrl = `/uploads/${previewRelative}`;
    mediaCache.set(urlValue, previewUrl);
    return previewUrl;
  }
  const { buffer, contentType } = await fetchBinaryBuffer(urlValue, fetchFn);
  const ext = extFromUrlOrContentType(urlValue, contentType);
  const relativePath = `${targetDir}/${checksum}.${ext}`.replace(/\\/g, '/');
  writeBufferToDisk(relativePath, buffer);
  const localUrl = `/uploads/${relativePath}`;
  mediaCache.set(urlValue, localUrl);
  return localUrl;
}

async function mirrorWpMediaInMarkdown(markdown, context = {}) {
  const source = String(markdown || '');
  if (!source) return source;
  const urls = extractUrlsFromMarkdown(source).filter((urlValue) => isWpMediaUrl(urlValue, context.sourceHosts || []));
  if (urls.length === 0) return source;
  let out = source;
  for (const urlValue of urls) {
    const localUrl = await mirrorOneMediaUrl(urlValue, context);
    out = out.split(urlValue).join(localUrl);
  }
  return out;
}

async function mirrorMediaInRecords(records, context = {}, fieldName) {
  const out = [];
  for (const row of records) {
    const value = String(row?.[fieldName] || '');
    const rewritten = await mirrorWpMediaInMarkdown(value, context);
    out.push({ ...row, [fieldName]: rewritten });
  }
  return out;
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

function extractCssVariablesMap(html) {
  const source = String(html || '');
  const out = {};
  const re = /(--wp--preset--(?:color|font-family)--[a-z0-9_-]+)\s*:\s*([^;}{]+);/gi;
  let match = re.exec(source);
  while (match) {
    const key = String(match[1] || '').trim();
    const value = String(match[2] || '').trim();
    if (key && value && !out[key]) out[key] = value;
    match = re.exec(source);
  }
  return out;
}

function resolveRelativeUrl(baseUrl, maybeRelative) {
  const raw = String(maybeRelative || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw, baseUrl).toString();
  } catch (_) {
    return '';
  }
}

function pickFirstLogoUrlFromHtml(html, fallbackBaseUrl) {
  const source = String(html || '');
  const inSiteLogoBlock = source.match(/wp-block-site-logo[\s\S]{0,2500}?<img[^>]+src=["']([^"']+)["']/i);
  if (inSiteLogoBlock?.[1]) return resolveRelativeUrl(fallbackBaseUrl, inSiteLogoBlock[1]);
  const customLogo = source.match(/<img[^>]+class=["'][^"']*custom-logo[^"']*["'][^>]+src=["']([^"']+)["']/i);
  if (customLogo?.[1]) return resolveRelativeUrl(fallbackBaseUrl, customLogo[1]);
  return '';
}

async function fetchWpRootInfo(sourceBaseUrl, fetchFn = lightweightFetch) {
  const endpoint = `${String(sourceBaseUrl).replace(/\/+$/, '')}/wp-json/`;
  const res = await fetchFn(endpoint, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'ForetMap-GL-WP-Import/1.0',
    },
  });
  if (!res.ok) throw new Error(`WP root info: HTTP ${res.status}`);
  return res.json();
}

async function fetchPageHtml(urlValue, fetchFn = lightweightFetch) {
  const res = await fetchFn(urlValue, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'ForetMap-GL-WP-Import/1.0',
    },
  });
  if (!res.ok) {
    throw new Error(`HTML ${urlValue}: HTTP ${res.status}`);
  }
  return res.text();
}

async function fetchMediaBySlug({ sourceBaseUrl, slug, fetchFn = lightweightFetch }) {
  const base = String(sourceBaseUrl || '').replace(/\/+$/, '');
  const endpoint =
    `${base}/wp-json/wp/v2/media`
    + `?slug=${encodeURIComponent(String(slug || '').trim())}&per_page=1&_fields=source_url`;
  const res = await fetchFn(endpoint, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'ForetMap-GL-WP-Import/1.0',
    },
  });
  if (!res.ok) return '';
  const body = await res.json();
  if (!Array.isArray(body) || body.length === 0) return '';
  return String(body[0]?.source_url || '').trim();
}

function normalizeBrandDataFromWp({ wpRootInfo, homepageHtml }) {
  const cssVars = extractCssVariablesMap(homepageHtml);
  const title = String(wpRootInfo?.name || '').trim() || 'Gnomes & Licornes';
  const subtitle = String(wpRootInfo?.description || '').trim();
  const colors = {
    primary: cssVars['--wp--preset--color--primary'] || '#013a40',
    secondary: cssVars['--wp--preset--color--secondary'] || '#f2e8d5',
    tertiary: cssVars['--wp--preset--color--tertiary'] || '#bdbfb4',
    text: cssVars['--wp--preset--color--text-primary'] || '#262626',
    link: cssVars['--wp--preset--color--custom-links'] || '#778c88',
    linkHover: cssVars['--wp--preset--color--custom-links-hover'] || '#2c5959',
    topbar: cssVars['--wp--preset--color--primary'] || '#013a40',
    background: '#f4fff5',
  };
  const fonts = {
    body: String(cssVars['--wp--preset--font-family--caudex'] || 'Caudex'),
    heading: String(cssVars['--wp--preset--font-family--cinzel'] || 'Cinzel'),
    googleFamilies: ['Caudex', 'Cinzel'],
  };
  return { title, subtitle, colors, fonts, logoUrl: '', faviconUrl: null };
}

async function writeBrandDryRun(brand, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, 'brand.json');
  await fs.writeFile(filePath, `${JSON.stringify(brand, null, 2)}\n`, 'utf8');
}

async function applyBrandSettings(brand) {
  const { execute } = require('../database');
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_by, updated_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_by = VALUES(updated_by), updated_at = NOW()`,
    ['platform.title', JSON.stringify(String(brand?.title || 'Gnomes & Licornes')), 'wp-import']
  );
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_by, updated_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_by = VALUES(updated_by), updated_at = NOW()`,
    ['platform.subtitle', JSON.stringify(String(brand?.subtitle || '')), 'wp-import']
  );
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_by, updated_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_by = VALUES(updated_by), updated_at = NOW()`,
    ['platform.brand', JSON.stringify(brand || {}), 'wp-import']
  );
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

async function buildPageRecords({ sourceBaseUrl, args, config, turndownService }) {
  const pageEntries = await fetchWpCollection({ sourceBaseUrl, resource: 'pages', fetchFn: args.fetchFn });
  const postEntries = args.includePosts
    ? await fetchWpCollection({ sourceBaseUrl, resource: 'posts', fetchFn: args.fetchFn })
    : [];
  const records = mergeRecordsBySlug([
    ...transformWpEntries(pageEntries, {
      slugMap: config.slugMap,
      sourceType: 'page',
      turndownService,
      excludeSlugs: config.excludeSlugs,
    }),
    ...transformWpEntries(postEntries, {
      slugMap: config.slugMap,
      sourceType: 'post',
      turndownService,
      excludeSlugs: config.excludeSlugs,
    }),
  ]);
  if (args.skipMedia) return records;
  const sourceHosts = getSourceHosts({ sourceBaseUrl, canonicalHost: config.canonicalHost });
  return mirrorMediaInRecords(records, {
    fetchFn: args.fetchFn,
    mediaCache: args.mediaCache,
    sourceHosts,
    apply: args.apply,
    targetDir: 'gl_import/wp',
  }, 'bodyMarkdown');
}

async function buildChapterRecords({ sourceBaseUrl, args, config, turndownService }) {
  const pageEntries = await fetchWpCollection({ sourceBaseUrl, resource: 'pages', fetchFn: args.fetchFn });
  const postEntries = args.includePosts
    ? await fetchWpCollection({ sourceBaseUrl, resource: 'posts', fetchFn: args.fetchFn })
    : [];
  const records = mergeRecordsBySlug([
    ...transformWpEntriesAsChapters(pageEntries, {
      chapterMap: config.chapterMap,
      sourceType: 'page',
      turndownService,
      excludeSlugs: config.excludeSlugs,
    }),
    ...transformWpEntriesAsChapters(postEntries, {
      chapterMap: config.chapterMap,
      sourceType: 'post',
      turndownService,
      excludeSlugs: config.excludeSlugs,
    }),
  ]);
  if (args.skipMedia) return records;
  const sourceHosts = getSourceHosts({ sourceBaseUrl, canonicalHost: config.canonicalHost });
  return mirrorMediaInRecords(records, {
    fetchFn: args.fetchFn,
    mediaCache: args.mediaCache,
    sourceHosts,
    apply: args.apply,
    targetDir: 'gl_import/wp',
  }, 'storyMarkdown');
}

async function runBrandImport({ sourceBaseUrl, args, config }) {
  const homepageUrl = config.canonicalHost
    ? `https://${normalizeUrlHost(config.canonicalHost)}/`
    : `${String(sourceBaseUrl).replace(/\/+$/, '')}/`;
  const wpRootInfo = await fetchWpRootInfo(sourceBaseUrl, args.fetchFn);
  const homepageHtml = await fetchPageHtml(homepageUrl, args.fetchFn);
  const brand = normalizeBrandDataFromWp({ wpRootInfo, homepageHtml });

  const explicitLogoSlug = String(config?.brandMap?.logoMediaSlug || '').trim();
  const detectedLogoUrl = pickFirstLogoUrlFromHtml(homepageHtml, homepageUrl);
  const fallbackLogoUrl = explicitLogoSlug
    ? await fetchMediaBySlug({ sourceBaseUrl, slug: explicitLogoSlug, fetchFn: args.fetchFn })
    : '';
  const logoSourceUrl = detectedLogoUrl || fallbackLogoUrl;
  if (logoSourceUrl && !args.skipMedia) {
    const mirroredLogo = await mirrorOneMediaUrl(logoSourceUrl, {
      fetchFn: args.fetchFn,
      mediaCache: args.mediaCache,
      targetDir: 'gl_brand',
      apply: args.apply,
    });
    brand.logoUrl = mirroredLogo;
  } else if (logoSourceUrl) {
    brand.logoUrl = logoSourceUrl;
  }

  if (args.dryRun) await writeBrandDryRun(brand, args.outputDir);
  if (args.apply) await applyBrandSettings(brand);
  return { target: 'brand', brand };
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
    fetchFn: options.fetchFn || lightweightFetch,
    skipMedia: Boolean(options.skipMedia),
    mediaCache: new Map(),
  };
  const config = await loadConfig(args.configPath);
  const sourceBaseUrl = args.sourceBaseUrl || config.sourceBaseUrl;
  if (!sourceBaseUrl) throw new Error('sourceBaseUrl manquant (config ou --source-base-url)');

  const turndownService = createMarkdownConverter();

  if (args.target === 'brand') {
    const out = await runBrandImport({ sourceBaseUrl, args, config });
    return {
      sourceBaseUrl,
      target: 'brand',
      recordsCount: out.brand ? 1 : 0,
      records: out.brand ? [out.brand] : [],
      brand: out.brand,
    };
  }

  if (args.target === 'chapters') {
    const records = await buildChapterRecords({ sourceBaseUrl, args, config, turndownService });
    if (args.dryRun) await writeDryRun(records, args.outputDir, 'chapters');
    if (args.apply) await applyChapterRecords(records);
    return { sourceBaseUrl, target: 'chapters', recordsCount: records.length, records };
  }

  if (args.target === 'all') {
    const brandOut = await runBrandImport({ sourceBaseUrl, args, config });
    const pageRecords = await buildPageRecords({ sourceBaseUrl, args, config, turndownService });
    if (args.dryRun) await writeDryRun(pageRecords, args.outputDir, 'pages');
    if (args.apply) await applyRecords(pageRecords);

    const hasChapterMap = Object.keys(config.chapterMap || {}).length > 0;
    let chapterRecords = [];
    if (hasChapterMap) {
      chapterRecords = await buildChapterRecords({ sourceBaseUrl, args, config, turndownService });
      if (args.dryRun) await writeDryRun(chapterRecords, args.outputDir, 'chapters');
      if (args.apply) await applyChapterRecords(chapterRecords);
    }

    return {
      sourceBaseUrl,
      target: 'all',
      recordsCount: pageRecords.length + chapterRecords.length + (brandOut.brand ? 1 : 0),
      records: [...pageRecords, ...chapterRecords],
      breakdown: {
        brand: brandOut.brand ? 1 : 0,
        pages: pageRecords.length,
        chapters: chapterRecords.length,
      },
      brand: brandOut.brand,
    };
  }

  const records = await buildPageRecords({ sourceBaseUrl, args, config, turndownService });
  if (args.dryRun) await writeDryRun(records, args.outputDir, 'pages');
  if (args.apply) await applyRecords(records);
  return { sourceBaseUrl, target: 'pages', recordsCount: records.length, records };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const out = await runImport(args);
  const labelByTarget = {
    pages: 'pages',
    chapters: 'chapitres',
    brand: 'identité visuelle',
    all: 'import complet',
  };
  const label = labelByTarget[out.target] || out.target;
  if (args.dryRun) {
    console.log(`[gl-import-wp] dry-run OK (${label}): ${out.recordsCount} contenus exportés dans ${args.outputDir}`);
  }
  if (args.apply) {
    if (out.target === 'all') {
      const details = out.breakdown || { brand: 0, pages: 0, chapters: 0 };
      console.log(
        `[gl-import-wp] apply OK (${label}): brand=${details.brand}, pages=${details.pages}, chapters=${details.chapters}`
      );
    } else if (out.target === 'brand') {
      console.log('[gl-import-wp] apply OK (identité visuelle): UPSERT platform.title/platform.subtitle/platform.brand');
    } else {
      const table = out.target === 'chapters' ? 'gl_chapters' : 'gl_content_pages';
      console.log(`[gl-import-wp] apply OK (${label}): ${out.recordsCount} contenus UPSERT dans ${table}`);
    }
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
  extractCssVariablesMap,
  normalizeBrandDataFromWp,
  mirrorWpMediaInMarkdown,
  fetchWpCollection,
  transformWpEntries,
  transformWpEntriesAsChapters,
  mergeRecordsBySlug,
  runImport,
};
