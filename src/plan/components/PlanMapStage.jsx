import { useCallback, useEffect, useMemo, useRef } from 'react';

import { MapActionButton } from '../../shared/ui/MapActionButton.jsx';
import { PctImageLayer } from '../../shared/pct-map/PctImageLayer.jsx';
import { PctMarkersLayer } from '../../shared/pct-map/PctMarkersLayer.jsx';
import { PctZonesLayer } from '../../shared/pct-map/PctZonesLayer.jsx';
import { usePctMapViewport } from '../../shared/pct-map/usePctMapViewport.js';
import { parsePctPolygonPoints } from '../../shared/pct-map/pctPolygon.js';
import { planPlaceFocusPct } from '../utils/planPlaces.js';

/** Cibles qui ne démarrent pas un déplacement de carte (commandes superposées). */
const PLAN_GESTURE_TARGET = '.plan-map-controls, .plan-map-controls *';

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
 * @param {string} [props.attribution] mention de source du fond de plan (`ui.plan.attribution`).
 */
export function PlanMapStage({
  map,
  zones,
  markers,
  selectedPlace,
  onSelectPlace,
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
          <PctMarkersLayer
            markers={markers}
            onMarkerClick={onMarkerClick}
            activeMarkerId={selectedMarkerId}
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
