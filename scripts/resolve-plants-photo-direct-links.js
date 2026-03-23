#!/usr/bin/env node
/**
 * Remplace les liens photo non directs du catalogue biodiversite
 * par des URLs image directes (principalement via Wikimedia).
 *
 * Usage:
 *   node scripts/resolve-plants-photo-direct-links.js
 *   node scripts/resolve-plants-photo-direct-links.js --write
 *   node scripts/resolve-plants-photo-direct-links.js --write --limit=20
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { queryAll, execute } = require('../database');

const PHOTO_FIELDS = [
  'photo',
  'photo_species',
  'photo_leaf',
  'photo_flower',
  'photo_fruit',
  'photo_harvest_part',
];

const IMAGE_EXT_RE = /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i;

function parseFlags(argv) {
  const write = argv.includes('--write');
  const limitArg = argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : null;
  return {
    write,
    limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null,
  };
}

function splitCandidates(value) {
  const raw = (value || '').trim();
  if (!raw) return [];
  return raw
    .split(/\n|,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isDirectImageUrl(value) {
  if (!isHttpsUrl(value)) return false;
  try {
    const url = new URL(value);
    const path = url.pathname || '';
    if (/\/wiki\/Special:FilePath\//i.test(path)) return true;
    return IMAGE_EXT_RE.test(path);
  } catch {
    return false;
  }
}

function toCsvLinks(links) {
  return links.join(', ');
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'ForetMap/1.0 (photo-link-resolver)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function parseCommonsCategoryTitle(value) {
  if (!isHttpsUrl(value)) return null;
  try {
    const url = new URL(value);
    if (!/^(?:www\.)?commons\.wikimedia\.org$/i.test(url.hostname)) return null;
    const m = url.pathname.match(/^\/wiki\/(Category:.+)$/i);
    if (!m) return null;
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

async function resolveFromCommonsCategory(categoryTitle, cache) {
  if (!categoryTitle) return null;
  if (cache.has(categoryTitle)) return cache.get(categoryTitle);

  try {
    const endpoint = new URL('https://commons.wikimedia.org/w/api.php');
    endpoint.searchParams.set('action', 'query');
    endpoint.searchParams.set('format', 'json');
    endpoint.searchParams.set('origin', '*');
    endpoint.searchParams.set('generator', 'categorymembers');
    endpoint.searchParams.set('gcmtype', 'file');
    endpoint.searchParams.set('gcmtitle', categoryTitle);
    endpoint.searchParams.set('gcmlimit', '5');
    endpoint.searchParams.set('prop', 'imageinfo');
    endpoint.searchParams.set('iiprop', 'url');
    const data = await fetchJson(endpoint.toString());
    const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
    for (const page of pages) {
      const info = page?.imageinfo?.[0];
      const direct = info?.url || info?.thumburl || null;
      if (direct && isDirectImageUrl(direct)) {
        cache.set(categoryTitle, direct);
        return direct;
      }
    }
  } catch {
    // Ignore and return null below.
  }

  cache.set(categoryTitle, null);
  return null;
}

function parseWikiTitle(urlValue) {
  if (!isHttpsUrl(urlValue)) return null;
  try {
    const url = new URL(urlValue);
    const m = url.pathname.match(/^\/wiki\/(.+)$/i);
    if (!m) return null;
    const title = decodeURIComponent(m[1]);
    if (!title || /^Category:/i.test(title) || /^Special:/i.test(title)) return null;
    return { origin: `${url.protocol}//${url.hostname}`, title };
  } catch {
    return null;
  }
}

async function resolveFromWikiPage(urlValue, pageCache) {
  if (pageCache.has(urlValue)) return pageCache.get(urlValue);
  const titleInfo = parseWikiTitle(urlValue);
  if (!titleInfo) {
    pageCache.set(urlValue, null);
    return null;
  }

  try {
    const endpoint = new URL('/w/api.php', titleInfo.origin);
    endpoint.searchParams.set('action', 'query');
    endpoint.searchParams.set('format', 'json');
    endpoint.searchParams.set('origin', '*');
    endpoint.searchParams.set('prop', 'pageimages');
    endpoint.searchParams.set('piprop', 'original');
    endpoint.searchParams.set('titles', titleInfo.title);
    const data = await fetchJson(endpoint.toString());
    const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
    const page = pages[0] || null;
    const direct = page?.original?.source || null;
    if (direct && isDirectImageUrl(direct)) {
      pageCache.set(urlValue, direct);
      return direct;
    }
  } catch {
    // Ignore and return null below.
  }

  pageCache.set(urlValue, null);
  return null;
}

function buildSearchQueries(plant, fieldName) {
  const baseNames = [
    (plant.scientific_name || '').trim(),
    (plant.name || '').trim(),
  ].filter(Boolean);

  const fieldHints = {
    photo: [''],
    photo_species: [''],
    photo_leaf: ['leaf', 'leaves'],
    photo_flower: ['flower'],
    photo_fruit: ['fruit'],
    photo_harvest_part: [((plant.harvest_part || '').split(',')[0] || '').trim(), 'harvest'],
  };

  const hints = (fieldHints[fieldName] || ['']).filter(Boolean);
  const queries = [];
  for (const base of baseNames) {
    if (hints.length === 0) {
      queries.push(base);
      continue;
    }
    for (const hint of hints) queries.push(`${base} ${hint}`.trim());
    queries.push(base);
  }
  return Array.from(new Set(queries));
}

async function resolveFromCommonsSearch(plant, fieldName, searchCache) {
  const queries = buildSearchQueries(plant, fieldName);
  for (const q of queries) {
    const key = `${fieldName}::${q}`;
    if (searchCache.has(key)) {
      const cached = searchCache.get(key);
      if (cached) return cached;
      continue;
    }
    try {
      const endpoint = new URL('https://commons.wikimedia.org/w/api.php');
      endpoint.searchParams.set('action', 'query');
      endpoint.searchParams.set('format', 'json');
      endpoint.searchParams.set('origin', '*');
      endpoint.searchParams.set('generator', 'search');
      endpoint.searchParams.set('gsrnamespace', '6');
      endpoint.searchParams.set('gsrsearch', `${q} filetype:bitmap`);
      endpoint.searchParams.set('gsrlimit', '5');
      endpoint.searchParams.set('prop', 'imageinfo');
      endpoint.searchParams.set('iiprop', 'url');
      const data = await fetchJson(endpoint.toString());
      const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
      let winner = null;
      for (const page of pages) {
        const info = page?.imageinfo?.[0];
        const direct = info?.url || info?.thumburl || null;
        if (direct && isDirectImageUrl(direct)) {
          winner = direct;
          break;
        }
      }
      searchCache.set(key, winner);
      if (winner) return winner;
    } catch {
      searchCache.set(key, null);
    }
  }
  return null;
}

async function resolveOneLink(link, plant, fieldName, caches) {
  if (isDirectImageUrl(link)) return link;

  const categoryTitle = parseCommonsCategoryTitle(link);
  if (categoryTitle) {
    const fromCategory = await resolveFromCommonsCategory(categoryTitle, caches.category);
    if (fromCategory) return fromCategory;
  }

  const fromPage = await resolveFromWikiPage(link, caches.page);
  if (fromPage) return fromPage;

  return resolveFromCommonsSearch(plant, fieldName, caches.search);
}

async function main() {
  const { write, limit } = parseFlags(process.argv.slice(2));
  const rows = await queryAll(
    `SELECT id, name, scientific_name, harvest_part, photo, photo_species, photo_leaf, photo_flower, photo_fruit, photo_harvest_part
     FROM plants
     ORDER BY id`
  );

  const selectedRows = limit ? rows.slice(0, limit) : rows;
  const caches = {
    category: new Map(),
    page: new Map(),
    search: new Map(),
  };

  const stats = {
    plants: selectedRows.length,
    fieldsUpdated: 0,
    linksScanned: 0,
    linksAlreadyDirect: 0,
    linksReplaced: 0,
    linksUnresolved: 0,
  };

  const preview = [];

  for (const plant of selectedRows) {
    for (const fieldName of PHOTO_FIELDS) {
      const current = (plant[fieldName] || '').trim();
      if (!current) continue;

      const candidates = splitCandidates(current);
      if (candidates.length === 0) continue;

      const nextLinks = [];
      let hasChange = false;

      for (const link of candidates) {
        stats.linksScanned += 1;
        if (isDirectImageUrl(link)) {
          stats.linksAlreadyDirect += 1;
          nextLinks.push(link);
          continue;
        }

        const resolved = await resolveOneLink(link, plant, fieldName, caches);
        if (resolved) {
          stats.linksReplaced += 1;
          hasChange = true;
          nextLinks.push(resolved);
        } else {
          stats.linksUnresolved += 1;
          hasChange = true;
        }
      }

      const deduped = Array.from(new Set(nextLinks));
      const nextValue = deduped.length > 0 ? toCsvLinks(deduped) : null;
      const currentNormalized = current || null;
      const changedValue = nextValue !== currentNormalized;

      if (!hasChange && !changedValue) continue;

      stats.fieldsUpdated += 1;
      preview.push({
        id: plant.id,
        name: plant.name,
        field: fieldName,
        from: currentNormalized,
        to: nextValue,
      });

      if (write) {
        await execute(`UPDATE plants SET ${fieldName} = ? WHERE id = ?`, [nextValue, plant.id]);
      }
    }
  }

  const mode = write ? 'WRITE' : 'DRY-RUN';
  console.log(`[plants-photo-resolver] mode=${mode}`);
  console.log(JSON.stringify(stats, null, 2));
  console.log('[plants-photo-resolver] apercu (20 max):');
  for (const item of preview.slice(0, 20)) {
    console.log(`- #${item.id} ${item.name} | ${item.field}`);
    console.log(`  from: ${item.from || 'NULL'}`);
    console.log(`  to  : ${item.to || 'NULL'}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[plants-photo-resolver] erreur fatale:', err.message || err);
    process.exit(1);
  });
}

module.exports = {
  parseFlags,
  splitCandidates,
  isDirectImageUrl,
};

