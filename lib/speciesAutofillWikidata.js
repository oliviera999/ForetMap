'use strict';

/**
 * Enrichissement taxon Wikidata → champs texte ForetMap (claims structurés).
 *
 * Table P-id (lot 1, conservateur) :
 * - P366 « has use » → human_utility (libellés FR des éléments liés, séparés par « · »).
 * - P183 « endemic to » → geographic_origin (libellés des lieux / régions).
 *
 * Candidats phase ultérieure (non implémentés ici) : distribution fine (P9718 si pertinent au taxon),
 * habitat (peu standardisé sur WD), température/pH (souvent absents en claim exploitable).
 */

const TRAIT_PROPERTY_IDS = ['P366', 'P183'];
const WBGETENTITIES_BATCH = 40;
const MAX_HUMAN_UTILITY_LEN = 420;
const MAX_GEOGRAPHIC_ORIGIN_LEN = 220;

function asTrimmedString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function asOptionalText(value) {
  const s = asTrimmedString(value);
  return s.length > 0 ? s : null;
}

/**
 * Collecte les Q-id référencés par des statements (valeur mainsnak de type item).
 * @param {object} claims — claims Wikidata de l’entité
 * @param {string[]} propertyIds — ex. ['P366','P183']
 * @returns {string[]}
 */
function collectItemIdsFromClaims(claims, propertyIds) {
  const out = new Set();
  for (const pid of propertyIds || []) {
    const stmts = claims?.[pid];
    if (!Array.isArray(stmts)) continue;
    for (const st of stmts) {
      const snak = st?.mainsnak;
      if (!snak || snak.snaktype !== 'value') continue;
      const v = snak?.datavalue?.value;
      if (v && typeof v === 'object' && asTrimmedString(v.id)) {
        const id = asTrimmedString(v.id);
        if (/^Q\d+$/i.test(id)) out.add(id.toUpperCase().replace(/^q/, 'Q'));
      }
    }
  }
  return [...out];
}

/**
 * Résout les libellés fr/en pour une liste d’items (batch wbgetentities).
 * @param {string[]} ids — Qids
 * @param {function(string, object): Promise<object>} fetchJson — ex. fetchJsonWithTimeout du module parent
 * @param {object} options — timeout / fetchImpl
 * @returns {Promise<Map<string, { fr: string|null, en: string|null }>>}
 */
async function fetchWikidataLabelsForIds(ids, fetchJson, options = {}) {
  const map = new Map();
  const unique = [...new Set((ids || []).map((id) => asTrimmedString(id)).filter((id) => /^Q\d+$/i.test(id)))];
  if (unique.length === 0 || typeof fetchJson !== 'function') return map;

  const normalized = unique.map((id) => id.toUpperCase().replace(/^q/, 'Q'));
  for (let i = 0; i < normalized.length; i += WBGETENTITIES_BATCH) {
    const chunk = normalized.slice(i, i + WBGETENTITIES_BATCH);
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(chunk.join('|'))}&languages=fr|en&props=labels&format=json&origin=*`;
    let data;
    try {
      data = await fetchJson(url, options);
    } catch {
      continue;
    }
    const entities = data?.entities || {};
    for (const qid of chunk) {
      const ent = entities[qid];
      if (!ent || ent.missing === '') continue;
      const fr = asOptionalText(ent?.labels?.fr?.value);
      const en = asOptionalText(ent?.labels?.en?.value);
      map.set(qid, { fr, en });
    }
  }
  return map;
}

function labelForId(labelMap, qid) {
  const row = labelMap.get(qid);
  if (!row) return null;
  return row.fr || row.en || null;
}

/**
 * @param {object} claims
 * @param {Map<string, { fr: string|null, en: string|null }>} labelMap
 * @returns {{ fields: Record<string, string>, warnings: string[] }}
 */
function extractWikidataTraitFields(claims, labelMap) {
  const fields = {};
  const warnings = [];

  const useLabels = [];
  const stmts366 = claims?.P366;
  if (Array.isArray(stmts366)) {
    for (const st of stmts366) {
      const v = st?.mainsnak?.datavalue?.value;
      const qid = v && typeof v === 'object' ? asTrimmedString(v.id) : '';
      if (!/^Q\d+$/i.test(qid)) continue;
      const norm = qid.toUpperCase().replace(/^q/, 'Q');
      const lbl = labelForId(labelMap, norm);
      if (lbl) useLabels.push(lbl);
    }
  }
  if (useLabels.length > 0) {
    const joined = [...new Set(useLabels)].join(' · ');
    fields.human_utility = joined.length > MAX_HUMAN_UTILITY_LEN
      ? `${joined.slice(0, MAX_HUMAN_UTILITY_LEN - 1)}…`
      : joined;
  }

  const geoLabels = [];
  const stmts183 = claims?.P183;
  if (Array.isArray(stmts183)) {
    for (const st of stmts183) {
      const v = st?.mainsnak?.datavalue?.value;
      const qid = v && typeof v === 'object' ? asTrimmedString(v.id) : '';
      if (!/^Q\d+$/i.test(qid)) continue;
      const norm = qid.toUpperCase().replace(/^q/, 'Q');
      const lbl = labelForId(labelMap, norm);
      if (lbl) geoLabels.push(lbl);
    }
  }
  if (geoLabels.length > 0) {
    const joined = [...new Set(geoLabels)].join(' · ');
    fields.geographic_origin = joined.length > MAX_GEOGRAPHIC_ORIGIN_LEN
      ? `${joined.slice(0, MAX_GEOGRAPHIC_ORIGIN_LEN - 1)}…`
      : joined;
  }

  if (fields.human_utility || fields.geographic_origin) {
    warnings.push('Wikidata : usages / zone (P366, P183) — à valider avant publication.');
  }

  return { fields, warnings };
}

/**
 * Enrichit depuis les claims (après choix de l’entité taxon).
 * @param {object} claims
 * @param {function(string, object): Promise<object>} fetchJson
 * @param {object} options
 * @returns {Promise<{ fields: Record<string, string>, warnings: string[] }>}
 */
async function enrichWikidataFieldsFromClaims(claims, fetchJson, options = {}) {
  const ids = collectItemIdsFromClaims(claims, TRAIT_PROPERTY_IDS);
  if (ids.length === 0) return { fields: {}, warnings: [] };
  const labelMap = await fetchWikidataLabelsForIds(ids, fetchJson, options);
  return extractWikidataTraitFields(claims, labelMap);
}

module.exports = {
  TRAIT_PROPERTY_IDS,
  collectItemIdsFromClaims,
  fetchWikidataLabelsForIds,
  extractWikidataTraitFields,
  enrichWikidataFieldsFromClaims,
};
