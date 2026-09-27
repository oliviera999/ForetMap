/**
 * Parcours de la carte de travail : chargement des parcours de la carte active, mode
 * parcours (étape courante, reprise mémorisée), recadrage sur le lieu de chaque étape, et
 * demande d'ouverture venue d'une séance pédagogique.
 *
 * Extrait de `MapViewImpl` (`src/components/map-views.jsx`, étape B4 de l'audit du
 * 25/09/2026, § 3.3 ligne 5 — patron O6), sans changement de comportement.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../services/api';
import { useMapRouteMode } from '../../shared/map-routes/useMapRouteMode.js';
import {
  mapRouteResumeStorageKey,
  placesFromZonesAndMarkers,
} from '../../shared/map-routes/mapRouteSteps.js';
import { markerFocusPct, zoneFocusPctFromPoints } from '../../utils/mapFocusLocation.js';

/**
 * @param {object} options
 * @param {string} options.activeMapId carte active
 * @param {object[]} options.zonesOnMap zones de la carte active
 * @param {object[]} options.markersOnMap repères de la carte active
 * @param {string} options.mode mode de la carte (un parcours se ferme hors navigation)
 * @param {Function} options.focusMapPct recadrage animé de la carte
 * @param {Function} options.setSelectedZone sélection de zone de la carte
 * @param {Function} options.setSelectedMarker sélection de repère de la carte
 * @param {{ slug: string, nonce: * }|null} options.routeRequest « ouvrir le parcours X »
 * @param {Function|null} options.onRouteRequestHandled accusé de la demande (nonce)
 */
export function useMapViewRoutes({
  activeMapId,
  zonesOnMap,
  markersOnMap,
  mode,
  focusMapPct,
  setSelectedZone,
  setSelectedMarker,
  routeRequest,
  onRouteRequestHandled,
}) {
  const [mapRoutes, setMapRoutes] = useState([]);
  useEffect(() => {
    let cancelled = false;
    const mid = String(activeMapId || '').trim();
    if (!mid) {
      setMapRoutes([]);
      return undefined;
    }
    api(`/api/map-routes?map_id=${encodeURIComponent(mid)}&surface=map`)
      .then((rows) => {
        if (!cancelled) setMapRoutes(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setMapRoutes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeMapId]);
  const routePlaces = useMemo(
    () => placesFromZonesAndMarkers(zonesOnMap, markersOnMap),
    [zonesOnMap, markersOnMap],
  );

  /**
   * Hauteur réellement occupée par la barre d'étape (elle se mesure elle-même) : la carte
   * recadre **au-dessus** d'elle, sans quoi le lieu de l'étape courante était centré dans la
   * scène entière, donc sous la barre (`docs/AUDIT_PARCOURS_2026-09-17.md` §2.7).
   */
  const [routeBarHeight, setRouteBarHeight] = useState(0);
  const routeFocusInsets = useMemo(
    () => (routeBarHeight > 0 ? { bottom: routeBarHeight } : null),
    [routeBarHeight],
  );
  const onRouteStepPlace = useCallback(
    (entry) => {
      if (!entry?.place) return;
      const place = entry.place;
      const focusOptions = routeFocusInsets ? { insets: routeFocusInsets } : undefined;
      if (place.kind === 'zone') {
        setSelectedMarker(null);
        setSelectedZone(place);
        const pct = zoneFocusPctFromPoints(place.points);
        if (pct) focusMapPct(pct, focusOptions);
      } else {
        setSelectedZone(null);
        setSelectedMarker(place);
        focusMapPct(markerFocusPct(place), focusOptions);
      }
    },
    [focusMapPct, routeFocusInsets, setSelectedZone, setSelectedMarker],
  );
  const onRouteExitExtra = useCallback(() => {
    setSelectedZone(null);
    setSelectedMarker(null);
  }, [setSelectedZone, setSelectedMarker]);
  const routeMode = useMapRouteMode({
    routes: mapRoutes,
    places: routePlaces,
    onStepPlace: onRouteStepPlace,
    onExitExtra: onRouteExitExtra,
    // Reprise mémorisée sur l'appareil : « Reprendre » rend la main à l'étape quittée, même
    // après un rechargement (`docs/AUDIT_PARCOURS_2026-09-17.md` §2.2).
    storageKey: mapRouteResumeStorageKey('map', activeMapId),
  });
  const { activeRoute, startRoute, exitRoute, resetForMapChange } = routeMode;
  useEffect(() => {
    resetForMapChange();
  }, [activeMapId, resetForMapChange]);
  // Séance pédagogique : « ouvrir le parcours X » — attend que les parcours de la carte
  // soient chargés, puis démarre une seule fois par demande (nonce).
  const handledRouteRequestRef = useRef(null);
  useEffect(() => {
    if (!routeRequest?.slug || handledRouteRequestRef.current === routeRequest.nonce) return;
    const route = mapRoutes.find((r) => r.slug === routeRequest.slug);
    if (!route) return;
    handledRouteRequestRef.current = routeRequest.nonce;
    startRoute(route);
    onRouteRequestHandled?.(routeRequest.nonce);
  }, [routeRequest, mapRoutes, startRoute, onRouteRequestHandled]);
  // Un parcours ne survit pas à la sortie du mode navigation.
  useEffect(() => {
    if (mode !== 'view' && activeRoute) exitRoute();
  }, [mode, activeRoute, exitRoute]);

  return { ...routeMode, mapRoutes, routePlaces, setRouteBarHeight };
}
