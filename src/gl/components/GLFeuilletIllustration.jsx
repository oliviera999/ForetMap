import { useEffect, useMemo, useState } from 'react';
import { loadGlAssetRuntime } from '../assets/index.js';
import {
  resolveFeuilletExplicitMediaUrl,
  resolveFeuilletImageUrl,
} from '../utils/glFeuilletMediaUrl.js';

export { resolveFeuilletImageUrl, resolveFeuilletExplicitMediaUrl };

export function useGlAssetsReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadGlAssetRuntime()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return ready;
}

/** Illustration « coupe » (URL explicite ou clé stable, sans convention feuillet). */
export function GLFeuilletCoupeIllustration({
  url = null,
  alt = 'Coupe pédagogique',
  figureClassName = '',
  imgClassName = '',
}) {
  const assetsReady = useGlAssetsReady();
  const src = useMemo(() => resolveFeuilletExplicitMediaUrl(url, assetsReady), [url, assetsReady]);
  if (!src) return null;
  return (
    <figure className={figureClassName || undefined}>
      <img src={src} alt={alt} loading="lazy" className={imgClassName || undefined} />
    </figure>
  );
}

export function GLFeuilletIllustration({
  feuilletCode,
  fallbackUrl = null,
  alt = '',
  figureClassName = '',
  imgClassName = '',
}) {
  const assetsReady = useGlAssetsReady();
  const src = useMemo(
    () => resolveFeuilletImageUrl(feuilletCode, fallbackUrl, assetsReady),
    [feuilletCode, fallbackUrl, assetsReady],
  );
  if (!src) return null;
  return (
    <figure className={figureClassName || undefined}>
      <img src={src} alt={alt} loading="lazy" className={imgClassName || undefined} />
    </figure>
  );
}
