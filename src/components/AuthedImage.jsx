import { useEffect, useState } from 'react';
import { getAuthToken, withAppBase } from '../services/api';

/**
 * Affiche une image servie derrière `requireAuth` (Bearer). Un `<img src="/api/…">`
 * n'envoie pas le jeton localStorage — d'où 401 sur les photos d'observations / journaux.
 */
export function AuthedImage({ src, alt = '', ...imgProps }) {
  const [blobUrl, setBlobUrl] = useState('');

  useEffect(() => {
    if (!src) {
      setBlobUrl('');
      return undefined;
    }
    let cancelled = false;
    let objectUrl = '';
    const headers = new Headers();
    const token = getAuthToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const url = src.startsWith('http') || src.startsWith('blob:') ? src : withAppBase(src);
    fetch(url, { headers })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setBlobUrl('');
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (!blobUrl) return null;
  return <img src={blobUrl} alt={alt} {...imgProps} />;
}
