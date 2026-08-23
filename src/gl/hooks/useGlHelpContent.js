import { useEffect, useState } from 'react';

import { apiGL } from '../services/apiGL.js';
import { resolveRoleTextFrom } from '../../shared/help/roleText.js';

let cachedHelpConfig = null;
let loadPromise = null;

async function fetchGlHelpConfig() {
  if (cachedHelpConfig) return cachedHelpConfig;
  if (!loadPromise) {
    loadPromise = apiGL('/api/gl/content/help')
      .then((data) => {
        cachedHelpConfig = data && typeof data === 'object' ? data : { entries: {} };
        return cachedHelpConfig;
      })
      .catch(() => {
        cachedHelpConfig = { entries: {} };
        return cachedHelpConfig;
      })
      .finally(() => {
        loadPromise = null;
      });
  }
  return loadPromise;
}

/** Invalide le cache client (après édition admin). */
export function invalidateGlHelpConfigCache() {
  cachedHelpConfig = null;
  loadPromise = null;
}

/**
 * Charge la config d'aide GL (`GET /api/gl/content/help`) et expose l'entrée pour une clé.
 *
 * `isStaff` sélectionne la variante MJ (`bodyMj`) là où l'entrée en propose une : un même
 * onglet — la carte, le carnet, le marché — n'appelle pas les mêmes gestes selon qu'on
 * y joue ou qu'on l'anime. Sans variante, tout le monde lit le même texte.
 *
 * @param {string} helpKey ex. `tab:maps`
 * @param {object} [options]
 * @param {boolean} [options.isStaff] vrai pour un MJ ou un admin.
 */
export function useGlHelpContent(helpKey, { isStaff = false } = {}) {
  const [config, setConfig] = useState(cachedHelpConfig);

  useEffect(() => {
    let cancelled = false;
    fetchGlHelpConfig().then((data) => {
      if (!cancelled) setConfig(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const entry = config?.entries?.[helpKey] || null;
  return {
    title: entry?.title || 'Aide GL',
    body: resolveRoleTextFrom(entry, isStaff, { base: 'body', staff: 'bodyMj' }),
    ready: !!config,
  };
}

/**
 * Vrai une fois la configuration d'aide chargée (ou son échec absorbé).
 *
 * Sert à la visite guidée : son étape de relance vise le bouton « ? », lequel n'est
 * rendu qu'une fois l'aide connue. Démarrer un parcours avant cet instant, c'est le
 * priver de sa dernière bulle — le moteur écarte les cibles absentes du DOM, en
 * silence. On attend donc, plutôt que de courir après le réseau.
 */
export function useGlHelpReady() {
  const [ready, setReady] = useState(!!cachedHelpConfig);

  useEffect(() => {
    if (ready) return undefined;
    let cancelled = false;
    fetchGlHelpConfig().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  return ready;
}
