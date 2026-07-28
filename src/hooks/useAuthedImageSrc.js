import { useEffect, useMemo, useState } from 'react';
import { getAuthToken, withAppBase } from '../services/api.js';

function normalizePath(path) {
  return path == null ? '' : String(path).trim();
}

/** URLs affichables sans Bearer (statique public, data/blob, absolu). */
function isPassthroughImageUrl(raw) {
  return (
    raw.startsWith('blob:') ||
    raw.startsWith('data:') ||
    /^https?:\/\//i.test(raw) ||
    raw.startsWith('/uploads/')
  );
}

/**
 * Charge une URL d'image protégée (Bearer JWT) en blob object URL.
 *
 * Pourquoi : après l'audit B3, `GET /api/tasks/:id/logs/:logId/image` exige un compte
 * connecté, mais un `<img src="/api/...">` n'envoie jamais l'`Authorization` stockée
 * en localStorage → 403 et photos invisibles. Même schéma pour
 * `GET /api/observations/:id/image`.
 *
 * Les URLs déjà publiques (`/uploads/…`, `http(s):`, `data:`, `blob:`) sont renvoyées
 * telles quelles (pas de fetch), de façon synchrone.
 *
 * @param {string|null|undefined} path
 * @returns {{ src: string|null, loading: boolean, error: boolean }}
 */
export function useAuthedImageSrc(path) {
  const raw = normalizePath(path);
  const passthrough = useMemo(() => {
    if (!raw) return null;
    return isPassthroughImageUrl(raw) ? raw : null;
  }, [raw]);

  const [fetchedSrc, setFetchedSrc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!raw || passthrough) {
      setFetchedSrc(null);
      setLoading(false);
      setError(false);
      return undefined;
    }

    let cancelled = false;
    let objectUrl = null;
    setLoading(true);
    setError(false);
    setFetchedSrc(null);

    (async () => {
      const headers = new Headers();
      const token = getAuthToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const res = await fetch(withAppBase(raw), { method: 'GET', headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setFetchedSrc(objectUrl);
      setLoading(false);
    })().catch(() => {
      if (cancelled) return;
      setFetchedSrc(null);
      setLoading(false);
      setError(true);
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [raw, passthrough]);

  return { src: passthrough || fetchedSrc, loading, error };
}

export { isPassthroughImageUrl };
