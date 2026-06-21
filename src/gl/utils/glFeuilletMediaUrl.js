import { img, feuilletIllustration, GL_ASSET_PLACEHOLDER_URL } from '../assets/index.js';
import { isLegacyGlMediaUrl, resolveLegacyGlMediaUrl } from './glLegacyMediaUrl.js';

function isResolvableMediaUrl(url) {
  return Boolean(url) && url !== GL_ASSET_PLACEHOLDER_URL;
}

/**
 * Résout une URL explicite de feuillet (colonne `image_url` / `image_coupe_url`
 * ou clé stable médiathèque) vers une URL servable.
 */
export function resolveFeuilletExplicitMediaUrl(url, assetsReady = true) {
  const raw = String(url || '').trim();
  if (!raw) return null;

  if (!assetsReady) {
    if (raw.startsWith('/') || /^https?:\/\//i.test(raw)) return raw;
    return null;
  }

  if (isLegacyGlMediaUrl(raw)) {
    const resolved = resolveLegacyGlMediaUrl(raw, (stableKey) => {
      const hit = img(stableKey);
      return isResolvableMediaUrl(hit) ? hit : null;
    });
    if (isResolvableMediaUrl(resolved)) return resolved;
    if (raw.startsWith('/') || /^https?:\/\//i.test(raw)) return raw;
    return null;
  }

  if (raw.startsWith('/') || /^https?:\/\//i.test(raw)) return raw;

  const fromKey = img(raw);
  return isResolvableMediaUrl(fromKey) ? fromKey : null;
}

/**
 * Illustration d'un feuillet : convention `recit_feuillet-action_<code>_*`
 * puis repli sur l'URL explicite (chemin, clé stable ou legacy).
 */
export function resolveFeuilletImageUrl(feuilletCode, fallbackUrl = null, assetsReady = true) {
  const explicitFallback = resolveFeuilletExplicitMediaUrl(fallbackUrl, assetsReady);
  if (!assetsReady) return explicitFallback;
  const convention = feuilletCode ? feuilletIllustration(feuilletCode) : null;
  return convention || explicitFallback || null;
}
