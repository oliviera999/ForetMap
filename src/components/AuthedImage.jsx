import { useEffect, useRef, useState } from 'react';
import { acquireAuthedImage, releaseAuthedImage } from '../services/authedImageCache.js';

/**
 * Affiche une image servie derrière `requireAuth` (Bearer). Un `<img src="/api/…">`
 * n'envoie pas le jeton localStorage — d'où 401 sur les photos d'observations / journaux.
 *
 * Le téléchargement passe par le cache partagé (`services/authedImageCache.js`). Avec
 * `loading="lazy"`, il n'est lancé qu'à l'approche de la zone visible. Pendant le
 * chargement et en cas d'échec, un emplacement de même classe garde la place de l'image.
 */
export function AuthedImage({ src, alt = '', loading, className = '', style, ...imgProps }) {
  const [state, setState] = useState({ src: '', url: '', failed: false });
  const [visible, setVisible] = useState(loading !== 'lazy');
  const placeholderRef = useRef(null);

  useEffect(() => {
    if (visible) return undefined;
    const node = placeholderRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (items) => {
        if (items.some((item) => item.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!src || !visible) return undefined;
    let cancelled = false;
    const { key, promise } = acquireAuthedImage(src);
    promise.then(
      (url) => {
        if (!cancelled) setState({ src, url, failed: false });
      },
      () => {
        if (!cancelled) setState({ src, url: '', failed: true });
      },
    );
    return () => {
      cancelled = true;
      releaseAuthedImage(key);
    };
  }, [src, visible]);

  const ready = state.src === src && state.url;
  if (!src) return null;
  if (!ready) {
    const failed = state.src === src && state.failed;
    return (
      <span
        ref={placeholderRef}
        className={`authed-image-placeholder${failed ? ' is-failed' : ''} ${className}`.trim()}
        style={style}
        role={alt ? 'img' : undefined}
        aria-label={alt ? (failed ? `${alt} (image indisponible)` : alt) : undefined}
        aria-hidden={alt ? undefined : 'true'}
        data-testid="authed-image-placeholder"
      >
        {failed ? <span aria-hidden="true">🖼️</span> : null}
      </span>
    );
  }
  return (
    <img
      src={state.url}
      alt={alt}
      decoding="async"
      className={className || undefined}
      style={style}
      {...imgProps}
    />
  );
}
