import { useCallback, useEffect, useMemo, useState } from 'react';

import { fetchPlanContent } from '../planApi.js';
import { planPlacesFromContent } from '../utils/planPlaces.js';

/**
 * Charge publique du plan (lot 4) : un seul appel au montage, pas de polling — le contenu
 * d'un plan d'établissement change quelques fois par an, et le produit doit rester utilisable
 * dans un couloir avec un réseau médiocre. `reload()` permet un rechargement explicite.
 *
 * @param {string} [mapId] carte demandée (`?map_id=`) ; vide = carte réglée côté serveur.
 */
export function usePlanContent(mapId = '') {
  const [content, setContent] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (signal) => {
      setLoading(true);
      try {
        const data = await fetchPlanContent(mapId);
        if (signal?.aborted) return;
        setContent(data);
        setError(null);
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [mapId],
  );

  useEffect(() => {
    const controller = { aborted: false };
    load(controller);
    return () => {
      controller.aborted = true;
    };
  }, [load]);

  const places = useMemo(() => planPlacesFromContent(content), [content]);

  return {
    content,
    places,
    categories: content?.categories || [],
    settings: content?.settings || null,
    map: content?.map || null,
    loading,
    error,
    reload: useCallback(() => load(null), [load]),
  };
}
