import { useEffect, useState } from 'react';

import { apiGL } from '../services/apiGL.js';

/**
 * Configuration du narrateur OLU pour GL (`GET /api/gl/content/narrator`).
 *
 * **Le réglage est partagé avec ForetMap** (`content.help.narrator`) : même personnage,
 * mêmes portraits, une seule saisie côté studio ForetMap. GL n'appelle jamais
 * `/api/settings/*` — la lecture reste sous `/api/gl/*`, l'isolement runtime est intact.
 *
 * Voir `docs/MASCOT_NARRATEUR_OLU.md` §8.2 (arbitrage révisé) et §9.4 (réversibilité).
 */

let cachedNarrator = null;
let loadPromise = null;

/** Repli hors ligne : la silhouette SVG suffit, aucune requête ne bloque l'affichage. */
const FALLBACK_NARRATOR = Object.freeze({
  enabled: true,
  speakerName: 'OLU',
  fallbackSilhouette: 'olu',
  portraits: {},
});

async function fetchGlNarrator() {
  if (cachedNarrator) return cachedNarrator;
  if (!loadPromise) {
    loadPromise = apiGL('/api/gl/content/narrator')
      .then((data) => {
        cachedNarrator = data && typeof data === 'object' ? data : FALLBACK_NARRATOR;
        return cachedNarrator;
      })
      .catch(() => {
        cachedNarrator = FALLBACK_NARRATOR;
        return cachedNarrator;
      })
      .finally(() => {
        loadPromise = null;
      });
  }
  return loadPromise;
}

/** Invalide le cache client (après édition du réglage côté ForetMap). */
export function invalidateGlNarratorCache() {
  cachedNarrator = null;
  loadPromise = null;
}

/**
 * @returns {{ narrator: object|null, speakerName: string, ready: boolean }}
 *   `speakerName` est vide tant que le narrateur est éteint ou sans nom (§9.4) : la
 *   bulle se passe alors d'étiquette de locuteur sans autre changement.
 */
export function useGlNarrator() {
  const [narrator, setNarrator] = useState(cachedNarrator);

  useEffect(() => {
    let cancelled = false;
    fetchGlNarrator().then((data) => {
      if (!cancelled) setNarrator(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const speakerName = narrator && narrator.enabled !== false ? narrator.speakerName || '' : '';
  return { narrator, speakerName, ready: !!narrator };
}
