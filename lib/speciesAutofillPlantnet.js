'use strict';

const logger = require('./logger');

/**
 * Pl@ntNet API (https://my.plantnet.org/) — **désactivé par défaut**.
 * Nécessite une clé `PLANTNET_API_KEY` et `SPECIES_AUTOFILL_PLANTNET=1`.
 * L’alignement taxonomique peut renvoyer un nom commun / famille exploitables en suggestion.
 */

function asTrimmedString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function isPlantnetAutofillEnabled() {
  const flag = asTrimmedString(process.env.SPECIES_AUTOFILL_PLANTNET);
  const key = asTrimmedString(process.env.PLANTNET_API_KEY);
  return flag === '1' && key.length > 0;
}

/**
 * @param {string|null|undefined} scientificName
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<object|null>}
 */
async function fetchPlantnetSpeciesTraits(scientificName, options = {}) {
  if (!isPlantnetAutofillEnabled()) return null;
  const apiKey = asTrimmedString(process.env.PLANTNET_API_KEY);
  const name = asTrimmedString(scientificName);
  if (!name) return null;

  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') return null;

  const project = asTrimmedString(process.env.PLANTNET_PROJECT) || 'k-world-flora';
  const url = `https://my-api.plantnet.org/v2/projects/${encodeURIComponent(project)}/species/align?api-key=${encodeURIComponent(apiKey)}&name=${encodeURIComponent(name)}`;

  const timeoutMs = Math.min(8000, Math.max(400, Number(options.timeoutMs) || 6000));
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      signal: ac.signal,
      headers: { accept: 'application/json' },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      logger.warn({ msg: 'plantnet_autofill_http', status: res.status }, 'Pré-saisie PlantNet : HTTP en échec');
      return null;
    }

    const match = data?.bestMatch || data?.species || data?.result || data;
    const fields = {};
    const common = asTrimmedString(match?.commonName || match?.common_name);
    if (common && common.length < 120) fields.second_name = common;
    if (Object.keys(fields).length === 0) return null;

    return {
      source: 'plantnet',
      confidence: 0.42,
      source_url: url.split('?')[0],
      fields,
      photos: [],
      warnings: ['PlantNet : alignement taxonomique — vérifier le nom et les champs proposés.'],
    };
  } catch (err) {
    logger.warn({ msg: 'plantnet_autofill_err', err: String(err?.message || err) }, 'Pré-saisie PlantNet : erreur');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  fetchPlantnetSpeciesTraits,
  isPlantnetAutofillEnabled,
};
