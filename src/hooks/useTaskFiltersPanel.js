import { useCallback, useEffect, useState } from 'react';

import { safeLocalStorageGetItem, safeLocalStorageSetItem } from '../utils/browserStorage.js';

/** En dessous de cette largeur, les filtres passent en feuille (bottom sheet). */
export const TASK_FILTERS_COMPACT_MQL = '(max-width: 1023px)';
const STORAGE_KEY = 'foretmap:tasks:filtersOpen';

/** Lecture synchrone de la media query (évite un flash de panneau ouvert au montage mobile). */
export function matchesTaskFiltersCompact() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return Boolean(window.matchMedia(TASK_FILTERS_COMPACT_MQL).matches);
  } catch {
    return false;
  }
}

/** Préférence d'ouverture du panneau, mémorisée uniquement pour l'affichage large. */
function storedWideOpen() {
  return safeLocalStorageGetItem(STORAGE_KEY, '1') !== '0';
}

/**
 * État du panneau de filtres de la vue Tâches.
 * - écran large : panneau inline, ouvert par défaut (comportement historique),
 *   repli mémorisé dans `localStorage` ;
 * - écran compact : feuille modale, toujours fermée à l'arrivée (l'ouverture est
 *   éphémère, jamais mémorisée) pour laisser les tâches visibles sans défiler.
 */
export function useTaskFiltersPanel() {
  const [compact, setCompact] = useState(matchesTaskFiltersCompact);
  const [open, setOpen] = useState(() => (matchesTaskFiltersCompact() ? false : storedWideOpen()));

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
      if (!matchesTaskFiltersCompact()) safeLocalStorageSetItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    if (!matchesTaskFiltersCompact()) safeLocalStorageSetItem(STORAGE_KEY, '0');
  }, []);

  return { compact, open, toggle, close };
}
