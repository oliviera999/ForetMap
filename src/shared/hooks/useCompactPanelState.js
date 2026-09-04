import { useCallback, useEffect, useState } from 'react';

import { safeLocalStorageGetItem, safeLocalStorageSetItem } from '../platform/browserStorage.js';

/**
 * En dessous de cette largeur, un panneau « compactable » passe en feuille basse (miroir
 * de la bascule desktop 1023/1024 px documentée dans `src/index.css`).
 */
export const COMPACT_PANEL_QUERY = '(max-width: 1023px)';

/** Lecture synchrone de la media query (évite un flash de panneau ouvert au montage mobile). */
export function matchesCompactPanel(query = COMPACT_PANEL_QUERY) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return Boolean(window.matchMedia(query).matches);
  } catch {
    return false;
  }
}

function readStoredWideOpen(storageKey, wideDefaultOpen) {
  if (!storageKey) return wideDefaultOpen;
  return safeLocalStorageGetItem(storageKey, wideDefaultOpen ? '1' : '0') !== '0';
}

function writeStoredWideOpen(storageKey, open) {
  if (!storageKey) return;
  safeLocalStorageSetItem(storageKey, open ? '1' : '0');
}

/**
 * État d'un panneau qui est inline sur écran large et feuille basse sur écran compact
 * (filtres des tâches, filtres carte…). Kit d'interface, lot 3.
 *
 * - écran large : ouvert par défaut selon `wideDefaultOpen`, repli/ouverture mémorisés dans
 *   `localStorage` sous `storageKey` (aucune mémorisation sans clé) ;
 * - écran compact : feuille modale, toujours fermée à l'arrivée et à chaque bascule de
 *   largeur ; l'ouverture y est éphémère, jamais mémorisée.
 *
 * @param {object} [options]
 * @param {string} [options.storageKey] clé `localStorage` de la préférence « large »
 * @param {boolean} [options.wideDefaultOpen=true] ouvert par défaut en large
 * @param {string} [options.compactQuery=COMPACT_PANEL_QUERY]
 * @returns {{ compact: boolean, open: boolean, toggle: () => void, close: () => void, openPanel: () => void }}
 */
export function useCompactPanelState({
  storageKey = '',
  wideDefaultOpen = true,
  compactQuery = COMPACT_PANEL_QUERY,
} = {}) {
  const [compact, setCompact] = useState(() => matchesCompactPanel(compactQuery));
  const [open, setOpen] = useState(() =>
    matchesCompactPanel(compactQuery) ? false : readStoredWideOpen(storageKey, wideDefaultOpen),
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    let mql;
    try {
      mql = window.matchMedia(compactQuery);
    } catch {
      return undefined;
    }
    const apply = () => {
      const isCompact = Boolean(mql.matches);
      setCompact(isCompact);
      setOpen(isCompact ? false : readStoredWideOpen(storageKey, wideDefaultOpen));
    };
    apply();
    mql.addEventListener?.('change', apply);
    return () => mql.removeEventListener?.('change', apply);
  }, [compactQuery, storageKey, wideDefaultOpen]);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (!matchesCompactPanel(compactQuery)) writeStoredWideOpen(storageKey, next);
      return next;
    });
  }, [compactQuery, storageKey]);

  const close = useCallback(() => {
    setOpen(false);
    if (!matchesCompactPanel(compactQuery)) writeStoredWideOpen(storageKey, false);
  }, [compactQuery, storageKey]);

  const openPanel = useCallback(() => {
    setOpen(true);
    if (!matchesCompactPanel(compactQuery)) writeStoredWideOpen(storageKey, true);
  }, [compactQuery, storageKey]);

  return { compact, open, toggle, close, openPanel };
}
