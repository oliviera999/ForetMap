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
export function usePlanContent(mapId = '', accessCode = '') {
  const [content, setContent] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  /** Le serveur exige un code d'accès (lot 8) : le produit affiche l'écran de saisie. */
  const [accessRequired, setAccessRequired] = useState(false);

  const load = useCallback(
    async (signal) => {
      setLoading(true);
      try {
        const data = await fetchPlanContent(mapId, accessCode);
        if (signal?.aborted) return;
        setContent(data);
        setError(null);
        setAccessRequired(false);
      } catch (err) {
        if (signal?.aborted) return;
        if (err?.status === 401 && err?.body?.access_required) {
          setAccessRequired(true);
          setError(null);
        } else {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [mapId, accessCode],
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
    accessRequired,
    routes: content?.routes || [],
    categories: content?.categories || [],
    settings: content?.settings || null,
    map: content?.map || null,
    loading,
    error,
    reload: useCallback(() => load(null), [load]),
  };
}
