import { useEffect, useMemo, useState } from 'react';
import { acquireAuthedImage, releaseAuthedImage } from '../services/authedImageCache.js';

export function isProtectedImageSrc(src) {
  const s = String(src || '').trim();
  return (
    s.startsWith('/api/user-journal/assets/') ||
    s.startsWith('/uploads/user-journal/') ||
    s.startsWith('/uploads/observations/')
  );
}

/**
 * Sépare le HTML en une version « sans source protégée » (affichable tout de suite, sans
 * requête vouée au 401) et la liste des adresses à charger avec le jeton.
 */
function stripProtectedSources(source) {
  if (!source || typeof DOMParser === 'undefined') return { html: source, srcs: [] };
  const doc = new DOMParser().parseFromString(source, 'text/html');
  const srcs = [];
  for (const img of doc.querySelectorAll('img[src]')) {
    const src = img.getAttribute('src') || '';
    if (!isProtectedImageSrc(src)) continue;
    img.setAttribute('data-authed-src', src);
    img.removeAttribute('src');
    if (!srcs.includes(src)) srcs.push(src);
  }
  return { html: srcs.length ? doc.body.innerHTML : source, srcs };
}

function applySources(html, resolved) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const img of doc.querySelectorAll('img[data-authed-src]')) {
    const src = img.getAttribute('data-authed-src');
    const url = resolved.get(src);
    if (url) {
      img.setAttribute('src', url);
      img.removeAttribute('data-authed-src');
    } else if (url === null) {
      img.remove();
    }
  }
  return doc.body.innerHTML;
}

/**
 * Réécrit les `<img>` d'un fragment HTML servi derrière JWT (carnet, observations).
 * Un `dangerouslySetInnerHTML` n'envoie pas le Bearer — d'où 401 / 403.
 * Les images passent par le cache partagé : retaper le texte d'un article ne
 * re-télécharge pas ses illustrations.
 */
export function useAuthedHtmlImages(html) {
  const stripped = useMemo(() => stripProtectedSources(html || ''), [html]);
  const [resolved, setResolved] = useState(() => new Map());
  const srcsKey = stripped.srcs.join('\n');

  useEffect(() => {
    const srcs = srcsKey ? srcsKey.split('\n') : [];
    if (srcs.length === 0) return undefined;
    let cancelled = false;
    const keys = srcs.map((src) => {
      const { key, promise } = acquireAuthedImage(src);
      promise.then(
        (url) => {
          if (!cancelled) setResolved((prev) => new Map(prev).set(src, url));
        },
        () => {
          if (!cancelled) setResolved((prev) => new Map(prev).set(src, null));
        },
      );
      return key;
    });
    return () => {
      cancelled = true;
      for (const key of keys) releaseAuthedImage(key);
    };
  }, [srcsKey]);

  return useMemo(() => {
    if (stripped.srcs.length === 0) return stripped.html;
    return applySources(stripped.html, resolved);
  }, [stripped, resolved]);
}
