import { useCallback, useEffect, useMemo, useRef } from 'react';

import { MapActionButton } from '../../shared/ui/MapActionButton.jsx';
import { PctClusterLayer } from '../../shared/pct-map/PctClusterLayer.jsx';
import { PctImageLayer } from '../../shared/pct-map/PctImageLayer.jsx';
import { PctMarkerButton } from '../../shared/pct-map/PctMarkersLayer.jsx';
import { PctZonesLayer } from '../../shared/pct-map/PctZonesLayer.jsx';
import { usePctMapViewport } from '../../shared/pct-map/usePctMapViewport.js';
import { parsePctPolygonPoints } from '../../shared/pct-map/pctPolygon.js';
import {
  clusterCenterPct,
  clusterMarkers,
  clusterSeparatesOnZoom,
  clusterZoomTargetScale,
} from '../../shared/pct-map/clusterMarkers.js';
import { shouldShowMarkerLabel } from '../../shared/pct-map/mapOverlayLabelCollision.js';
import { planPlaceFocusPct } from '../utils/planPlaces.js';

/** Cibles qui ne démarrent pas un déplacement de carte (commandes superposées). */
const PLAN_GESTURE_TARGET = '.plan-map-controls, .plan-map-controls *';

/**
 * Rang de catégorie (`sort_order`) au-delà duquel le nom d'un repère n'apparaît qu'à fort
 * zoom : les entrées et les bâtiments se nomment avant les sanitaires.
 */
const PLAN_LABEL_PRIORITY_CUTOFF = 50;

/**
 * Carte plein écran du Plan Lyautey (lot 4) : moteur de carte partagé en mode « scène »
 * (`usePctMapViewport`), calques partagés zones / repères, et trois commandes (zoom avant,
 * zoom arrière, recentrer) en boutons d'action de carte du kit d'interface.
 *
 * La carte occupe tout l'écran : sur un plan d'établissement consulté debout dans un couloir,
 * chaque pixel d'interface pris au plan est un pixel de moins pour se repérer.
 *
 * @param {object} props
 * @param {{ map_image_url?: string, label?: string }} props.map
 * @param {Array<object>} props.zones
 * @param {Array<object>} props.markers
 * @param {object|null} props.selectedPlace lieu dont la fiche est ouverte (mis en avant, centré).
 * @param {(place: object) => void} props.onSelectPlace
 * @param {(markers: Array<object>) => void} [props.onOpenGroup] tap sur un groupe qui ne se
 *   sépare pas au zoom : le produit montre la liste de ses lieux (feuille basse).
 * @param {Map<string, object>} [props.categoriesById] catalogue des catégories (priorités,
 *   couleur de la pastille de groupe).
 * @param {string} [props.attribution] mention de source du fond de plan (`ui.plan.attribution`).
 */
export function PlanMapStage({
  map,
  zones,
  markers,
  selectedPlace,
  onSelectPlace,
  onOpenGroup = null,
  categoriesById = null,
  attribution = '',
}) {
  const imageSrc = String(map?.map_image_url || '');
  const viewport = usePctMapViewport({
    imageSrc,
    contentMode: 'stage',
    onResize: 'clamp',
    resetKey: String(map?.id || ''),
    isGestureTarget: PLAN_GESTURE_TARGET,
  });
  const {
    containerRef,
    worldRef,
    imgRef,
    committed,
    fitRect,
    fitScale,
    stageSize,
    fitMap,
    fitMapAnimated,
    zoomBy,
    focusOnPct,
    consumeSkipClick,
    touchAction,
  } = viewport;

  const onZoneClick = useCallback(
    (zone) => {
      if (consumeSkipClick()) return;
      onSelectPlace({ ...zone, kind: 'zone', name: String(zone.name || '').trim() });
    },
    [consumeSkipClick, onSelectPlace],
  );
  const onMarkerClick = useCallback(
    (marker) => {
      if (consumeSkipClick()) return;
      onSelectPlace({ ...marker, kind: 'marker', name: String(marker.label || '').trim() });
    },
    [consumeSkipClick, onSelectPlace],
  );

  // Désencombrement (lot 5) : au dézoom, les repères dont les pastilles se recouvrent sont
  // fusionnés en une pastille de groupe. Recalculé au commit de transformation seulement.
  const clusters = useMemo(
    () =>
      clusterMarkers(markers, {
        contentWidthPx: fitRect.width,
        contentHeightPx: fitRect.height,
        scale: committed.s,
        categoriesById,
      }),
    [markers, fitRect.width, fitRect.height, committed.s, categoriesById],
  );

  const onClusterClick = useCallback(
    (cluster) => {
      if (consumeSkipClick()) return;
      // Le groupe se sépare en zoomant : on zoome sur son enveloppe. Sinon (repères
      // réellement au même endroit), la liste de ses lieux monte dans la feuille basse —
      // l'option accessible de l'éventail « spiderfy » (§8.3).
      if (clusterSeparatesOnZoom(cluster)) {
        focusOnPct(clusterCenterPct(cluster), {
          targetScale: clusterZoomTargetScale(cluster, {
            stageWidthPx: stageSize.w,
            stageHeightPx: stageSize.h,
            contentWidthPx: fitRect.width,
            contentHeightPx: fitRect.height,
          }),
        });
        return;
      }
      onOpenGroup?.(cluster.markers);
    },
    [
      consumeSkipClick,
      focusOnPct,
      onOpenGroup,
      stageSize.w,
      stageSize.h,
      fitRect.width,
      fitRect.height,
    ],
  );

  const clusterColorOf = useCallback(
    (cluster) => {
      const ids = cluster?.lead?.category_ids || [];
      for (const id of ids) {
        const color = categoriesById?.get?.(String(id))?.color;
        if (color) return color;
      }
      return '';
    },
    [categoriesById],
  );

  // Centrage sur le lieu sélectionné : une fois par lieu, jamais pendant que l'on manipule
  // la carte (sinon la vue « saute » sous le doigt à chaque re-rendu de la fiche).
  const lastFocusedRef = useRef('');
  useEffect(() => {
    const key = selectedPlace ? `${selectedPlace.kind}:${selectedPlace.id}` : '';
    if (!key || key === lastFocusedRef.current) {
      if (!key) lastFocusedRef.current = '';
      return;
    }
    const pct = planPlaceFocusPct(selectedPlace, parsePctPolygonPoints);
    if (!pct) return;
    lastFocusedRef.current = key;
    focusOnPct(pct);
  }, [selectedPlace, focusOnPct]);

  const fitStyle = useMemo(
    () =>
      fitRect.width > 0 && fitRect.height > 0
        ? {
            left: fitRect.offsetX,
            top: fitRect.offsetY,
            width: fitRect.width,
            height: fitRect.height,
          }
        : { left: 0, top: 0, width: '100%', height: '100%' },
    [fitRect],
  );

  const selectedZoneId = selectedPlace?.kind === 'zone' ? selectedPlace.id : null;
  const selectedMarkerId = selectedPlace?.kind === 'marker' ? selectedPlace.id : null;

  // Étiquettes de repères : jamais toutes. L'emoji seul au dézoom, le nom au zoom, et
  // toujours le nom du lieu sélectionné (§8.3, point 4).
  const markerLabelOf = useCallback(
    (marker) => {
      const label = String(marker?.label ?? marker?.name ?? '').trim();
      if (!label) return '';
      const selected = selectedMarkerId != null && String(selectedMarkerId) === String(marker.id);
      const priority = (marker?.category_ids || []).reduce((best, id) => {
        const rank = Number(categoriesById?.get?.(String(id))?.sort_order);
        return Number.isFinite(rank) && rank < best ? rank : best;
      }, Number.POSITIVE_INFINITY);
      return shouldShowMarkerLabel({
        scale: committed.s,
        fitScale,
        priority,
        selected,
        priorityCutoff: PLAN_LABEL_PRIORITY_CUTOFF,
      })
        ? label
        : '';
    },
    [committed.s, fitScale, selectedMarkerId, categoriesById],
  );

  const renderMarker = useCallback(
    (marker) => (
      <PctMarkerButton
        key={marker.id}
        marker={marker}
        isActive={selectedMarkerId != null && String(selectedMarkerId) === String(marker.id)}
        onMarkerClick={onMarkerClick}
        labelOf={markerLabelOf}
      />
    ),
    [onMarkerClick, selectedMarkerId, markerLabelOf],
  );

  return (
    <div className="plan-map" ref={containerRef} style={{ touchAction }}>
      <div
        ref={worldRef}
        className="plan-map__world"
        style={{
          transform: `translate3d(${committed.x}px, ${committed.y}px, 0) scale(${committed.s})`,
          transformOrigin: '0 0',
        }}
      >
        <div className="plan-map__fit" style={fitStyle}>
          <PctImageLayer
            ref={imgRef}
            src={imageSrc}
            alt={`Plan ${map?.label || 'de l’établissement'}`}
            className="plan-map__img"
            onLoad={fitMap}
          />
          <PctZonesLayer
            zones={zones}
            onZoneClick={onZoneClick}
            activeZoneId={selectedZoneId}
            className="fm-pct-zones plan-map__zones"
          />
          <PctClusterLayer
            clusters={clusters}
            onClusterClick={onClusterClick}
            renderMarker={renderMarker}
            colorOf={clusterColorOf}
          />
        </div>
      </div>

      <div className="plan-map-controls">
        <MapActionButton
          role="display"
          icon="＋"
          label="Zoomer"
          testId="plan-zoom-in"
          onClick={() => zoomBy(1.2)}
        />
        <MapActionButton
          role="display"
          icon="－"
          label="Dézoomer"
          testId="plan-zoom-out"
          onClick={() => zoomBy(0.84)}
        />
        <MapActionButton
          role="display"
          icon="⊡"
          label="Voir tout le plan"
          testId="plan-zoom-reset"
          onClick={fitMapAnimated}
        />
      </div>

      {attribution ? <p className="plan-map__attribution">{attribution}</p> : null}
    </div>
  );
}
