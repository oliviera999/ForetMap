import { useEffect, useMemo, useState } from 'react';
import { feuilletIllustration, loadGlAssetRuntime } from '../assets/index.js';

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

export function resolveFeuilletImageUrl(feuilletCode, fallbackUrl = null, assetsReady = true) {
  if (!assetsReady) return fallbackUrl || null;
  const convention = feuilletCode ? feuilletIllustration(feuilletCode) : null;
  return convention || fallbackUrl || null;
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
