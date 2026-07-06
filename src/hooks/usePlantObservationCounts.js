import { useCallback, useEffect, useState } from 'react';
import { fetchPlantObservationCounts } from '../components/PlantSpeciesDiscoveryAcknowledge';

/**
 * Compteurs d'observations par fiche biodiversité (moi + tout le site), pour une
 * liste d'ids de plantes affichées.
 *
 * Mutualise le motif copié entre `PlantManager` et `PlantViewer` : fetch initial,
 * refetch sur `foretmap_session_changed`, cleanup (flag `cancelled` + désabonnement).
 * Le refetch dépend d'une clé stable dérivée des ids (joints) — pas de la référence
 * du tableau — plus une clé de rafraîchissement optionnelle (`plants.length` chez
 * les appelants, comportement historique conservé).
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
    // Compteur de requête : plusieurs `foretmap_session_changed` rapprochés peuvent lancer
    // des `load()` concurrents ; seul le plus récent applique son résultat (anti-résultat périmé).
    let seq = 0;
    const load = async () => {
      const mySeq = ++seq;
      if (!idsKey) {
        if (!cancelled && mySeq === seq) setCounts({});
        return;
      }
      const next = await fetchPlantObservationCounts(idsKey.split(',').map(Number));
      if (!cancelled && mySeq === seq) setCounts(next);
    };
    load();
    if (typeof window !== 'undefined') {
      window.addEventListener('foretmap_session_changed', load);
      return () => {
        cancelled = true;
        window.removeEventListener('foretmap_session_changed', load);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [idsKey, refreshKey]);

  /** Reporte localement les compteurs renvoyés après un acquittement d'observation. */
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
