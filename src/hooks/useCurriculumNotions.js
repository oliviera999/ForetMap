import { useEffect, useState } from 'react';
import { api } from '../services/api';

/**
 * Référentiel des notions des programmes (migration 273), partagé par les écrans Quiz et
 * Glossaire.
 *
 * Même patron que `useGlossaryLinkIndex` : un seul chargement pour toute la session (le
 * référentiel change quand un professeur l'édite, pas pendant qu'un élève travaille), et
 * échec silencieux — sans notions, les menus perdent une entrée, aucun écran ne casse.
 */

/** @type {Array<object>|null} */
let cachedNotions = null;
/** @type {Promise<Array<object>>|null} */
let pendingLoad = null;

function loadCurriculumNotions() {
  if (cachedNotions) return Promise.resolve(cachedNotions);
  if (!pendingLoad) {
    pendingLoad = api('/api/curriculum/notions')
      .then((data) => {
        const items = Array.isArray(data?.items) ? data.items : [];
        cachedNotions = items;
        return items;
      })
      .catch(() => [])
      .finally(() => {
        pendingLoad = null;
      });
  }
  return pendingLoad;
}

/** Réinitialise le cache mémoire (après édition des rattachements, ou en test). */
export function resetCurriculumNotionsCache() {
  cachedNotions = null;
  pendingLoad = null;
}

/**
 * @param {{ enabled?: boolean }} [options] `enabled: false` n'effectue aucun appel.
 * @returns {Array<object>} notions ordonnées par progression scolaire, effectifs compris.
 */
export function useCurriculumNotions({ enabled = true } = {}) {
  const [notions, setNotions] = useState(() => cachedNotions || []);

  useEffect(() => {
    if (!enabled) return undefined;
    if (cachedNotions) {
      setNotions(cachedNotions);
      return undefined;
    }
    let cancelled = false;
    loadCurriculumNotions().then((loaded) => {
      if (!cancelled) setNotions(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return notions;
}
