import { useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';

let listCache = null;

export function useGlLoreGlossaryLinkIndex(authToken) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!authToken) {
      setItems([]);
      return undefined;
    }
    if (listCache) {
      setItems(listCache);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGL('/api/gl/lore/glossary/link-index');
        const nextItems = Array.isArray(data?.items) ? data.items : [];
        if (cancelled) return;
        listCache = nextItems;
        setItems(nextItems);
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => { cancelled = true; };
  }, [authToken]);

  return items;
}

export function clearGlLoreGlossaryLinkIndexCache() {
  listCache = null;
}
