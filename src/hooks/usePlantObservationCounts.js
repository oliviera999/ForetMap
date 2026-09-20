import { useCallback, useEffect, useState } from 'react';
import { fetchPlantObservationCounts } from '../components/PlantSpeciesDiscoveryAcknowledge';
import { BIODIV_IDS_DEBOUNCE_MS } from '../utils/biodivCatalogLoad.js';

/**
 * Compteurs d'observations par fiche biodiversité (moi + tout le site), pour une
 * liste d'ids de plantes affichées.
 *
 * Mutualise le motif copié entre `PlantManager` et `PlantViewer` : fetch initial,
 * refetch sur `foretmap_session_changed`, cleanup (flag `cancelled` + désabonnement).
 * Debounce 280 ms sur la clé d'ids pour éviter une rafale à chaque frappe de filtre.
 *
 * @param {number[]} plantIds ids (normalisés/triés par l'appelant)
 * @param {number|string} [refreshKey] clé additionnelle déclenchant un refetch
 * @returns {{
 *   counts: Record<string, { my_observation_count:number, site_observation_count:number }>,
 *   applyAcknowledged: (id:number|string, next:{my_observation_count:number, site_observation_count:number}) => void,
 * }}
 */
export function usePlantObservationCounts(plantIds, refreshKey = 0) {
  const [counts, setCounts] = useState(() => ({}));
  const idsKey = Array.isArray(plantIds) ? plantIds.join(',') : '';

  useEffect(() => {
    let cancelled = false;
    let seq = 0;
    let timer = null;
    const load = async () => {
      const mySeq = ++seq;
      if (!idsKey) {
        if (!cancelled && mySeq === seq) setCounts({});
        return;
      }
      const next = await fetchPlantObservationCounts(idsKey.split(',').map(Number));
      if (!cancelled && mySeq === seq) setCounts(next);
    };
    timer = setTimeout(load, idsKey ? BIODIV_IDS_DEBOUNCE_MS : 0);
    if (typeof window !== 'undefined') {
      const onSession = () => {
        if (timer) clearTimeout(timer);
        load();
      };
      window.addEventListener('foretmap_session_changed', onSession);
      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
        window.removeEventListener('foretmap_session_changed', onSession);
      };
    }
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [idsKey, refreshKey]);

  const applyAcknowledged = useCallback((id, next) => {
    setCounts((prev) => ({
      ...prev,
      [String(id)]: {
        my_observation_count: next.my_observation_count,
        site_observation_count: next.site_observation_count,
      },
    }));
  }, []);

  return { counts, applyAcknowledged };
}
