'use strict';

/**
 * Helpers communs aux deux routeurs « lieu » (`routes/zones.js`, `routes/map.js`), qui les
 * dupliquaient à l'identique (audit du 13/09/2026, §4.4).
 */
const { withLocationAudienceFields } = require('./locationAudience');
const { withLocationSurfaceFields } = require('./locationSurfaces');

/**
 * Liste d'êtres vivants d'un lieu : tableau, JSON de tableau ou chaîne `a, b` → tableau
 * dédoublonné ; `fallback` (nom d'espèce hérité) si la liste est vide.
 */
function normalizeLivingBeings(input, fallback = '') {
  const base = Array.isArray(input)
    ? input
    : typeof input === 'string' && input.trim()
      ? (() => {
          try {
            const parsed = JSON.parse(input);
            if (Array.isArray(parsed)) return parsed;
          } catch (_) {}
          return input.split(',');
        })()
      : [];
  const cleaned = [...new Set(base.map((v) => String(v || '').trim()).filter(Boolean))];
  if (cleaned.length === 0 && fallback && String(fallback).trim()) return [String(fallback).trim()];
  return cleaned;
}

/** Ligne SQL d'un lieu → objet API (champs d'audience et de surfaces d'affichage dérivés). */
function serializeLocationRow(row) {
  return withLocationAudienceFields(withLocationSurfaceFields(row));
}

module.exports = { normalizeLivingBeings, serializeLocationRow };
