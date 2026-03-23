#!/usr/bin/env node
/**
 * Consolide les sources des plantes :
 * - verifie les URLs existantes (2xx/3xx),
 * - ajoute des sources fiables (Wikipedia + Wikidata) quand la correspondance
 *   avec l'espece est suffisamment certaine.
 *
 * Usage:
 *   node scripts/consolidate-plants-sources.js
 *   node scripts/consolidate-plants-sources.js --write
 *   node scripts/consolidate-plants-sources.js --limit=20
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const http = require('http');
const https = require('https');
const { queryAll, execute } = require('../database');

function parseFlags(argv) {
  const args = new Set(argv);
  const limitArg = argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : null;
  return {
    write: args.has('--write'),
    limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null,
  };
}

function normalizeText(s) {
  return (s || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function splitSources(raw) {
  return (raw || '')
    .split(/\n|,\s*/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function isHttpsUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

async function requestStatus(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error('URL invalide'));
      return;
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request(
      parsed,
      {
        method: 'GET',
        headers: { 'user-agent': 'ForetMap/1.0 (sources-consolidator)' },
      },
      (res) => {
        const status = Number(res.statusCode || 0);
        res.destroy();
        resolve(status);
      }
    );

    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timeout HTTP (${timeoutMs}ms)`)));
    req.on('error', reject);
    req.end();
  });
}

async function fetchJson(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error(`URL invalide: ${url}`));
      return;
    }
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request(
      parsed,
      {
        method: 'GET',
        headers: {
          'user-agent': 'ForetMap/1.0 (sources-consolidator)',
          accept: 'application/json',
        },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
          if (body.length > 2 * 1024 * 1024) {
            req.destroy(new Error('Reponse JSON trop volumineuse'));
          }
        });
        res.on('end', () => {
          const status = Number(res.statusCode || 0);
          if (status < 200 || status >= 300) {
            reject(new Error(`HTTP ${status}`));
            return;
          }
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch (err) {
            reject(new Error(`JSON invalide: ${err.message}`));
          }
        });
      }
    );

    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timeout HTTP (${timeoutMs}ms)`)));
    req.on('error', reject);
    req.end();
  });
}

function looksLikeWeakFreeTextToken(value) {
  const n = normalizeText(value);
  return n === 'wikipedia' || n === 'wiki' || n === 'wikipedia.';
}

function scoreWikiMatch(plant, title, extract) {
  const sci = normalizeText(plant.scientific_name);
  const common = normalizeText(plant.name);
  const bag = normalizeText(`${title} ${extract || ''}`);
  let score = 0;
  if (sci && bag.includes(sci)) score += 3;
  if (common && bag.includes(common)) score += 2;
  return score;
}

async function resolveWikipediaCandidate(plant, lang, titleValue, cache) {
  const key = `${lang}::${titleValue}`;
  if (cache.has(key)) return cache.get(key);

  try {
    const endpoint = new URL(`https://${lang}.wikipedia.org/w/api.php`);
    endpoint.searchParams.set('action', 'query');
    endpoint.searchParams.set('format', 'json');
    endpoint.searchParams.set('redirects', '1');
    endpoint.searchParams.set('prop', 'extracts|pageprops');
    endpoint.searchParams.set('exintro', '1');
    endpoint.searchParams.set('explaintext', '1');
    endpoint.searchParams.set('titles', titleValue);

    const data = await fetchJson(endpoint.toString());
    const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
    const page = pages[0];
    if (!page || Number(page.missing) === 1 || !page.title) {
      cache.set(key, null);
      return null;
    }

    const score = scoreWikiMatch(plant, page.title, page.extract || '');
    if (score < 3) {
      cache.set(key, null);
      return null;
    }

    const title = page.title.replace(/ /g, '_');
    const wikipediaUrl = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`;
    const wikibaseItem = page?.pageprops?.wikibase_item || null;
    const wikidataUrl = wikibaseItem ? `https://www.wikidata.org/wiki/${wikibaseItem}` : null;
    const out = { score, wikipediaUrl, wikidataUrl };
    cache.set(key, out);
    return out;
  } catch {
    cache.set(key, null);
    return null;
  }
}

async function findBestTrustedSources(plant, cache) {
  const candidates = [
    (plant.scientific_name || '').trim(),
    (plant.name || '').trim(),
  ].filter(Boolean);

  let best = null;
  for (const lang of ['fr', 'en']) {
    for (const name of candidates) {
      const c = await resolveWikipediaCandidate(plant, lang, name, cache);
      if (!c) continue;
      if (!best || c.score > best.score) best = c;
    }
  }
  return best;
}

function uniqueOrdered(values) {
  const out = [];
  const seen = new Set();
  for (const v of values) {
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

async function main() {
  const { write, limit } = parseFlags(process.argv.slice(2));
  const rows = await queryAll(
    `SELECT id, name, scientific_name, sources
     FROM plants
     ORDER BY id`
  );
  const plants = limit ? rows.slice(0, limit) : rows;
  const wikiCache = new Map();
  const statusCache = new Map();

  const stats = {
    plants: plants.length,
    urlsChecked: 0,
    urlsVerified: 0,
    urlsDropped: 0,
    sourcesAdded: 0,
    rowsUpdated: 0,
  };

  const preview = [];

  for (const plant of plants) {
    const entries = splitSources(plant.sources);
    const currentUrls = entries.filter(isHttpsUrl);
    const preservedText = entries.filter((v) => !isHttpsUrl(v) && !looksLikeWeakFreeTextToken(v));

    const verifiedUrls = [];
    for (const u of currentUrls) {
      stats.urlsChecked += 1;
      let status = statusCache.get(u);
      if (status == null) {
        try {
          status = await requestStatus(u);
        } catch {
          status = 0;
        }
        statusCache.set(u, status);
      }
      if (status >= 200 && status < 400) {
        verifiedUrls.push(u);
        stats.urlsVerified += 1;
      } else {
        stats.urlsDropped += 1;
      }
    }

    const trusted = await findBestTrustedSources(plant, wikiCache);
    const added = [];
    if (trusted?.wikipediaUrl && !verifiedUrls.includes(trusted.wikipediaUrl)) added.push(trusted.wikipediaUrl);
    if (trusted?.wikidataUrl && !verifiedUrls.includes(trusted.wikidataUrl)) added.push(trusted.wikidataUrl);
    stats.sourcesAdded += added.length;

    const nextEntries = uniqueOrdered([...verifiedUrls, ...added, ...preservedText]);
    const nextSources = nextEntries.length > 0 ? nextEntries.join(', ') : null;
    const currentNormalized = (plant.sources || '').trim() || null;

    if (nextSources === currentNormalized) continue;
    stats.rowsUpdated += 1;
    preview.push({
      id: plant.id,
      name: plant.name,
      from: currentNormalized,
      to: nextSources,
    });

    if (write) {
      await execute('UPDATE plants SET sources = ? WHERE id = ?', [nextSources, plant.id]);
    }
  }

  console.log(`[plants-sources-consolidator] mode=${write ? 'WRITE' : 'DRY-RUN'}`);
  console.log(JSON.stringify(stats, null, 2));
  console.log('[plants-sources-consolidator] apercu (20 max):');
  for (const p of preview.slice(0, 20)) {
    console.log(`- #${p.id} ${p.name}`);
    console.log(`  from: ${p.from || 'NULL'}`);
    console.log(`  to  : ${p.to || 'NULL'}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[plants-sources-consolidator] erreur fatale:', err.message || err);
    process.exit(1);
  });
}

module.exports = {
  parseFlags,
  splitSources,
  isHttpsUrl,
};

