'use strict';

const FIELD_KEYS = new Set([
  'name',
  'scientific_name',
  'second_name',
  'description',
  'group_1',
  'group_2',
  'group_3',
  'group_4',
  'habitat',
  'agroecosystem_category',
  'nutrition',
  'longevity',
  'reproduction',
  'size',
  'sources',
  'ideal_temperature_c',
  'optimal_ph',
  'ecosystem_role',
  'geographic_origin',
  'human_utility',
  'harvest_part',
  'planting_recommendations',
  'preferred_nutrients',
  'photo',
  'photo_species',
  'photo_leaf',
  'photo_flower',
  'photo_fruit',
  'photo_harvest_part',
]);

const PHOTO_FIELD_KEYS = new Set([
  'photo',
  'photo_species',
  'photo_leaf',
  'photo_flower',
  'photo_fruit',
  'photo_harvest_part',
]);

function asTrimmedString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function asOptionalText(value) {
  const s = asTrimmedString(value);
  return s.length > 0 ? s : null;
}

function parseNumberish(value) {
  const s = asTrimmedString(value).replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function clampConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function uniqStrings(items) {
  return Array.from(new Set((items || []).map((v) => asTrimmedString(v)).filter(Boolean)));
}

async function fetchJsonWithTimeout(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 6000;
  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch indisponible');
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      signal: ac.signal,
      headers: {
        'accept': 'application/json',
        'user-agent': 'ForetMap/1.0 (species-autofill)',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function wikimediaFilePath(fileName) {
  const value = asTrimmedString(fileName);
  if (!value) return null;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(value.replace(/ /g, '_'))}`;
}

async function fetchWikipediaSource(query, options = {}) {
  const q = asTrimmedString(query);
  if (!q) return null;
  const url = `https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`;
  const data = await fetchJsonWithTimeout(url, options);
  const pageUrl = asTrimmedString(data?.content_urls?.desktop?.page);
  const title = asTrimmedString(data?.title);
  const description = asOptionalText(data?.extract);
  const thumb = asTrimmedString(data?.thumbnail?.source);
  const fields = {};
  if (title) fields.name = title;
  if (description) fields.description = description;
  if (pageUrl) fields.sources = pageUrl;
  const photos = [];
  if (thumb) {
    photos.push({
      field: 'photo_species',
      url: thumb,
      license: asOptionalText(data?.license?.type) || null,
      credit: asOptionalText(data?.license?.text) || 'Wikipedia',
      source_url: pageUrl || url,
      source: 'wikipedia',
      confidence: 0.58,
    });
  }
  return {
    source: 'wikipedia',
    confidence: 0.58,
    source_url: pageUrl || url,
    fields,
    photos,
    warnings: [],
  };
}

async function fetchGbifSource(query, options = {}) {
  const q = asTrimmedString(query);
  if (!q) return null;
  const url = `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(q)}`;
  const data = await fetchJsonWithTimeout(url, options);
  const confidenceRaw = parseNumberish(data?.confidence);
  if (confidenceRaw == null && asTrimmedString(data?.matchType).toUpperCase() === 'NONE') {
    return {
      source: 'gbif',
      confidence: 0.2,
      source_url: url,
      fields: {},
      photos: [],
      warnings: ['GBIF: aucune correspondance exacte'],
    };
  }
  const fields = {};
  const scientificName = asOptionalText(data?.scientificName);
  const canonicalName = asOptionalText(data?.canonicalName);
  const family = asOptionalText(data?.family);
  const order = asOptionalText(data?.order);
  const kingdom = asOptionalText(data?.kingdom);
  if (canonicalName) fields.name = canonicalName;
  if (scientificName) fields.scientific_name = scientificName;
  if (family) {
    fields.group_3 = family;
    fields.group_4 = family;
  }
  if (order) fields.group_2 = order;
  if (kingdom) fields.group_1 = kingdom;
  fields.sources = `https://www.gbif.org/species/${encodeURIComponent(String(data?.usageKey || ''))}`;
  const confidence = confidenceRaw == null ? 0.55 : clampConfidence(confidenceRaw / 100);
  return {
    source: 'gbif',
    confidence,
    source_url: url,
    fields,
    photos: [],
    warnings: [],
  };
}

async function fetchWikidataSource(query, options = {}) {
  const q = asTrimmedString(query);
  if (!q) return null;
  const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(q)}&language=fr&format=json&limit=1&type=item&origin=*`;
  const searchData = await fetchJsonWithTimeout(searchUrl, options);
  const first = Array.isArray(searchData?.search) ? searchData.search[0] : null;
  const id = asTrimmedString(first?.id);
  if (!id) {
    return {
      source: 'wikidata',
      confidence: 0.2,
      source_url: searchUrl,
      fields: {},
      photos: [],
      warnings: ['Wikidata: aucune entité trouvée'],
    };
  }
  const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(id)}.json`;
  const entityData = await fetchJsonWithTimeout(entityUrl, options);
  const entity = entityData?.entities?.[id] || {};
  const labels = entity?.labels || {};
  const descriptions = entity?.descriptions || {};
  const sitelinks = entity?.sitelinks || {};
  const claims = entity?.claims || {};
  const labelFr = asOptionalText(labels?.fr?.value);
  const labelEn = asOptionalText(labels?.en?.value);
  const descFr = asOptionalText(descriptions?.fr?.value);
  const taxonName = asOptionalText(
    claims?.P225?.[0]?.mainsnak?.datavalue?.value
  );
  const familyName = asOptionalText(
    claims?.P171?.[0]?.mainsnak?.datavalue?.value?.id
  );
  const imageName = asOptionalText(claims?.P18?.[0]?.mainsnak?.datavalue?.value);
  const wikiFrPage = asOptionalText(sitelinks?.frwiki?.title);
  const wikiFrUrl = wikiFrPage
    ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(wikiFrPage.replace(/ /g, '_'))}`
    : null;
  const fields = {};
  if (labelFr || labelEn) fields.name = labelFr || labelEn;
  if (taxonName) fields.scientific_name = taxonName;
  if (descFr) fields.description = descFr;
  if (familyName) fields.group_3 = familyName;
  fields.sources = wikiFrUrl || `https://www.wikidata.org/wiki/${id}`;
  const photos = [];
  const commonsUrl = wikimediaFilePath(imageName);
  if (commonsUrl) {
    photos.push({
      field: 'photo_species',
      url: commonsUrl,
      license: 'Wikimedia Commons (voir page fichier)',
      credit: 'Wikidata/Wikimedia Commons',
      source_url: `https://www.wikidata.org/wiki/${id}`,
      source: 'wikidata',
      confidence: 0.66,
    });
  }
  return {
    source: 'wikidata',
    confidence: 0.66,
    source_url: `https://www.wikidata.org/wiki/${id}`,
    fields,
    photos,
    warnings: [],
  };
}

function mergeSources(results = []) {
  const valid = (results || []).filter(Boolean);
  const warnings = [];
  const sourceErrors = [];
  const sourceSummaries = [];
  const fieldBuckets = new Map();
  const photoBuckets = [];

  for (const res of valid) {
    if (res.error) {
      sourceErrors.push(`${res.source}: ${res.error}`);
      continue;
    }
    sourceSummaries.push({
      source: res.source,
      confidence: clampConfidence(res.confidence),
      source_url: asOptionalText(res.source_url),
    });
    for (const w of res.warnings || []) warnings.push(asTrimmedString(w));
    for (const [key, value] of Object.entries(res.fields || {})) {
      if (!FIELD_KEYS.has(key)) continue;
      const text = asOptionalText(value);
      if (!text) continue;
      if (!fieldBuckets.has(key)) fieldBuckets.set(key, []);
      fieldBuckets.get(key).push({
        value: text,
        source: res.source,
        confidence: clampConfidence(res.confidence),
        source_url: asOptionalText(res.source_url),
      });
    }
    for (const photo of res.photos || []) {
      const field = asTrimmedString(photo.field) || 'photo_species';
      if (!PHOTO_FIELD_KEYS.has(field)) continue;
      const url = asOptionalText(photo.url);
      if (!url) continue;
      photoBuckets.push({
        field,
        url,
        license: asOptionalText(photo.license),
        credit: asOptionalText(photo.credit),
        source_url: asOptionalText(photo.source_url) || asOptionalText(res.source_url),
        source: asTrimmedString(photo.source) || res.source,
        confidence: clampConfidence(photo.confidence != null ? photo.confidence : res.confidence),
      });
    }
  }

  if (sourceErrors.length > 0) warnings.push(...sourceErrors);

  const fields = {};
  const field_sources = {};
  for (const [field, candidates] of fieldBuckets.entries()) {
    const sorted = [...candidates].sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.value.length - a.value.length;
    });
    const best = sorted[0];
    fields[field] = best.value;
    field_sources[field] = {
      source: best.source,
      confidence: best.confidence,
      source_url: best.source_url || null,
      alternatives: sorted.slice(1, 3).map((c) => ({
        value: c.value,
        source: c.source,
        confidence: c.confidence,
        source_url: c.source_url || null,
      })),
    };
  }

  if (fields.sources) {
    const existingLinks = uniqStrings(String(fields.sources).split(/\n|,\s*/));
    const extraLinks = sourceSummaries.map((s) => s.source_url).filter(Boolean);
    fields.sources = uniqStrings([...existingLinks, ...extraLinks]).join('\n');
  } else {
    fields.sources = uniqStrings(sourceSummaries.map((s) => s.source_url).filter(Boolean)).join('\n') || null;
  }

  const photosByField = new Map();
  for (const candidate of photoBuckets) {
    const key = `${candidate.field}|${candidate.url}`;
    const prev = photosByField.get(key);
    if (!prev || candidate.confidence > prev.confidence) {
      photosByField.set(key, candidate);
    }
  }
  const photos = Array.from(photosByField.values()).sort((a, b) => b.confidence - a.confidence);

  const avgSourceConfidence = sourceSummaries.length > 0
    ? sourceSummaries.reduce((acc, item) => acc + item.confidence, 0) / sourceSummaries.length
    : 0;
  const fieldCoverageScore = Math.min(1, Object.keys(fields).filter((k) => k !== 'sources').length / 8);
  const photoScore = photos.length > 0 ? Math.min(1, photos.length / 3) : 0;
  const confidence = clampConfidence((avgSourceConfidence * 0.55) + (fieldCoverageScore * 0.35) + (photoScore * 0.1));

  return {
    confidence,
    fields,
    field_sources,
    photos,
    sources: sourceSummaries,
    warnings: uniqStrings(warnings),
  };
}

async function fetchSourceSafe(sourceName, runner) {
  try {
    return await runner();
  } catch (err) {
    return {
      source: sourceName,
      confidence: 0,
      fields: {},
      photos: [],
      warnings: [],
      error: asTrimmedString(err?.message) || 'Erreur source externe',
    };
  }
}

async function buildSpeciesAutofill(query, options = {}) {
  const q = asTrimmedString(query);
  if (!q) {
    return {
      query: '',
      confidence: 0,
      fields: {},
      field_sources: {},
      photos: [],
      sources: [],
      warnings: ['Requête vide'],
    };
  }
  const results = await Promise.all([
    fetchSourceSafe('wikipedia', () => fetchWikipediaSource(q, options)),
    fetchSourceSafe('wikidata', () => fetchWikidataSource(q, options)),
    fetchSourceSafe('gbif', () => fetchGbifSource(q, options)),
  ]);
  const merged = mergeSources(results);
  return {
    query: q,
    confidence: merged.confidence,
    fields: merged.fields,
    field_sources: merged.field_sources,
    photos: merged.photos,
    sources: merged.sources,
    warnings: merged.warnings,
  };
}

module.exports = {
  buildSpeciesAutofill,
  mergeSources,
  fetchWikipediaSource,
  fetchWikidataSource,
  fetchGbifSource,
};
