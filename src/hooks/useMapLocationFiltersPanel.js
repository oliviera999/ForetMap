import { useCallback, useEffect, useState } from 'react';

import { safeLocalStorageGetItem, safeLocalStorageSetItem } from '../utils/browserStorage.js';
import { TASK_FILTERS_COMPACT_MQL } from './useTaskFiltersPanel.js';

const STORAGE_KEY = 'foretmap:map:locationFiltersOpen';

function storedWideOpen() {
  return safeLocalStorageGetItem(STORAGE_KEY, '0') !== '0';
}

/** Panneau filtres carte : inline (large) ou feuille (compact), comme les tâches. */
export function useMapLocationFiltersPanel() {
  const matchesCompact = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    try {
      return Boolean(window.matchMedia(TASK_FILTERS_COMPACT_MQL).matches);
    } catch {
      return false;
    }
  };

  const [compact, setCompact] = useState(matchesCompact);
  const [open, setOpen] = useState(() => (matchesCompact() ? false : storedWideOpen()));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia(TASK_FILTERS_COMPACT_MQL);
    const apply = () => {
      const isCompact = Boolean(mql.matches);
      setCompact(isCompact);
      setOpen(isCompact ? false : storedWideOpen());
    };
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, []);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (!matchesCompact()) safeLocalStorageSetItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    if (!matchesCompact()) safeLocalStorageSetItem(STORAGE_KEY, '0');
  }, []);

  return { compact, open, toggle, close };
}
