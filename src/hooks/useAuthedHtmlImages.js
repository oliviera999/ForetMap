import { useEffect, useState } from 'react';
import { getAuthToken, withAppBase } from '../services/api';

function isProtectedJournalSrc(src) {
  const s = String(src || '').trim();
  return (
    s.startsWith('/api/user-journal/assets/') ||
    s.startsWith('/uploads/user-journal/') ||
    s.startsWith('/uploads/observations/')
  );
}

/**
 * Réécrit les `<img>` d'un fragment HTML servi derrière JWT (carnet).
 * Un `dangerouslySetInnerHTML` n'envoie pas le Bearer — d'où 401 / 403.
 */
export function useAuthedHtmlImages(html) {
  const [rewritten, setRewritten] = useState(html || '');

  useEffect(() => {
    const source = html || '';
    if (!source || typeof DOMParser === 'undefined') {
      setRewritten(source);
      return undefined;
    }
    let cancelled = false;
    const objectUrls = [];
    const doc = new DOMParser().parseFromString(source, 'text/html');
    const imgs = [...doc.querySelectorAll('img[src]')].filter((img) =>
      isProtectedJournalSrc(img.getAttribute('src')),
    );
    if (imgs.length === 0) {
      setRewritten(source);
      return undefined;
    }

    const token = getAuthToken();
    Promise.all(
      imgs.map(async (img) => {
        const src = img.getAttribute('src') || '';
        const headers = new Headers();
        if (token) headers.set('Authorization', `Bearer ${token}`);
        const url = src.startsWith('http') || src.startsWith('blob:') ? src : withAppBase(src);
        const res = await fetch(url, { headers });
        if (!res.ok) {
          img.remove();
          return;
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        objectUrls.push(objectUrl);
        img.setAttribute('src', objectUrl);
      }),
    )
      .then(() => {
        if (!cancelled) setRewritten(doc.body.innerHTML);
      })
      .catch(() => {
        if (!cancelled) setRewritten(source);
      });

    return () => {
      cancelled = true;
      for (const objectUrl of objectUrls) URL.revokeObjectURL(objectUrl);
    };
  }, [html]);

  return rewritten;
}
