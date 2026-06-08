import { useMemo } from 'react';
import { chapterIllustration, chapterIllustrations } from '../assets/index.js';
import { useGlAssetsReady } from './GLFeuilletIllustration.jsx';

/**
 * Résout l'illustration de couverture d'un chapitre via la convention médiathèque
 * (`recit_0N-chapN_*`), avec repli sur une URL explicite éventuelle.
 */
export function resolveChapterCoverUrl(chapterNumber, fallbackUrl = null, assetsReady = true) {
  if (!assetsReady) return fallbackUrl || null;
  const convention = chapterNumber != null ? chapterIllustration(chapterNumber) : null;
  return convention || fallbackUrl || null;
}

/** Couverture d'un chapitre (première scène de récit). Rien si aucune ressource. */
export function GLChapterIllustration({
  chapterNumber,
  fallbackUrl = null,
  alt = '',
  figureClassName = '',
  imgClassName = '',
}) {
  const assetsReady = useGlAssetsReady();
  const src = useMemo(
    () => resolveChapterCoverUrl(chapterNumber, fallbackUrl, assetsReady),
    [chapterNumber, fallbackUrl, assetsReady],
  );
  if (!src) return null;
  return (
    <figure className={figureClassName || undefined}>
      <img src={src} alt={alt} loading="lazy" className={imgClassName || undefined} />
    </figure>
  );
}

/**
 * Galerie de toutes les scènes de récit liées au chapitre (médiathèque).
 * Rien si aucune ressource conventionnelle n'est trouvée.
 */
export function GLChapterScenes({
  chapterNumber,
  alt = '',
  className = '',
  figureClassName = '',
  imgClassName = '',
}) {
  const assetsReady = useGlAssetsReady();
  const scenes = useMemo(
    () => (assetsReady && chapterNumber != null ? chapterIllustrations(chapterNumber) : []),
    [chapterNumber, assetsReady],
  );
  if (!scenes.length) return null;
  return (
    <div className={className || undefined}>
      {scenes.map((scene) => (
        <figure key={scene.key} className={figureClassName || undefined}>
          <img src={scene.url} alt={alt} loading="lazy" className={imgClassName || undefined} />
        </figure>
      ))}
    </div>
  );
}
