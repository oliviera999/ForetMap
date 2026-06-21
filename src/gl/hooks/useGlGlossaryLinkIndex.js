import { useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';

const listCache = new Map();

function cacheKey(biomeSlugs) {
  const slugs = Array.isArray(biomeSlugs) ? biomeSlugs.filter(Boolean).sort().join(',') : '';
  return slugs || '__all__';
}

/**
 * Charge la liste glossaire pour l’auto-lien (tous rôles GL authentifiés).
 * @param {string|null|undefined} authToken
 * @param {string[]} biomeSlugs
 */
export function useGlGlossaryLinkIndex(authToken, biomeSlugs = []) {
  const [items, setItems] = useState([]);
  const slugKey = useMemo(
    () => (Array.isArray(biomeSlugs) ? biomeSlugs.filter(Boolean).sort().join(',') : ''),
    [biomeSlugs],
  );

  useEffect(() => {
    if (!authToken) {
      setItems([]);
      return undefined;
    }

    const key = cacheKey(biomeSlugs);
    const cached = listCache.get(key);
    if (cached) {
      setItems(cached);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams();
        if (slugKey) params.set('biomeSlugs', slugKey);
        const data = await apiGL(`/api/gl/glossary?${params.toString()}`);
        const nextItems = Array.isArray(data?.items) ? data.items : [];
        if (cancelled) return;
        listCache.set(key, nextItems);
        setItems(nextItems);
      } catch {
        if (!cancelled) setItems([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authToken, slugKey, biomeSlugs]);

  return items;
}

/** Vide le cache (tests). */
export function clearGlGlossaryLinkIndexCache() {
  listCache.clear();
}
