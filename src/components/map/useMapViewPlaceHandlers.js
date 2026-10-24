/**
 * Ouverture d'un lieu sur la carte de travail, quel que soit le geste : toucher d'une zone,
 * d'un repère ou d'un groupe de repères (scène partagée ou canevas d'édition), résultat de
 * recherche, clic sur le fond (la mascotte s'y rend). Quand la mascotte est à l'écran, elle
 * se rend d'abord au lieu, qui s'ouvre à son arrivée.
 *
 * Extrait de `MapViewImpl` (`src/components/map-views.jsx`, étape B4 de l'audit du
 * 25/09/2026, § 3.3 ligne 5 — patron O6), sans changement de comportement.
 */
import { useCallback, useMemo } from 'react';
import {
  clusterCenterPct,
  clusterSeparatesOnZoom,
  clusterZoomTargetScale,
} from '../../shared/pct-map/clusterMarkers.js';
import { markerFocusPct, zoneFocusPctFromPoints } from '../../utils/mapFocusLocation.js';

export function useMapViewPlaceHandlers({
  mode,
  moved,
  selectedZone,
  selectedMarker,
  setSelectedZone,
  setSelectedMarker,
  showMapMascot,
  onMapMascotZoneClick,
  onMapMascotMarkerClick,
  moveMapMascotTo,
  toggleAlignZoneId,
  focusMapPct,
  containerRef,
  imgSize,
  workViewportApiRef,
  mapFilterActive,
  matchingZoneIds,
  matchingMarkerIds,
  openZone = null,
  openMarker = null,
  placeFocusActive = false,
}) {
  /**
   * Ouverture d'une fiche depuis la scène partagée ou la recherche : `openZone` / `openMarker`
   * cadrent d'abord le lieu (`usePlaceFocusSequence`) ; à défaut, la fiche s'ouvre tout de suite.
   */
  const openZoneDetail = openZone || setSelectedZone;
  const openMarkerDetail = openMarker || setSelectedMarker;

  /** Centre la carte sur un lieu (résultat de recherche) — moteur partagé, animé et borné. */
  const focusMapOnLocation = useCallback((focusPct) => focusMapPct(focusPct), [focusMapPct]);

  const onSelectMapFilterResult = useCallback(
    (row) => {
      if (!row?.item) return;
      if (row.kind === 'zone') {
        if (showMapMascot) onMapMascotZoneClick(row.item, openZoneDetail);
        else openZoneDetail(row.item);
        if (!placeFocusActive) focusMapOnLocation(zoneFocusPctFromPoints(row.item.points));
      } else {
        if (showMapMascot) onMapMascotMarkerClick(row.item, openMarkerDetail);
        else openMarkerDetail(row.item);
        if (!placeFocusActive) focusMapOnLocation(markerFocusPct(row.item));
      }
    },
    [
      showMapMascot,
      onMapMascotZoneClick,
      onMapMascotMarkerClick,
      focusMapOnLocation,
      openZoneDetail,
      openMarkerDetail,
      placeFocusActive,
    ],
  );

  const openZoneFromMap = useCallback(
    (z, e) => {
      if (moved.current) return;
      if (mode === 'align-zones') {
        e.stopPropagation();
        toggleAlignZoneId(z.id);
        return;
      }
      if (mode === 'view') {
        e.stopPropagation();
        if (showMapMascot) onMapMascotZoneClick(z, setSelectedZone);
        else setSelectedZone(z);
      }
    },
    [mode, moved, showMapMascot, onMapMascotZoneClick, toggleAlignZoneId, setSelectedZone],
  );

  const openMarkerFromMap = useCallback(
    (m, e) => {
      e.stopPropagation();
      if (!moved.current) {
        if (mode === 'view' && showMapMascot) onMapMascotMarkerClick(m, setSelectedMarker);
        else setSelectedMarker(m);
      }
    },
    [mode, moved, showMapMascot, onMapMascotMarkerClick, setSelectedMarker],
  );

  /**
   * Tap sur un groupe de repères : zoom animé sur son enveloppe si le groupe se sépare,
   * sinon ouverture du repère représentatif (sur la carte de travail, la fiche est le geste
   * attendu ; le plan, lui, montre la liste du groupe dans sa feuille basse).
   */
  const openClusterFromMap = useCallback(
    (cluster, e) => {
      e.stopPropagation();
      if (moved.current) return;
      if (clusterSeparatesOnZoom(cluster)) {
        focusMapPct(clusterCenterPct(cluster), {
          targetScale: clusterZoomTargetScale(cluster, {
            stageWidthPx: containerRef.current?.clientWidth || 0,
            stageHeightPx: containerRef.current?.clientHeight || 0,
            contentWidthPx: imgSize.w,
            contentHeightPx: imgSize.h,
          }),
        });
        return;
      }
      setSelectedMarker(cluster.lead);
    },
    [moved, focusMapPct, containerRef, imgSize.w, imgSize.h, setSelectedMarker],
  );

  /**
   * Ouverture lieu depuis SharedMapStage (calques Pct*). Ignore les lieux atténués par filtre.
   */
  const onSelectPlaceFromStage = useCallback(
    (place) => {
      if (!place) return;
      if (mapFilterActive) {
        const id = String(place.id);
        if (place.kind === 'zone' && !matchingZoneIds.has(id)) return;
        if (place.kind === 'marker' && !matchingMarkerIds.has(id)) return;
      }
      if (place.kind === 'zone') {
        setSelectedMarker(null);
        if (showMapMascot) onMapMascotZoneClick(place, openZoneDetail);
        else openZoneDetail(place);
        return;
      }
      setSelectedZone(null);
      if (showMapMascot) onMapMascotMarkerClick(place, openMarkerDetail);
      else openMarkerDetail(place);
    },
    [
      mapFilterActive,
      matchingZoneIds,
      matchingMarkerIds,
      showMapMascot,
      onMapMascotZoneClick,
      onMapMascotMarkerClick,
      setSelectedZone,
      setSelectedMarker,
      openZoneDetail,
      openMarkerDetail,
    ],
  );

  /** Groupe de repères qui ne se sépare pas au zoom : ouvrir le repère représentatif. */
  const onOpenGroupFromStage = useCallback(
    (groupMarkers) => {
      const lead = Array.isArray(groupMarkers) && groupMarkers.length ? groupMarkers[0] : null;
      if (lead) openMarkerDetail(lead);
    },
    [openMarkerDetail],
  );

  const onWorkBackgroundClick = useCallback(
    (event) => {
      if (!showMapMascot) return;
      /* Clic fond libre (hors zone/repère) : même destination que le point cliqué. */
      const pct = workViewportApiRef.current.toImagePct?.(event.clientX, event.clientY, {
        clamp: true,
      });
      if (pct) moveMapMascotTo(pct.xp, pct.yp);
    },
    [showMapMascot, moveMapMascotTo, workViewportApiRef],
  );

  const selectedPlaceForStage = useMemo(() => {
    if (selectedZone) return { ...selectedZone, kind: 'zone' };
    if (selectedMarker) return { ...selectedMarker, kind: 'marker' };
    return null;
  }, [selectedZone, selectedMarker]);

  return {
    onSelectMapFilterResult,
    openZoneFromMap,
    openMarkerFromMap,
    openClusterFromMap,
    onSelectPlaceFromStage,
    onOpenGroupFromStage,
    onWorkBackgroundClick,
    selectedPlaceForStage,
  };
}
