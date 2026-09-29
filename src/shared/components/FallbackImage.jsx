import { useState } from 'react';
import { resolveExternalImageUrl } from '../privacy/externalAssets.js';
import { uploadThumbUrl } from '../utils/uploadThumbUrl.js';

/**
 * Adresses à essayer dans l'ordre pour afficher `src` en petit : vignette serveur
 * (`uploads/…thumb.jpg`) ou vignette Wikimedia dimensionnée, puis l'original.
 * @param {string} src
 * @param {{ thumbSrc?: string, thumbWidth?: number }} [options]
 * @returns {string[]}
 */
export function thumbCandidates(src, { thumbSrc, thumbWidth } = {}) {
  const original = String(src || '').trim();
  const explicit = String(thumbSrc || '').trim();
  const list = [
    explicit ? resolveExternalImageUrl(explicit) : '',
    thumbWidth ? uploadThumbUrl(original) || '' : '',
    thumbWidth ? resolveExternalImageUrl(original, { width: thumbWidth }) : '',
    original ? resolveExternalImageUrl(original) : '',
  ];
  return [...new Set(list.filter(Boolean))];
}

/**
 * `<img>` qui essaie ses adresses dans l'ordre (vignette, puis original) et affiche `fallback`
 * quand toutes échouent — au lieu d'une icône d'image cassée
 * (`docs/AUDIT_AFFICHAGE_PHOTOS_2026-09-29.md` PH-M1).
 *
 * @param {object} props
 * @param {string} props.src original
 * @param {string} [props.thumbSrc] vignette connue (ex. `thumb_url` d'une photo de zone)
 * @param {number} [props.thumbWidth] largeur d'affichage : active les vignettes dérivées
 * @param {import('react').ReactNode} [props.fallback] contenu si aucune adresse ne charge
 * @param {() => void} [props.onAllFailed] appelé quand la dernière adresse échoue
 */
export function FallbackImage({
  src,
  thumbSrc,
  thumbWidth,
  fallback = null,
  onAllFailed,
  alt = '',
  loading = 'lazy',
  ...imgProps
}) {
  const candidates = thumbCandidates(src, { thumbSrc, thumbWidth });
  const chainKey = candidates.join('\u0000');
  const [failure, setFailure] = useState({ key: '', count: 0 });
  const failedCount = failure.key === chainKey ? failure.count : 0;
  const current = candidates[failedCount] || '';
  if (!current) return fallback;
  return (
    <img
      key={current}
      src={current}
      alt={alt}
      loading={loading}
      decoding="async"
      {...imgProps}
      onError={() => {
        setFailure({ key: chainKey, count: failedCount + 1 });
        if (failedCount + 1 >= candidates.length) onAllFailed?.();
      }}
    />
  );
}
