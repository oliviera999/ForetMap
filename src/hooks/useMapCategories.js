import { useCallback } from 'react';

import { api } from '../services/api';
import { useApiResource } from './useApiResource.js';

/**
 * Catalogue des catégories de lieux utilisables sur une carte : celles qui lui sont
 * propres plus les catégories globales. Sans `mapId`, le catalogue complet est chargé.
 *
 * @param {string} mapId
 * @param {{ kind?: 'zone'|'marker', manage?: boolean, onForceLogout?: () => void }} [options]
 *   `manage` réclame la vue prof (inclut les catégories désactivées).
 */
export function useMapCategories(mapId, { kind = '', manage = false, onForceLogout } = {}) {
  const fetcher = useCallback(() => {
    const params = new URLSearchParams();
    if (mapId) params.set('map_id', String(mapId));
    if (kind && !manage) params.set('kind', kind);
    const query = params.toString();
    const base = manage ? '/api/map-categories/manage' : '/api/map-categories';
    return api(query ? `${base}?${query}` : base);
  }, [mapId, kind, manage]);

  const { data, loading, error, reload } = useApiResource(fetcher, [mapId, kind, manage], {
    onForceLogout,
  });

  return { categories: Array.isArray(data) ? data : [], loading, error, reload };
}
