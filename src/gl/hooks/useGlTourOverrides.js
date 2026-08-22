import { useEffect, useState } from 'react';

import { apiGL } from '../services/apiGL.js';

/**
 * Surcharges éditoriales des visites guidées GL (`GET /api/gl/content/tours`).
 *
 * Le corpus par défaut vit dans le bundle : un registre vide, ou une lecture en échec,
 * ne coûte donc rien — les parcours jouent leurs textes versionnés. C'est ce qui permet
 * de charger ces surcharges sans bloquer quoi que ce soit au démarrage.
 */

let cachedRegistry = null;
let loadPromise = null;

async function fetchGlTourOverrides() {
  if (cachedRegistry) return cachedRegistry;
  if (!loadPromise) {
    loadPromise = apiGL('/api/gl/content/tours')
      .then((data) => {
        const registry = data?.registry;
        cachedRegistry = registry && typeof registry === 'object' ? registry : {};
        return cachedRegistry;
      })
      .catch(() => {
        cachedRegistry = {};
        return cachedRegistry;
      })
      .finally(() => {
        loadPromise = null;
      });
  }
  return loadPromise;
}

/** Invalide le cache client (après édition par un MJ). */
export function invalidateGlTourOverridesCache() {
  cachedRegistry = null;
  loadPromise = null;
}

/**
 * @param {boolean} [enabled] à faux, aucune requête n'est lancée (invité, module éteint).
 * @returns {object|null} registre de surcharges, `null` tant qu'il n'est pas chargé.
 */
export function useGlTourOverrides(enabled = true) {
  const [registry, setRegistry] = useState(cachedRegistry);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    fetchGlTourOverrides().then((data) => {
      if (!cancelled) setRegistry(data);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return registry;
}
