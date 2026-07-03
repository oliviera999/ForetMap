import { useCallback, useEffect, useRef, useState } from 'react';
import { api, AccountDeletedError } from '../services/api';

/**
 * Chargement des données de la visite (cartes + contenu + progression serveur)
 * et sélection courante (zone/repère) resynchronisée après chaque rechargement.
 *
 * Extraction iso-comportement de VisitViewImpl (visit-views.jsx) : mêmes requêtes,
 * même garde anti-réponse obsolète (`map_id` demandé ≠ carte affichée), même
 * bascule vers la première carte visible si la carte demandée n'existe plus.
 *
 * La progression « vu » n'est PAS interprétée ici : le corps brut de
 * `/api/visit/progress` est transmis à `onProgressLoaded` (cf. useVisitSeenSync),
 * lu via une ref pour que `loadData` reste stable vis-à-vis de ce callback.
 *
 * @param {object} params
 * @param {string} params.mapId carte demandée (état possédé par la vue).
 * @param {(id: string) => void} params.setMapId bascule si la carte demandée est absente.
 * @param {(() => void)|undefined} params.onForceLogout compte supprimé (401 deleted).
 * @param {(progressBody: unknown) => void} [params.onProgressLoaded] reçoit le corps brut de la progression (ou null).
 * @returns {{
 *   maps: Array<object>,
 *   content: { zones: Array, markers: Array, tutorials: Array, mascot_packs: Array, map_id?: string },
 *   loading: boolean,
 *   loadData: () => Promise<void>,
 *   selected: object|null,
 *   setSelected: (v: object|null) => void,
 *   selectedType: ('zone'|'marker')|null,
 *   setSelectedType: (v: ('zone'|'marker')|null) => void,
 * }}
 */
export function useVisitContent({ mapId, setMapId, onForceLogout, onProgressLoaded }) {
  /** Dernière carte affichée : évite d’appliquer une réponse `/api/visit/content` obsolète après changement de `map_id`. */
  const visitLoadMapIdLiveRef = useRef(mapId);
  visitLoadMapIdLiveRef.current = mapId;
  const [maps, setMaps] = useState([]);
  const [content, setContent] = useState({
    zones: [],
    markers: [],
    tutorials: [],
    mascot_packs: [],
  });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [selectedType, setSelectedType] = useState(null);

  const onProgressLoadedRef = useRef(onProgressLoaded);
  onProgressLoadedRef.current = onProgressLoaded;

  const loadData = useCallback(async () => {
    const requestedMapId = String(mapId).trim();
    const visitContentPath = requestedMapId
      ? `/api/visit/content?map_id=${encodeURIComponent(requestedMapId)}`
      : '/api/visit/content';
    setLoading(true);
    try {
      const [mapsRes, visitRes] = await Promise.all([
        api('/api/maps').catch(() => []),
        api(visitContentPath),
      ]);
      if (requestedMapId !== String(visitLoadMapIdLiveRef.current).trim()) return;

      let progressBody = null;
      try {
        progressBody = await api('/api/visit/progress');
      } catch (_) {
        progressBody = null;
      }

      const fetchedMaps = Array.isArray(mapsRes) ? mapsRes : [];
      const activeMaps = fetchedMaps.filter((m) => m?.is_active !== false);
      const visibleMaps = activeMaps.length > 0 ? activeMaps : fetchedMaps;
      setMaps(visibleMaps);
      if (visibleMaps.length > 0 && !visibleMaps.some((m) => m.id === requestedMapId)) {
        setMapId(visibleMaps[0].id);
      }
      const visitPayload =
        visitRes && typeof visitRes === 'object' && !Array.isArray(visitRes)
          ? {
              ...visitRes,
              map_id: visitRes.map_id ?? requestedMapId,
              mascot_packs: Array.isArray(visitRes.mascot_packs) ? visitRes.mascot_packs : [],
            }
          : { zones: [], markers: [], tutorials: [], mascot_packs: [], map_id: requestedMapId };
      setContent(visitPayload);
      onProgressLoadedRef.current?.(progressBody);
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      else alert(err.message || 'Erreur chargement visite');
    } finally {
      setLoading(false);
    }
  }, [mapId, setMapId, onForceLogout]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /** Resynchronise la sélection sur le contenu rechargé (ou la ferme si l'élément a disparu). */
  useEffect(() => {
    if (loading) return;
    const sid = selected?.id;
    const st = selectedType;
    if (!sid || !st) return;
    const list = st === 'zone' ? content.zones || [] : content.markers || [];
    const next = list.find((x) => x.id === sid);
    if (next) setSelected(next);
    else {
      setSelected(null);
      setSelectedType(null);
    }
  }, [content, loading, selected?.id, selectedType]);

  return { maps, content, loading, loadData, selected, setSelected, selectedType, setSelectedType };
}
