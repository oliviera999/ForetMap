import { useCallback, useEffect, useMemo, useRef } from 'react';

import { headingUpOrientationDeg } from './pctMapOrientation.js';
import { MapScaleCompassOverlay } from './MapScaleCompassOverlay.jsx';

import { MapActionButton } from '../ui/MapActionButton.jsx';
import { PctClusterLayer } from './PctClusterLayer.jsx';
import { PctImageLayer } from './PctImageLayer.jsx';
import { PctMarkerButton, PctMarkersLayer } from './PctMarkersLayer.jsx';
import { PctZonesLayer } from './PctZonesLayer.jsx';
import { usePctMapViewport } from './usePctMapViewport.js';
import {
  clusterCenterPct,
  clusterMarkers,
  clusterSeparatesOnZoom,
  clusterZoomTargetScale,
} from './clusterMarkers.js';
import { PctLabelsLayer } from './PctLabelsLayer.jsx';
import {
  LABEL_EMOJI_SIZE_PX,
  LABEL_FONT_SIZE_PX,
  MARKER_LABEL_OFFSET_PX,
  buildZoneLabelSpecs,
  labelKey,
  resolveVisibleLabels,
  zoneLabelMaxWidthPx,
} from './pctMapLabels.js';
import { PctDirectLine, PctPositionLayer } from './PctPositionLayer.jsx';
import { accuracyHaloDiameterPx } from './positionGeometry.js';

/** Cibles qui ne démarrent pas un déplacement de carte (commandes superposées). */
const DEFAULT_GESTURE_IGNORE =
  '.plan-map-controls, .plan-map-controls *, .fm-pct-map-controls, .fm-pct-map-controls *';

/** Rapport `échelle / ajustement` au-delà duquel la carte compte comme « zoomée ». */
const ZOOM_ONLY_RATIO = 1.6;

/** Bouton « Me situer » : quatre états visuels (lot 6). */
const POSITION_ICONS = Object.freeze({
  off: '◎',
  acquiring: '◌',
  on: '◉',
  follow: '⦿',
});

/**
 * Scène carte plein écran partagée (Plan Lyautey, Visite, …) : moteur `usePctMapViewport`
 * en mode « scène », calques zones / repères / position, commandes zoom et localisation.
 *
 * Comportement par défaut = Plan (`className="plan-map"`, clustering, catégories zoom-only).
 *
 * @param {object} props
 * @param {{ map_image_url?: string, label?: string, id?: *, geo_anchors?: * }} props.map
 * @param {Array<object>} props.zones
 * @param {Array<object>} props.markers
 * @param {object|null} props.selectedPlace
 * @param {(place: object) => void} props.onSelectPlace
 * @param {(rawName: string) => { emoji: string, name: string }} props.splitNameEmoji
 * @param {(place: object) => ({ xp: number, yp: number }|null)} props.focusPlacePct
 * @param {(markers: Array<object>) => void} [props.onOpenGroup]
 * @param {Map<string, object>} [props.categoriesById]
 * @param {object|null} [props.position]
 * @param {() => void} [props.onLocateToggle]
 * @param {{ xp: number, yp: number }|null} [props.targetPct]
 * @param {{ top?: number, right?: number, bottom?: number, left?: number }|null} [props.focusInsets]
 * @param {string} [props.className]
 * @param {string} [props.worldClassName]
 * @param {string} [props.fitClassName]
 * @param {string} [props.imgClassName]
 * @param {string} [props.controlsClassName]
 * @param {string} [props.gestureIgnoreSelector]
 * @param {string} [props.testIdPrefix]
 * @param {string} [props.locateLabel]
 * @param {(zoneOrMarker: object) => boolean|null} [props.getIsSeen]
 * @param {boolean} [props.clusteringEnabled]
 * @param {boolean} [props.applyZoomOnlyCategories]
 * @param {boolean} [props.showLabels=true] afficher les noms (emojis de zone restent visibles)
 * @param {import('react').ReactNode} [props.overlaySlot]
 * @param {import('react').ReactNode} [props.chromeSlot]
 * @param {import('react').ReactNode} [props.emptySlot]
 * @param {(viewport: object) => void} [props.onViewportChange]
 * @param {boolean} [props.gesturesEnabled=true]
 * @param {object|null} [props.fitExtraStyle]
 * @param {() => void} [props.onMapImageError]
 * @param {(event: object) => void} [props.onBackgroundClick]
 */
export function SharedMapStage({
  map,
  zones,
  markers,
  selectedPlace,
  onSelectPlace,
  onOpenGroup = null,
  categoriesById = null,
  position = null,
  onLocateToggle = null,
  targetPct = null,
  focusInsets = null,
  headingUpAllowed = false,
  headingUpEffective = false,
  headingUpUserEnabled = false,
  onHeadingUpToggle = null,
  scaleCompassAllowed = false,
  scaleCompassEffective = false,
  onScaleCompassToggle = null,
  className = 'plan-map',
  worldClassName = 'plan-map__world',
  fitClassName = 'plan-map__fit',
  imgClassName = 'plan-map__img',
  controlsClassName = 'plan-map-controls fm-pct-map-controls',
  gestureIgnoreSelector = DEFAULT_GESTURE_IGNORE,
  testIdPrefix = 'plan',
  locateLabel = 'Me situer',
  getIsSeen = null,
  clusteringEnabled = true,
  applyZoomOnlyCategories = true,
  /** Afficher les noms (zones via `PctLabelsLayer`, repères via pastilles). */
  showLabels = true,
  splitNameEmoji,
  focusPlacePct,
  overlaySlot = null,
  chromeSlot = null,
  emptySlot = null,
  onViewportChange = null,
  /** Gestes pan/zoom (désactivés en édition Visite : pose de points). */
  gesturesEnabled = true,
  /** Styles CSS fusionnés au calque « fit » (ex. taille de texte Visite). */
  fitExtraStyle = null,
  /** Repli produit si l'image du plan échoue à charger. */
  onMapImageError = null,
  /** Clic fond de carte (hors zone / repère / commandes) — ex. déplacer la mascotte. */
  onBackgroundClick = null,
}) {
  const imageSrc = String(map?.map_image_url || '');
  const viewport = usePctMapViewport({
    imageSrc,
    contentMode: 'stage',
    enabled: gesturesEnabled,
    onResize: 'clamp',
    resetKey: String(map?.id || ''),
    isGestureTarget: gestureIgnoreSelector,
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
    imgSize,
    fitMap,
    fitMapAnimated,
    zoomBy,
    focusOnPct,
    consumeSkipClick,
    toImagePct,
    touchAction,
    setMapOrientation,
    orientStyle,
  } = viewport;

  const positionLabels = useMemo(
    () =>
      Object.freeze({
        off: locateLabel,
        acquiring: 'Recherche de votre position…',
        on: 'Suivre ma position',
        follow: 'Arrêter le suivi',
      }),
    [locateLabel],
  );

  useEffect(() => {
    if (typeof onViewportChange !== 'function') return;
    // Pont pour les produits qui gardent un contrôleur externe (mascotte, parcours, édition).
    onViewportChange({
      fitRect,
      committed,
      focusOnPct,
      consumeSkipClick,
      toImagePct,
      fitMap,
      fitMapAnimated,
      zoomBy,
      setMapOrientation,
      imgSize,
      stageSize,
    });
  }, [
    onViewportChange,
    fitRect,
    committed,
    focusOnPct,
    consumeSkipClick,
    toImagePct,
    fitMap,
    fitMapAnimated,
    zoomBy,
    setMapOrientation,
    imgSize,
    stageSize,
  ]);

  const onZoneClick = useCallback(
    (zone, event) => {
      event?.stopPropagation?.();
      if (consumeSkipClick()) return;
      onSelectPlace({ ...zone, kind: 'zone', name: String(zone.name || '').trim() });
    },
    [consumeSkipClick, onSelectPlace],
  );
  const onMarkerClick = useCallback(
    (marker, event) => {
      event?.stopPropagation?.();
      if (consumeSkipClick()) return;
      onSelectPlace({ ...marker, kind: 'marker', name: String(marker.label || '').trim() });
    },
    [consumeSkipClick, onSelectPlace],
  );
  /**
   * Catégories « visibles seulement au zoom » : leurs lieux disparaissent tant que
   * la carte est vue en entier, et reviennent dès qu'on zoome. Désactivable via
   * `applyZoomOnlyCategories` (Visite en édition, etc.).
   */
  const zoomedIn = fitScale > 0 ? committed.s / fitScale >= ZOOM_ONLY_RATIO : false;
  const isVisibleAtScale = useCallback(
    (place) => {
      if (!applyZoomOnlyCategories) return true;
      if (zoomedIn) return true;
      const ids = place?.category_ids || [];
      if (ids.length === 0) return true;
      return ids.some((id) => !categoriesById?.get?.(String(id))?.zoom_only);
    },
    [applyZoomOnlyCategories, zoomedIn, categoriesById],
  );
  const visibleZones = useMemo(
    () => (zones || []).filter(isVisibleAtScale),
    [zones, isVisibleAtScale],
  );
  const visibleMarkers = useMemo(
    () => (markers || []).filter(isVisibleAtScale),
    [markers, isVisibleAtScale],
  );

  // Désencombrement : au dézoom, les repères dont les pastilles se recouvrent sont
  // fusionnés en une pastille de groupe. Recalculé au commit de transformation seulement.
  const clusters = useMemo(
    () =>
      clusteringEnabled
        ? clusterMarkers(visibleMarkers, {
            contentWidthPx: fitRect.width,
            contentHeightPx: fitRect.height,
            scale: committed.s,
            categoriesById,
          })
        : [],
    [clusteringEnabled, visibleMarkers, fitRect.width, fitRect.height, committed.s, categoriesById],
  );

  const onClusterClick = useCallback(
    (cluster, event) => {
      event?.stopPropagation?.();
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

  const handleBackgroundClick = useCallback(
    (event) => {
      if (typeof onBackgroundClick !== 'function') return;
      // Ne pas traiter un clic issu des commandes / pastilles / zones (déjà stoppés).
      if (
        event.target?.closest?.(
          '.fm-pct-map-controls, .plan-map-controls, .fm-map-action, .fm-pct-marker, .fm-pct-zones, .map-route-bar, .map-route-resume',
        )
      ) {
        return;
      }
      if (consumeSkipClick()) return;
      onBackgroundClick(event);
    },
    [onBackgroundClick, consumeSkipClick],
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

  // Heading-up : rotation intérieure autour de la position (ou centre) ; pan/zoom inchangés.
  const orientPivot = position?.displayPct || null;
  const mapOrientationDeg = headingUpEffective
    ? headingUpOrientationDeg(
        position?.smoothedScreenHeadingDeg ?? position?.screenHeadingDeg ?? null,
      )
    : 0;
  useEffect(() => {
    if (!headingUpEffective) {
      setMapOrientation({ deg: 0, originPct: null });
      return;
    }
    const heading = position?.smoothedScreenHeadingDeg ?? position?.screenHeadingDeg ?? null;
    setMapOrientation({
      deg: headingUpOrientationDeg(heading),
      originPct: orientPivot,
    });
  }, [
    headingUpEffective,
    orientPivot?.xp,
    orientPivot?.yp,
    position?.smoothedScreenHeadingDeg,
    position?.screenHeadingDeg,
    setMapOrientation,
  ]);

  // Suivi de position : la carte se recentre à chaque nouvelle position tant que l'état
  // « suivi » dure. Hors suivi, la position ne bouge jamais la vue.
  const followPct = position?.following ? position.displayPct : null;
  useEffect(() => {
    if (!followPct) return;
    focusOnPct({ xp: followPct.xp, yp: followPct.yp });
  }, [followPct, focusOnPct]);

  // Centrage sur le lieu sélectionné : une fois par lieu, jamais pendant que l'on manipule
  // la carte (sinon la vue « saute » sous le doigt à chaque re-rendu de la fiche).
  // `focusInsets` décale le centre vers la zone encore visible (barre parcours en bas).
  const lastFocusedRef = useRef('');
  const focusInsetsKey = focusInsets
    ? `${focusInsets.top || 0},${focusInsets.right || 0},${focusInsets.bottom || 0},${focusInsets.left || 0}`
    : '';
  useEffect(() => {
    const key = selectedPlace ? `${selectedPlace.kind}:${selectedPlace.id}:${focusInsetsKey}` : '';
    if (!key || key === lastFocusedRef.current) {
      if (!selectedPlace) lastFocusedRef.current = '';
      return;
    }
    const pct = typeof focusPlacePct === 'function' ? focusPlacePct(selectedPlace) : null;
    if (!pct) return;
    lastFocusedRef.current = key;
    focusOnPct(pct, { insets: focusInsets });
  }, [selectedPlace, focusOnPct, focusInsets, focusInsetsKey, focusPlacePct]);

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
    return {
      ...box,
      '--pct-inv': inv,
      // Angle appliqué à ce calque : les habillages lisibles (étiquettes, repères, pastilles)
      // le défont sur eux-mêmes en CSS, sinon le texte se retourne avec la carte (N1).
      '--pct-orient': `${mapOrientationDeg}deg`,
      '--map-overlay-label-font-size': `${LABEL_FONT_SIZE_PX}px`,
      '--map-overlay-emoji-font-size': `${LABEL_EMOJI_SIZE_PX}px`,
      '--map-overlay-marker-label-offset': `${MARKER_LABEL_OFFSET_PX}px`,
      ...(fitExtraStyle && typeof fitExtraStyle === 'object' ? fitExtraStyle : null),
    };
  }, [fitRect, committed.s, mapOrientationDeg, fitExtraStyle]);

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
    [visibleZones, splitNameEmoji],
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
        // Étiquettes contre-tournées (N1) : leurs boîtes sont alignées sur l'écran, leurs
        // ancres non. Sans l'angle, deux noms qui ne se gênent pas au nord se recouvrent
        // dès que l'on pivote.
        orientationDeg: mapOrientationDeg,
        orientOriginPct: orientPivot,
      }),
    [
      zoneLabelSpecs,
      visibleMarkers,
      categoriesById,
      fitRect.width,
      fitRect.height,
      committed.s,
      pinnedKey,
      mapOrientationDeg,
      orientPivot?.xp,
      orientPivot?.yp,
    ],
  );
  const zoneLabels = useMemo(() => {
    if (!showLabels) {
      // Emojis seuls : le nom est masqué (bascule « étiquettes » carte de travail).
      return zoneLabelSpecs
        .filter((spec) => spec.emoji)
        .map((spec) => ({
          id: spec.key,
          xp: spec.anchor.xp,
          yp: spec.anchor.yp,
          emoji: spec.emoji,
          name: '',
          maxWidthPx: zoneLabelMaxWidthPx(spec, fitRect.width, committed.s),
          active: selectedZoneId != null && String(selectedZoneId) === spec.id,
        }));
    }
    return zoneLabelSpecs
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
      }));
  }, [showLabels, zoneLabelSpecs, visibleLabelKeys, fitRect.width, committed.s, selectedZoneId]);

  const markerLabelOf = useCallback(
    (marker) => {
      if (!showLabels) return '';
      const label = String(marker?.label ?? marker?.name ?? '').trim();
      if (!label) return '';
      return visibleLabelKeys.has(labelKey('marker', marker.id)) ? label : '';
    },
    [showLabels, visibleLabelKeys],
  );

  const renderMarker = useCallback(
    (marker) => (
      <PctMarkerButton
        key={marker.id}
        marker={marker}
        isActive={selectedMarkerId != null && String(selectedMarkerId) === String(marker.id)}
        isSeen={typeof getIsSeen === 'function' ? getIsSeen(marker) : null}
        onMarkerClick={onMarkerClick}
        labelOf={markerLabelOf}
      />
    ),
    [onMarkerClick, selectedMarkerId, markerLabelOf, getIsSeen],
  );

  const tid = (suffix) => `${testIdPrefix}-${suffix}`;

  // Plan expose `geo_anchors` ; carte / Visite exposent `georef` (même charge utile).
  const mapGeoref = map?.geo_anchors || map?.georef || null;

  return (
    // Clic fond de carte (mascotte / édition Visite) : pas de rôle clavier dédié —
    // les lieux restent des boutons ; le fond n'est pas une commande primaire.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- canvas carte
    <div
      className={className}
      ref={containerRef}
      style={{ touchAction }}
      onClick={handleBackgroundClick}
    >
      <div
        ref={worldRef}
        className={worldClassName}
        style={{
          transform: `translate3d(${committed.x}px, ${committed.y}px, 0) scale(${committed.s})`,
          transformOrigin: '0 0',
        }}
      >
        <div className={fitClassName} style={{ ...fitStyle, ...orientStyle }}>
          <PctImageLayer
            ref={imgRef}
            src={imageSrc}
            alt={`Plan ${map?.label || 'de l’établissement'}`}
            className={imgClassName}
            onLoad={fitMap}
            onError={onMapImageError}
          />
          <PctZonesLayer
            zones={visibleZones}
            onZoneClick={onZoneClick}
            activeZoneId={selectedZoneId}
            showLabels={false}
            getIsSeen={getIsSeen}
            className="fm-pct-zones plan-map__zones"
          />
          <PctLabelsLayer labels={zoneLabels} />
          {position?.displayPct && targetPct ? (
            <PctDirectLine from={position.displayPct} to={targetPct} />
          ) : null}
          {clusteringEnabled ? (
            <PctClusterLayer
              clusters={clusters}
              onClusterClick={onClusterClick}
              renderMarker={renderMarker}
              colorOf={clusterColorOf}
            />
          ) : (
            <PctMarkersLayer
              markers={visibleMarkers}
              onMarkerClick={onMarkerClick}
              activeMarkerId={selectedMarkerId}
              getIsSeen={getIsSeen}
              labelOf={markerLabelOf}
            />
          )}
          {position?.displayPct ? (
            <PctPositionLayer
              position={position.displayPct}
              haloPx={accuracyHaloDiameterPx(position.haloPct, fitRect.width)}
              headingDeg={headingUpEffective ? null : position.screenHeadingDeg}
              accuracyM={position.accuracyM}
            />
          ) : null}
          {overlaySlot}
        </div>
      </div>

      <MapScaleCompassOverlay
        visible={scaleCompassEffective}
        georef={mapGeoref}
        contentWidthPx={fitRect.width}
        scale={committed.s}
        orientationDeg={mapOrientationDeg}
      />

      <div className={controlsClassName}>
        {position?.available ? (
          <MapActionButton
            role={position.following ? 'primary' : 'display'}
            icon={POSITION_ICONS[position.mode] || POSITION_ICONS.off}
            label={positionLabels[position.mode] || positionLabels.off}
            testId={tid('locate')}
            active={position.active}
            ariaPressed={position.active}
            onClick={onLocateToggle || position.toggle}
          />
        ) : null}
        {headingUpAllowed && position?.available && position?.active ? (
          <MapActionButton
            role={headingUpEffective ? 'primary' : 'display'}
            icon="🧭"
            label={
              !position.headingAvailable
                ? 'Boussole indisponible'
                : headingUpUserEnabled
                  ? 'Désorienter la carte'
                  : 'Orienter la carte selon la boussole'
            }
            testId={tid('heading-up')}
            active={headingUpEffective}
            ariaPressed={headingUpEffective}
            disabled={!position.headingAvailable}
            onClick={onHeadingUpToggle}
          />
        ) : null}
        {scaleCompassAllowed ? (
          <MapActionButton
            role={scaleCompassEffective ? 'primary' : 'display'}
            icon="📏"
            label={
              scaleCompassEffective
                ? 'Masquer l’échelle et la rose des vents'
                : 'Afficher l’échelle et la rose des vents'
            }
            testId={tid('scale-compass-toggle')}
            active={scaleCompassEffective}
            ariaPressed={scaleCompassEffective}
            onClick={onScaleCompassToggle}
          />
        ) : null}
        <MapActionButton
          role="display"
          icon="＋"
          label="Zoomer"
          testId={tid('zoom-in')}
          onClick={() => zoomBy(1.2)}
        />
        <MapActionButton
          role="display"
          icon="－"
          label="Dézoomer"
          testId={tid('zoom-out')}
          onClick={() => zoomBy(0.84)}
        />
        <MapActionButton
          role="display"
          icon="⊡"
          label="Voir tout le plan"
          testId={tid('zoom-reset')}
          onClick={fitMapAnimated}
        />
      </div>

      {chromeSlot}
      {emptySlot}
    </div>
  );
}
