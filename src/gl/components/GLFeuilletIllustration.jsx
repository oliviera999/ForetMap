import { useEffect, useMemo, useState } from 'react';
import { loadGlAssetRuntime } from '../assets/index.js';
import { FallbackImage } from '../../shared/components/FallbackImage.jsx';
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

/**
 * Figure d'illustration G&L (chapitre, scène, feuillet, coupe) : un seul motif au lieu de
 * quatre copies. Une image introuvable retire la figure au lieu d'une icône cassée.
 */
export function GLIllustrationFigure({
  src,
  alt = '',
  caption = '',
  figureClassName = '',
  imgClassName = '',
}) {
  const [failedSrc, setFailedSrc] = useState('');
  if (!src || failedSrc === src) return null;
  return (
    <figure className={figureClassName || undefined}>
      <FallbackImage
        src={src}
        alt={alt}
        className={imgClassName || undefined}
        onAllFailed={() => setFailedSrc(src)}
      />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
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
  return (
    <GLIllustrationFigure
      src={src}
      alt={alt}
      figureClassName={figureClassName}
      imgClassName={imgClassName}
    />
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
  return (
    <GLIllustrationFigure
      src={src}
      alt={alt}
      figureClassName={figureClassName}
      imgClassName={imgClassName}
    />
  );
}
