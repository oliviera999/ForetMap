import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { useBiodivPedago } from '../contexts/BiodivPedagoContext.jsx';
import { filterGlossaryItemsByDepth } from '../utils/foretmapGlossaryAutolink.js';

/**
 * Index des termes actifs du glossaire ForetMap, partagé par tous les écrans.
 *
 * Pendant de `useGlGlossaryLinkIndex` (GL). Un seul chargement pour toute la
 * session : le résultat (et la promesse en cours) est mémorisé au niveau du
 * module, donc quatre écrans montés en même temps ne déclenchent qu'une requête.
 * L'échec est silencieux : index vide = pas d'auto-liens, jamais d'écran cassé.
 *
 * Barrière de vocabulaire douce (chantier collège, flux C2) : l'index rendu ne garde que les
 * termes dont la profondeur est dans le palier de l'apprenant (règle `glossary_depth_max` du
 * contexte ; `null` = pas de filtre). Le cache module reste **complet** : changer de palier
 * (aperçu prof, séance) ne recharge rien. La fiche d'un terme reste toujours consultable.
 */

/** @type {Array<{ glossary_code: string, terme: string, variantes?: string, niveau?: string }>|null} */
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
 * @returns {Array<{ glossary_code: string, terme: string, variantes?: string, niveau?: string }>}
 */
export function useGlossaryLinkIndex({ enabled = true } = {}) {
  const [items, setItems] = useState(() => cachedItems || []);
  const { palierRule } = useBiodivPedago();
  const depthMax = palierRule('glossary_depth_max');

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

  return useMemo(() => filterGlossaryItemsByDepth(items, depthMax), [items, depthMax]);
}
