'use strict';

/**
 * Proposition de mise à jour GBIF (lecture seule) — match `api.gbif.org/v1/species/match`.
 * Aucune écriture BDD : le client confirme via PUT /api/plants/:id.
 */

const { asTrimmedString, asOptionalText } = require('./shared/stringHelpers');

function parsePositiveInt(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

/**
 * @param {string} query
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Promise<{
 *   matchType: string,
 *   confidence: number|null,
 *   proposal: Record<string, string|number|null>,
 *   source_url: string,
 *   warnings: string[],
 * }>}
 */
async function matchGbifSpeciesProposal(query, options = {}) {
  const q = asTrimmedString(query);
  if (!q) {
    return {
      matchType: 'NONE',
      confidence: null,
      proposal: {},
      source_url: '',
      warnings: ['Requête vide'],
    };
  }
  const url = `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(q)}`;
  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch indisponible');
  }
  const timeoutMs = Math.max(500, Number(options.timeoutMs) || 8000);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let data;
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      signal: ac.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'ForetMap/1.0 (gbif-match)',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } finally {
    clearTimeout(timer);
  }

  const matchType = asTrimmedString(data?.matchType) || 'NONE';
  const warnings = [];
  if (matchType.toUpperCase() === 'NONE') {
    warnings.push('GBIF: aucune correspondance');
  }

  const usageKey = parsePositiveInt(data?.usageKey);
  const acceptedUsageKey = parsePositiveInt(data?.acceptedUsageKey) || usageKey;
  const scientificName = asOptionalText(data?.scientificName);
  const canonicalName = asOptionalText(data?.canonicalName);
  const accepted = asOptionalText(data?.species) || canonicalName || scientificName;

  const proposal = {
    scientific_name: scientificName || canonicalName || null,
    accepted_scientific_name: accepted || null,
    gbif_key: usageKey,
    gbif_accepted_key: acceptedUsageKey,
    taxon_phylum: asOptionalText(data?.phylum) || null,
    taxon_class: asOptionalText(data?.class) || null,
    taxon_order: asOptionalText(data?.order) || null,
    taxon_family_latin: asOptionalText(data?.family) || null,
    taxon_genus: asOptionalText(data?.genus) || null,
    taxon_kingdom: asOptionalText(data?.kingdom) || null,
    gbif_checked_at: new Date().toISOString().slice(0, 10),
  };

  // Si le nom d'usage et le nom accepté sont identiques, ne pas forcer accepted_*
  if (
    proposal.scientific_name &&
    proposal.accepted_scientific_name &&
    String(proposal.scientific_name).toLowerCase() ===
      String(proposal.accepted_scientific_name).toLowerCase()
  ) {
    proposal.accepted_scientific_name = null;
  }

  const confidenceRaw =
    data?.confidence != null && data.confidence !== '' ? Number(data.confidence) : null;

  return {
    matchType,
    confidence: Number.isFinite(confidenceRaw) ? confidenceRaw : null,
    proposal,
    source_url: url,
    gbif_page:
      acceptedUsageKey != null
        ? `https://www.gbif.org/species/${acceptedUsageKey}`
        : usageKey != null
          ? `https://www.gbif.org/species/${usageKey}`
          : null,
    warnings,
  };
}

module.exports = {
  matchGbifSpeciesProposal,
};
