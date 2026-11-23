import { useEffect, useRef } from 'react';
import { api } from '../services/api';
import { pickEntryMap } from '../components/pedago/foodWebSelectionModel.js';

/**
 * « Voir le réseau trophique » depuis une fiche (chantier collège du 22/11/2026, lot 3) : la
 * vue s'ouvre sur une carte où l'espèce vit — la carte active si elle y est, sinon la première
 * de ses cartes, sinon « Toutes les cartes ». `openPedagoFoodWeb` (shell) transmet l'espèce sans
 * carte ; seule la vue connaît la carte active (`initialMapId`), c'est donc ici que la carte est
 * résolue, une fois par demande (`requestKey`), à partir de `GET /api/food-web/species/:id/maps`.
 *
 * Une erreur réseau laisse la carte active (comportement d'avant).
 *
 * @param {{ enabled: boolean, plantId?: number|string|null, requestKey?: unknown,
 *   activeMapId?: string|null, maps?: { id: string }[], setMapId: (id: string) => void }} options
 */
export function useFoodWebEntryMap({
  enabled,
  plantId = null,
  requestKey = null,
  activeMapId = null,
  maps = [],
  setMapId,
}) {
  const appliedRef = useRef(null);
  const mapsRef = useRef(maps);
  useEffect(() => {
    mapsRef.current = maps;
  }, [maps]);

  useEffect(() => {
    const id = Number(plantId);
    if (!enabled || !Number.isInteger(id) || id <= 0) return undefined;
    const key = `${requestKey ?? ''}|${id}`;
    if (appliedRef.current === key) return undefined;
    appliedRef.current = key;
    let cancelled = false;
    api(`/api/food-web/species/${encodeURIComponent(id)}/maps`)
      .then((data) => {
        if (cancelled) return;
        const speciesMapIds = (Array.isArray(data?.maps) ? data.maps : []).map((m) => m?.id);
        const target = pickEntryMap({
          speciesMapIds,
          activeMapId,
          availableMapIds: (mapsRef.current || []).map((m) => m?.id),
        });
        if (target !== String(activeMapId || '')) setMapId(target);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, plantId, requestKey, activeMapId, setMapId]);
}
