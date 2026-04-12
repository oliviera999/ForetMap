'use strict';

const logger = require('./logger');

/**
 * Trefle (https://trefle.io/) — **désactivé par défaut**.
 * `SPECIES_AUTOFILL_TREFLE=1` et `TREFLE_TOKEN` requis.
 */

function asTrimmedString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function asOptionalText(value) {
  const s = asTrimmedString(value);
  return s.length > 0 ? s : null;
}

function isTrefleAutofillEnabled() {
  const flag = asTrimmedString(process.env.SPECIES_AUTOFILL_TREFLE);
  const token = asTrimmedString(process.env.TREFLE_TOKEN);
  return flag === '1' && token.length > 0;
}

function resolveFetchTimeoutMs(options = {}) {
  if (typeof options.getTimeoutMs === 'function') {
    const n = Number(options.getTimeoutMs());
    if (!Number.isFinite(n)) return 6000;
    return Math.min(5200, Math.max(200, n));
  }
  return Math.min(5200, Math.max(200, Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 6000));
}

function mapTrefleRow(row) {
  const fields = {};
  const photos = [];
  if (!row || typeof row !== 'object') return { fields, photos };

  const obs = asOptionalText(row.observations);
  if (obs) fields.habitat = obs.slice(0, 320);

  const growth = row.growth && typeof row.growth === 'object' ? row.growth : null;
  const plantParts = [];
  if (growth) {
    if (growth.description) plantParts.push(String(growth.description).trim());
    if (growth.sowing) plantParts.push(`Semis : ${String(growth.sowing).trim()}`);
    const phMin = growth.ph_minimum;
    const phMax = growth.ph_maximum;
    if (Number.isFinite(phMin) && Number.isFinite(phMax)) {
      fields.optimal_ph = `${phMin}-${phMax}`;
    }
    const tmin = growth.minimum_temperature?.deg_c ?? growth.minimum_temperature;
    const tmax = growth.maximum_temperature?.deg_c ?? growth.maximum_temperature;
    if (Number.isFinite(tmin) && Number.isFinite(tmax)) {
      fields.ideal_temperature_c = `${tmin}-${tmax} °C`;
    }
  }
  if (plantParts.length) {
    fields.planting_recommendations = plantParts.join(' ').replace(/\s+/g, ' ').slice(0, 420);
  }

  const spec = row.specifications && typeof row.specifications === 'object' ? row.specifications : null;
  if (spec) {
    const maxCm = spec.maximum_height?.cm ?? spec.maximum_height;
    const avgCm = spec.average_height?.cm ?? spec.average_height;
    if (Number.isFinite(maxCm)) fields.size = `Hauteur max. env. ${maxCm} cm (Trefle)`;
    else if (Number.isFinite(avgCm)) fields.size = `Hauteur moy. env. ${avgCm} cm (Trefle)`;
  }

  if (Array.isArray(row.edible_part) && row.edible_part.length) {
    fields.harvest_part = row.edible_part.map((x) => String(x)).join(', ').slice(0, 200);
  }

  if (Array.isArray(row.duration) && row.duration.length) {
    const d = row.duration.map((x) => String(x).toLowerCase()).join(' ');
    if (d.includes('annual')) fields.longevity = 'Annuelle (Trefle)';
    else if (d.includes('biennial')) fields.longevity = 'Bisannuelle (Trefle)';
    else if (d.includes('perennial')) fields.longevity = 'Vivace (Trefle)';
  }

  const img = asOptionalText(row.image_url);
  if (img && /^https:\/\//i.test(img)) {
    photos.push({
      field: 'photo_species',
      url: img,
      license: null,
      credit: 'Trefle',
      source_url: asOptionalText(row.links?.self) || null,
      source: 'trefle',
      confidence: 0.52,
    });
  }

  const native = row.distributions?.native;
  if (Array.isArray(native) && native.length) {
    const names = native
      .map((z) => asOptionalText(z?.name || z?.zone || z?.slug))
      .filter(Boolean)
      .slice(0, 8);
    if (names.length) fields.geographic_origin = names.join(' · ').slice(0, 360);
  }

  return { fields, photos };
}

/**
 * @param {string|null|undefined} scientificName
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<object|null>}
 */
async function fetchTrefleSpeciesTraits(scientificName, options = {}) {
  if (!isTrefleAutofillEnabled()) return null;
  const token = asTrimmedString(process.env.TREFLE_TOKEN);
  const name = asTrimmedString(scientificName);
  if (!name) return null;

  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') return null;

  const url = `https://trefle.io/api/v1/species/search?token=${encodeURIComponent(token)}&q=${encodeURIComponent(name)}`;
  const timeoutMs = resolveFetchTimeoutMs(options);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      signal: ac.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'ForetMap/1.0 (species-autofill)',
      },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.error) {
      logger.warn({ msg: 'trefle_autofill_http', status: res.status }, 'Pré-saisie Trefle : réponse en échec');
      return null;
    }
    const row = Array.isArray(json?.data) ? json.data[0] : json?.data;
    if (!row || typeof row !== 'object') return null;
    const { fields, photos } = mapTrefleRow(row);
    if (Object.keys(fields).length === 0 && photos.length === 0) return null;

    return {
      source: 'trefle',
      confidence: 0.58,
      source_url: url.replace(/token=[^&]+/, 'token='),
      fields,
      photos,
      warnings: ['Trefle : données agronomiques / distribution — vérifier avant publication.'],
    };
  } catch (err) {
    logger.warn({ msg: 'trefle_autofill_err', err: String(err?.message || err) }, 'Pré-saisie Trefle : erreur');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  fetchTrefleSpeciesTraits,
  isTrefleAutofillEnabled,
};
