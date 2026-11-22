import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';

function normalizeMapId(value) {
  if (value == null || value === '') return '';
  return String(value);
}

/**
 * Données du réseau trophique (sorti de `FoodWebView.jsx`, flux C3) : carte et zone choisies,
 * interactions de `GET /api/food-web`, zones de la carte pour le filtre.
 *
 * - une réponse périmée (changement de carte ou de zone pendant le chargement) est ignorée ;
 * - changer de carte remet la zone à « toute la carte » ;
 * - un lien « Voir le réseau » ou une séance recadre sur la carte demandée, même si l'onglet
 *   était déjà ouvert sur une autre (`initialMapId`, relu à chaque `requestKey`).
 *
 * @param {{ initialMapId?: string|number|null, requestKey?: unknown }} options
 */
export function useFoodWebData({ initialMapId = null, requestKey = null } = {}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mapId, setMapId] = useState(() => normalizeMapId(initialMapId));
  const [zoneId, setZoneId] = useState('');
  const [filterZones, setFilterZones] = useState([]);
  const seqRef = useRef(0);

  useEffect(() => {
    const next = normalizeMapId(initialMapId);
    if (next) setMapId(next);
  }, [initialMapId, requestKey]);

  const reload = useCallback(async () => {
    const seq = ++seqRef.current;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (zoneId) params.set('zoneId', zoneId);
      else if (mapId) params.set('mapId', mapId);
      const qs = params.toString() ? `?${params}` : '';
      const data = await api(`/api/food-web${qs}`);
      if (seq !== seqRef.current) return;
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      if (seq !== seqRef.current) return;
      setError(err.message || 'Chargement impossible');
      setItems([]);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [zoneId, mapId]);

  useEffect(() => {
    reload();
    return () => {
      seqRef.current += 1;
    };
  }, [reload]);

  useEffect(() => {
    setZoneId('');
  }, [mapId]);

  useEffect(() => {
    if (!mapId) {
      setFilterZones([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await api(`/api/zones?map_id=${encodeURIComponent(mapId)}`);
        if (cancelled) return;
        setFilterZones(Array.isArray(data) ? data : []);
      } catch (_) {
        if (!cancelled) setFilterZones([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mapId]);

  return { items, loading, error, mapId, setMapId, zoneId, setZoneId, filterZones, reload };
}
