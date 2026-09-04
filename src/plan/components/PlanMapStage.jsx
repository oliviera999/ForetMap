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
import { PctLabelsLayer } from '../../shared/pct-map/PctLabelsLayer.jsx';
import {
  buildZoneLabelSpecs,
  labelKey,
  resolveVisibleLabels,
  zoneLabelMaxWidthPx,
} from '../../shared/pct-map/pctMapLabels.js';
import { PctDirectLine, PctPositionLayer } from '../../shared/pct-map/PctPositionLayer.jsx';
import { accuracyHaloDiameterPx } from '../../shared/pct-map/positionGeometry.js';
import { planPlaceFocusPct, splitNameEmoji } from '../utils/planPlaces.js';

/** Cibles qui ne démarrent pas un déplacement de carte (commandes superposées). */
const PLAN_GESTURE_TARGET = '.plan-map-controls, .plan-map-controls *';

/** Rapport `échelle / ajustement` au-delà duquel la carte compte comme « zoomée ». */
const PLAN_ZOOM_ONLY_RATIO = 1.6;

/** Bouton « Me situer » : quatre états visuels (lot 6). */
const POSITION_ICONS = Object.freeze({
  off: '◎',
  acquiring: '◌',
  on: '◉',
  follow: '⦿',
});
const POSITION_LABELS = Object.freeze({
  off: 'Me situer',
  acquiring: 'Recherche de votre position…',
  on: 'Suivre ma position',
  follow: 'Arrêter le suivi',
});

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
 * @param {object|null} [props.position] état de position (`useMapPosition`, lot 6).
 * @param {{ xp: number, yp: number }|null} [props.targetPct] lieu visé par « Y aller ».
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
  position = null,
  targetPct = null,
  attribution = '',
}) {
  const imageSrc = String(map?.map_image_url || '');
  const viewport = usePctMapViewport({
    imageSrc,
    contentMode: 'stage',
    onResize: 'clamp',
    resetKey: String(map?.id || ''),
    isGestureTarget: PLAN_GESTURE_TARGET,
    // Un déplacement à la main quitte le suivi de position sans couper le point bleu.
    onGestureStart: position?.notifyManualPan || null,
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

  /**
   * Catégories « visibles seulement au zoom » (lot 5) : leurs lieux disparaissent tant que
   * la carte est vue en entier, et reviennent dès qu'on zoome. C'est le réglage qui garde
   * les sanitaires et les points d'eau sans noyer les entrées.
   */
  const zoomedIn = fitScale > 0 ? committed.s / fitScale >= PLAN_ZOOM_ONLY_RATIO : false;
  const isVisibleAtScale = useCallback(
    (place) => {
      if (zoomedIn) return true;
      const ids = place?.category_ids || [];
      if (ids.length === 0) return true;
      return ids.some((id) => !categoriesById?.get?.(String(id))?.zoom_only);
    },
    [zoomedIn, categoriesById],
  );
  const visibleZones = useMemo(
    () => (zones || []).filter(isVisibleAtScale),
    [zones, isVisibleAtScale],
  );
  const visibleMarkers = useMemo(
    () => (markers || []).filter(isVisibleAtScale),
    [markers, isVisibleAtScale],
  );

  // Désencombrement (lot 5) : au dézoom, les repères dont les pastilles se recouvrent sont
  // fusionnés en une pastille de groupe. Recalculé au commit de transformation seulement.
  const clusters = useMemo(
    () =>
      clusterMarkers(visibleMarkers, {
        contentWidthPx: fitRect.width,
        contentHeightPx: fitRect.height,
        scale: committed.s,
        categoriesById,
      }),
    [visibleMarkers, fitRect.width, fitRect.height, committed.s, categoriesById],
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

  // Suivi de position : la carte se recentre à chaque nouvelle position tant que l'état
  // « suivi » dure. Hors suivi, la position ne bouge jamais la vue.
  const followPct = position?.following ? position.displayPct : null;
  useEffect(() => {
    if (!followPct) return;
    focusOnPct({ xp: followPct.xp, yp: followPct.yp });
  }, [followPct, focusOnPct]);

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

  /**
   * Contre-échelle des habillages : le calque monde est mis à l'échelle par la vue, donc tout
   * ce qu'il porte grossit avec elle — à l'échelle maximale (8), l'emoji d'un repère mesurait
   * ~170 px (audit B5). `--pct-inv` rend aux étiquettes, aux pastilles et aux contours une
   * taille constante à l'écran, sans re-rendre un seul élément (une variable CSS suffit).
   */
  const fitStyle = useMemo(() => {
    const inv = committed.s > 0 ? 1 / committed.s : 1;
    const box =
      fitRect.width > 0 && fitRect.height > 0
        ? {
            left: fitRect.offsetX,
            top: fitRect.offsetY,
            width: fitRect.width,
            height: fitRect.height,
          }
        : { left: 0, top: 0, width: '100%', height: '100%' };
    return { ...box, '--pct-inv': inv };
  }, [fitRect, committed.s]);

  const selectedZoneId = selectedPlace?.kind === 'zone' ? selectedPlace.id : null;
  const selectedMarkerId = selectedPlace?.kind === 'marker' ? selectedPlace.id : null;
  const pinnedKey = selectedPlace ? labelKey(selectedPlace.kind, selectedPlace.id) : '';

  /**
   * Étiquettes : plus aucun seuil de zoom, plus aucun nom posé au hasard sur son voisin.
   * Tout nom est candidat à toute échelle, et le placement glouton par priorité décide de ce
   * qui tient (`pctMapLabels.js`). Comme les étiquettes gardent une taille constante à
   * l'écran (contre-échelle `--pct-inv` ci-dessous), zoomer écarte les ancres sans grossir
   * les boîtes : les noms masqués réapparaissent seuls.
   */
  const zoneLabelSpecs = useMemo(
    () => buildZoneLabelSpecs(visibleZones, splitNameEmoji),
    [visibleZones],
  );
  const visibleLabelKeys = useMemo(
    () =>
      resolveVisibleLabels({
        zoneSpecs: zoneLabelSpecs,
        markers: visibleMarkers,
        categoriesById,
        contentWidthPx: fitRect.width,
        contentHeightPx: fitRect.height,
        scale: committed.s,
        pinnedKey,
      }),
    [
      zoneLabelSpecs,
      visibleMarkers,
      categoriesById,
      fitRect.width,
      fitRect.height,
      committed.s,
      pinnedKey,
    ],
  );
  const zoneLabels = useMemo(
    () =>
      zoneLabelSpecs
        .filter((spec) => spec.emoji || visibleLabelKeys.has(spec.key))
        .map((spec) => ({
          id: spec.key,
          xp: spec.anchor.xp,
          yp: spec.anchor.yp,
          emoji: spec.emoji,
          // L'emoji d'une zone reste toujours visible (il tient dans le polygone) ; c'est le
          // **nom** que la résolution de collisions peut masquer.
          name: visibleLabelKeys.has(spec.key) ? spec.name : '',
          maxWidthPx: zoneLabelMaxWidthPx(spec, fitRect.width, committed.s),
          active: selectedZoneId != null && String(selectedZoneId) === spec.id,
        })),
    [zoneLabelSpecs, visibleLabelKeys, fitRect.width, committed.s, selectedZoneId],
  );

  const markerLabelOf = useCallback(
    (marker) => {
      const label = String(marker?.label ?? marker?.name ?? '').trim();
      if (!label) return '';
      return visibleLabelKeys.has(labelKey('marker', marker.id)) ? label : '';
    },
    [visibleLabelKeys],
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
            zones={visibleZones}
            onZoneClick={onZoneClick}
            activeZoneId={selectedZoneId}
            showLabels={false}
            className="fm-pct-zones plan-map__zones"
          />
          <PctLabelsLayer labels={zoneLabels} />
          {position?.displayPct && targetPct ? (
            <PctDirectLine from={position.displayPct} to={targetPct} />
          ) : null}
          <PctClusterLayer
            clusters={clusters}
            onClusterClick={onClusterClick}
            renderMarker={renderMarker}
            colorOf={clusterColorOf}
          />
          {position?.displayPct ? (
            <PctPositionLayer
              position={position.displayPct}
              haloPx={accuracyHaloDiameterPx(position.haloPct, fitRect.width)}
              headingDeg={position.screenHeadingDeg}
              accuracyM={position.accuracyM}
            />
          ) : null}
        </div>
      </div>

      <div className="plan-map-controls">
        {position?.available ? (
          <MapActionButton
            role={position.following ? 'primary' : 'display'}
            icon={POSITION_ICONS[position.mode] || POSITION_ICONS.off}
            label={POSITION_LABELS[position.mode] || POSITION_LABELS.off}
            testId="plan-locate"
            active={position.active}
            ariaPressed={position.active}
            onClick={position.toggle}
          />
        ) : null}
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
