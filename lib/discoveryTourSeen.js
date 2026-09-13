'use strict';

/**
 * Progression des visites guidées ForetMap (accueil OLU + parcours d'onglets),
 * stockée sur `users.discovery_tour_seen_json`.
 *
 * Forme canonique : `{ [tourKey: string]: true }` — seules les clés vraiment vues
 * sont présentes. Un merge est une union (OR) : on n'efface jamais une clé déjà vraie
 * via l'API de marquage (le client peut toujours forcer une relance locale).
 */

const MAX_TOUR_KEY_LENGTH = 64;
const MAX_TOUR_KEYS = 64;
const TOUR_KEY_RE = /^[a-z][a-z0-9_-]*$/i;

/**
 * @param {unknown} raw
 * @returns {Record<string, true>}
 */
function parseDiscoveryTourSeen(raw) {
  if (raw == null || raw === '') return {};
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch (_) {
      return {};
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [key, flag] of Object.entries(value)) {
    if (!isValidTourKey(key)) continue;
    if (flag === true || flag === 1 || flag === '1' || flag === 'true') {
      out[key] = true;
    }
  }
  return out;
}

/**
 * @param {unknown} key
 * @returns {boolean}
 */
function isValidTourKey(key) {
  if (typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (!trimmed || trimmed.length > MAX_TOUR_KEY_LENGTH) return false;
  return TOUR_KEY_RE.test(trimmed);
}

/**
 * Normalise un objet « seen » reçu du client (corps PUT).
 * @param {unknown} raw
 * @returns {{ ok: true, seen: Record<string, true> } | { ok: false, error: string }}
 */
function normalizeDiscoveryTourSeenInput(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Objet « seen » requis' };
  }
  const entries = Object.entries(raw);
  if (entries.length > MAX_TOUR_KEYS) {
    return { ok: false, error: 'Trop de parcours dans « seen »' };
  }
  const seen = {};
  for (const [key, flag] of entries) {
    if (!isValidTourKey(key)) {
      return { ok: false, error: `Clé de parcours invalide : ${key}` };
    }
    if (flag === true || flag === 1 || flag === '1' || flag === 'true') {
      seen[key.trim()] = true;
    }
  }
  return { ok: true, seen };
}

/**
 * Union de deux cartes « vu » (les clés déjà vraies restent vraies).
 * @param {Record<string, true>} base
 * @param {Record<string, true>} extra
 * @returns {Record<string, true>}
 */
function mergeDiscoveryTourSeen(base, extra) {
  return { ...(base || {}), ...(extra || {}) };
}

/**
 * @param {Record<string, true>} seen
 * @returns {string}
 */
function serializeDiscoveryTourSeen(seen) {
  return JSON.stringify(seen && typeof seen === 'object' ? seen : {});
}

module.exports = {
  MAX_TOUR_KEY_LENGTH,
  MAX_TOUR_KEYS,
  parseDiscoveryTourSeen,
  normalizeDiscoveryTourSeenInput,
  mergeDiscoveryTourSeen,
  serializeDiscoveryTourSeen,
  isValidTourKey,
};
