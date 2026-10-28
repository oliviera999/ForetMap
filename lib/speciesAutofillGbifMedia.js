'use strict';

/**
 * Complément GBIF : photos d’occurrences (StillImage) pour la pré-saisie.
 * Les images visibles sur gbif.org/species viennent surtout de
 * `GET /v1/occurrence/search?media_type=StillImage&taxon_key=…`
 * (pas de `species/match`). Voir https://data-blog.gbif.org/post/gbif-multimedia/
 * et les consignes de citation GBIF : https://www.gbif.org/citation-guidelines
 */

const { asTrimmedString, asOptionalText } = require('./shared/stringHelpers');

const MAX_PHOTOS = 6;
const OCCURRENCE_LIMIT = 20;

/**
 * Normalise une licence GBIF (URL Creative Commons ou code) vers un libellé court.
 * N’accepte que les licences compatibles affichage public du catalogue (CC0 / CC BY /
 * CC BY-SA) — hors NC et ND, absentes de `COMMON_PHOTO_LICENCES`.
 * @param {unknown} raw
 * @returns {string|null}
 */
function normalizeReusableLicense(raw) {
  const s = asTrimmedString(raw).toLowerCase().replace(/_/g, '-').replace(/\s+/g, ' ');
  if (!s) return null;
  if (
    /cc0|public.?domain|pdm|no.?rights.?reserved|creativecommons\.org\/publicdomain\/zero/.test(s)
  ) {
    return 'CC0';
  }
  if (/\bnc\b|non[- ]?commercial|\bnd\b|no[- ]?deriv/.test(s)) return null;

  const bySaUrl = s.match(/creativecommons\.org\/licenses\/by-sa\/(\d+(?:\.\d+)?)/);
  if (bySaUrl) return `CC BY-SA ${bySaUrl[1]}`;
  const byUrl = s.match(/creativecommons\.org\/licenses\/by\/(\d+(?:\.\d+)?)/);
  if (byUrl) return `CC BY ${byUrl[1]}`;

  if (/^cc-?by-?sa\b/.test(s)) {
    const m = s.match(/(\d+(?:\.\d+)?)/);
    return m ? `CC BY-SA ${m[1]}` : 'CC BY-SA';
  }
  if (/^cc-?by\b/.test(s) && !/\bsa\b/.test(s)) {
    const m = s.match(/(\d+(?:\.\d+)?)/);
    return m ? `CC BY ${m[1]}` : 'CC BY';
  }
  return null;
}

/** URL HTTPS d’image directe (extension reconnue) — aligné sur `validateHttpsPhotoLinks`. */
function isHttpsDirectImageUrl(url) {
  const raw = asTrimmedString(url);
  if (!/^https:\/\//i.test(raw)) return false;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    return /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(u.pathname);
  } catch {
    return false;
  }
}

function basisPriority(basisOfRecord) {
  const b = asTrimmedString(basisOfRecord).toUpperCase();
  if (b === 'HUMAN_OBSERVATION') return 3;
  if (b === 'OBSERVATION' || b === 'MACHINE_OBSERVATION') return 2;
  if (b === 'LIVING_SPECIMEN') return 1;
  if (b === 'PRESERVED_SPECIMEN' || b === 'FOSSIL_SPECIMEN' || b === 'MATERIAL_SAMPLE') return 0;
  return 1;
}

/**
 * Extrait des candidats photo depuis les résultats d’occurrence GBIF.
 * @param {object[]} results
 * @param {{ maxPhotos?: number }} [options]
 * @returns {{ photos: object[], warnings: string[], skippedLicense: number, skippedUrl: number }}
 */
function extractGbifOccurrencePhotos(results, options = {}) {
  const maxPhotos = Math.min(
    MAX_PHOTOS,
    Math.max(1, Number(options.maxPhotos) > 0 ? Number(options.maxPhotos) : MAX_PHOTOS),
  );
  const warnings = [];
  const candidates = [];
  let skippedLicense = 0;
  let skippedUrl = 0;
  const list = Array.isArray(results) ? results : [];

  for (const occ of list) {
    const basis = asTrimmedString(occ?.basisOfRecord);
    const prio = basisPriority(basis);
    const occLicense = occ?.license;
    const occKey = occ?.key != null ? String(occ.key) : null;
    const occRef =
      asOptionalText(occ?.references) ||
      (occKey ? `https://www.gbif.org/occurrence/${encodeURIComponent(occKey)}` : null);
    const media = Array.isArray(occ?.media) ? occ.media : [];
    for (const m of media) {
      const type = asTrimmedString(m?.type);
      if (type && !/^stillimage$/i.test(type)) continue;
      const url = asOptionalText(m?.identifier);
      if (!url) {
        skippedUrl += 1;
        continue;
      }
      if (!isHttpsDirectImageUrl(url)) {
        skippedUrl += 1;
        continue;
      }
      const licenseLabel = normalizeReusableLicense(m?.license || occLicense);
      if (!licenseLabel) {
        skippedLicense += 1;
        continue;
      }
      const credit =
        asOptionalText(m?.rightsHolder) ||
        asOptionalText(m?.creator) ||
        asOptionalText(occ?.rightsHolder) ||
        'GBIF (voir occurrence)';
      const sourceUrl = asOptionalText(m?.references) || occRef;
      const confidence = prio >= 3 ? 0.5 : prio >= 2 ? 0.44 : prio >= 1 ? 0.4 : 0.32;
      candidates.push({
        field: 'photo_species',
        url,
        license: licenseLabel,
        credit,
        source_url: sourceUrl,
        source: 'gbif_media',
        confidence,
        _prio: prio,
      });
    }
  }

  candidates.sort((a, b) => {
    if (b._prio !== a._prio) return b._prio - a._prio;
    return b.confidence - a.confidence;
  });

  const seen = new Set();
  const photos = [];
  for (const c of candidates) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    photos.push({
      field: c.field,
      url: c.url,
      license: c.license,
      credit: c.credit,
      source_url: c.source_url,
      source: c.source,
      confidence: c.confidence,
    });
    if (photos.length >= maxPhotos) break;
  }

  if (photos.length > 0) {
    warnings.push(
      'GBIF : photos d’occurrences — vérifier que l’image montre bien l’espèce avant application.',
    );
  } else if (list.length > 0 && skippedLicense + skippedUrl > 0) {
    warnings.push(
      'GBIF : des médias d’occurrences existent mais aucune licence réutilisable (CC0 / CC BY / CC BY-SA, HTTPS image directe) n’a été retenue.',
    );
  }

  return { photos, warnings, skippedLicense, skippedUrl };
}

/**
 * @param {number|string} usageKey
 * @param {function(string, object): Promise<object>} fetchJson
 * @param {object} [options]
 * @returns {Promise<{ photos: object[], warnings: string[] }>}
 */
async function fetchGbifMediaEnrichment(usageKey, fetchJson, options = {}) {
  const warnings = [];
  const key = Number(usageKey);
  if (!Number.isFinite(key) || key <= 0 || typeof fetchJson !== 'function') {
    return { photos: [], warnings };
  }

  const url =
    `https://api.gbif.org/v1/occurrence/search?taxon_key=${encodeURIComponent(String(key))}` +
    `&media_type=StillImage&limit=${OCCURRENCE_LIMIT}`;
  let data;
  try {
    data = await fetchJson(url, options);
  } catch {
    warnings.push('GBIF : recherche d’images d’occurrences indisponible.');
    return { photos: [], warnings };
  }

  const extracted = extractGbifOccurrencePhotos(data?.results, {
    maxPhotos: options.maxPhotos,
  });
  return {
    photos: extracted.photos,
    warnings: [...warnings, ...extracted.warnings],
  };
}

/**
 * Pack source prêt pour `mergeSources` (ou `null` si rien à fusionner).
 * @param {number|string} usageKey
 * @param {function(string, object): Promise<object>} fetchJson
 * @param {object} [options]
 */
async function fetchGbifMediaSource(usageKey, fetchJson, options = {}) {
  const key = Number(usageKey);
  if (!Number.isFinite(key) || key <= 0) return null;
  const enrich = await fetchGbifMediaEnrichment(key, fetchJson, options);
  if ((enrich.photos || []).length === 0 && (enrich.warnings || []).length === 0) return null;
  return {
    source: 'gbif_media',
    confidence: (enrich.photos || []).length > 0 ? 0.46 : 0.2,
    source_url: `https://www.gbif.org/occurrence/gallery?taxon_key=${encodeURIComponent(String(key))}`,
    fields: {},
    photos: enrich.photos || [],
    warnings: enrich.warnings || [],
  };
}

module.exports = {
  MAX_PHOTOS,
  OCCURRENCE_LIMIT,
  normalizeReusableLicense,
  isHttpsDirectImageUrl,
  extractGbifOccurrencePhotos,
  fetchGbifMediaEnrichment,
  fetchGbifMediaSource,
};
