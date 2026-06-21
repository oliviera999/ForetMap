import { useEffect, useState } from 'react';

import { apiGL } from '../services/apiGL.js';

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
 * @param {string} helpKey ex. `tab:maps`
 */
export function useGlHelpContent(helpKey) {
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
    body: entry?.body || '',
    ready: !!config,
  };
}
