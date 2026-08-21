import { useEffect, useState } from 'react';
import { api } from '../services/api';

/**
 * Index des termes actifs du glossaire ForetMap, partagé par tous les écrans.
 *
 * Pendant de `useGlGlossaryLinkIndex` (GL). Un seul chargement pour toute la
 * session : le résultat (et la promesse en cours) est mémorisé au niveau du
 * module, donc quatre écrans montés en même temps ne déclenchent qu'une requête.
 * L'échec est silencieux : index vide = pas d'auto-liens, jamais d'écran cassé.
 */

/** @type {Array<{ glossary_code: string, terme: string, variantes?: string }>|null} */
let cachedItems = null;
/** @type {Promise<Array>|null} */
let pendingLoad = null;

function loadGlossaryLinkIndex() {
  if (cachedItems) return Promise.resolve(cachedItems);
  if (!pendingLoad) {
    pendingLoad = api('/api/glossary/terms')
      .then((data) => {
        const items = Array.isArray(data?.items) ? data.items : [];
        cachedItems = items;
        return items;
      })
      .catch(() => [])
      .finally(() => {
        pendingLoad = null;
      });
  }
  return pendingLoad;
}

/** Réinitialise le cache mémoire (tests, ou rechargement forcé de l'index). */
export function resetGlossaryLinkIndexCache() {
  cachedItems = null;
  pendingLoad = null;
}

/**
 * @param {{ enabled?: boolean }} [options] `enabled: false` n'effectue aucun appel.
 * @returns {Array<{ glossary_code: string, terme: string, variantes?: string }>}
 */
export function useGlossaryLinkIndex({ enabled = true } = {}) {
  const [items, setItems] = useState(() => cachedItems || []);

  useEffect(() => {
    if (!enabled) return undefined;
    if (cachedItems) {
      setItems(cachedItems);
      return undefined;
    }
    let cancelled = false;
    loadGlossaryLinkIndex().then((loaded) => {
      if (!cancelled) setItems(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return items;
}
