import { resolveLegacyGlMediaUrl } from './glLegacyMediaUrl.js';

/**
 * Résout l’URL affichée d’une icône de repère GL (clé stable, local:/, legacy gl-*).
 * @param {string|null|undefined} rawUrl
 * @param {{ assetsReady?: boolean, resolveStableKey?: (key: string) => string|null }} [options]
 * @returns {string|null}
 */
export function resolveGlMarkerIconDisplayUrl(rawUrl, options = {}) {
  const { assetsReady = true, resolveStableKey } = options;
  const raw = String(rawUrl || '').trim();
  if (!raw) return null;

  const tryStable = (key) => {
    if (typeof resolveStableKey !== 'function') return null;
    const resolved = resolveStableKey(String(key || '').trim());
    return resolved || null;
  };

  if (raw.startsWith('local:/')) {
    return raw.slice('local:'.length) || null;
  }

  if (raw.startsWith('/uploads/') || /^https?:\/\//i.test(raw)) {
    if (!assetsReady) return raw;
    return resolveLegacyGlMediaUrl(raw, tryStable) || raw;
  }

  return tryStable(raw);
}
