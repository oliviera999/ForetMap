/**
 * Consentement d'affichage d'un contenu tiers dans une iframe (session de navigation).
 * Clé unique : lot C — traceurs RGPD.
 */

export const EMBED_CONSENT_STORAGE_KEY = 'foretmap.embedConsent.session.v1';

function readMap() {
  try {
    if (typeof sessionStorage === 'undefined') return {};
    const raw = sessionStorage.getItem(EMBED_CONSENT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(EMBED_CONSENT_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* stockage indisponible */
  }
}

/**
 * @param {string} hostname
 * @returns {boolean}
 */
export function hasEmbedConsentForHost(hostname) {
  const host = String(hostname || '')
    .trim()
    .toLowerCase();
  if (!host) return false;
  return readMap()[host] === true;
}

/**
 * @param {string} hostname
 */
export function grantEmbedConsentForHost(hostname) {
  const host = String(hostname || '')
    .trim()
    .toLowerCase();
  if (!host) return;
  const map = readMap();
  map[host] = true;
  writeMap(map);
}
