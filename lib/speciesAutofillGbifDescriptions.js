'use strict';

/**
 * Complément GBIF : fiche espèce + descriptions textuelles publiques.
 * Voir https://api.gbif.org/v1/species/{key}/descriptions
 */

const HABITAT_TYPES = new Set(['habit', 'habitat', 'environment']);
const GEO_TYPES = new Set(['native range', 'regional distribution', 'introduction', 'geographic distribution', 'distribution']);
const ECOSYSTEM_TYPES = new Set(['ecology', 'general', 'diagnosis']);

const MAX_CHUNK = 180;
const MAX_JOIN = 400;

function asTrimmedString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function langScore(lang) {
  const l = asTrimmedString(lang).toLowerCase();
  if (!l) return 1;
  if (/^fr\b|^fra|^fre/.test(l)) return 4;
  if (/^en\b|^eng/.test(l)) return 3;
  if (/^es|^de|^it|^nld|^por/.test(l)) return 2;
  return 0;
}

/**
 * @param {object[]} results — GBIF /species/{key}/descriptions results[]
 * @returns {Record<string, string>}
 */
function extractGbifDescriptionFields(results) {
  const fields = {};
  if (!Array.isArray(results) || results.length === 0) return fields;

  /** @type {Map<string, { type: string, desc: string, score: number }>} */
  const bestByKey = new Map();
  for (const row of results) {
    const type = asTrimmedString(row?.type).toLowerCase();
    const desc = asTrimmedString(row?.description);
    if (!type || !desc || desc.length > 500) continue;
    const short = desc.length > MAX_CHUNK ? `${desc.slice(0, MAX_CHUNK - 1)}…` : desc;
    const score = langScore(row?.language);
    const dedupKey = `${type}|${short.toLowerCase()}`;
    const prev = bestByKey.get(dedupKey);
    if (!prev || score > prev.score) {
      bestByKey.set(dedupKey, { type, desc: short, score });
    }
  }

  const habitatParts = [];
  const geoParts = [];
  const ecoParts = [];
  for (const { type, desc } of bestByKey.values()) {
    if (HABITAT_TYPES.has(type)) habitatParts.push(desc);
    else if (GEO_TYPES.has(type)) geoParts.push(desc);
    else if (ECOSYSTEM_TYPES.has(type)) ecoParts.push(desc);
  }

  const uniqJoin = (parts) => [...new Set(parts.map((p) => p.replace(/\s+/g, ' ')))]
    .join(' · ')
    .slice(0, MAX_JOIN);

  if (habitatParts.length) fields.habitat = uniqJoin(habitatParts);
  if (geoParts.length) fields.geographic_origin = uniqJoin(geoParts);
  if (ecoParts.length) fields.ecosystem_role = uniqJoin(ecoParts);

  return fields;
}

/**
 * @param {number|string} usageKey
 * @param {function(string, object): Promise<object>} fetchJson
 * @param {object} options
 * @returns {Promise<{ fields: Record<string, string>, warnings: string[] }>}
 */
async function fetchGbifSpeciesEnrichment(usageKey, fetchJson, options = {}) {
  const warnings = [];
  const fields = {};
  const key = Number(usageKey);
  if (!Number.isFinite(key) || key <= 0 || typeof fetchJson !== 'function') {
    return { fields, warnings };
  }

  try {
    const detail = await fetchJson(
      `https://api.gbif.org/v1/species/${encodeURIComponent(String(key))}`,
      options,
    );
    const status = asTrimmedString(detail?.taxonomicStatus).toUpperCase();
    if (status === 'SYNONYM' || status === 'HETEROTYPIC_SYNONYM' || status === 'HOMOTYPIC_SYNONYM') {
      warnings.push(`GBIF : statut « ${detail.taxonomicStatus} » — vérifier le nom accepté.`);
    } else if (status === 'DOUBTFUL') {
      warnings.push('GBIF : statut DOUBTFUL — taxon ou synonymie incertaine.');
    }
    const rem = asTrimmedString(detail?.remarks);
    if (rem && rem.length >= 8 && rem.length < 240) {
      warnings.push(`GBIF : ${rem}`);
    }
  } catch {
    /* non bloquant */
  }

  try {
    const descData = await fetchJson(
      `https://api.gbif.org/v1/species/${encodeURIComponent(String(key))}/descriptions?limit=16`,
      options,
    );
    Object.assign(fields, extractGbifDescriptionFields(descData?.results));
  } catch {
    /* non bloquant */
  }

  return { fields, warnings };
}

module.exports = {
  extractGbifDescriptionFields,
  fetchGbifSpeciesEnrichment,
};
