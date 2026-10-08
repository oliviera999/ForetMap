import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';

import { routeEntryFocusPct } from '../shared/map-routes/mapRouteSteps.js';
import { distanceMetersBetweenPct, formatDistanceFr } from '../shared/pct-map/positionGeometry.js';

import { TutorialPreviewModal } from './TutorialPreviewModal';

import { MapViewMascotOverlay } from './MapViewMascotOverlay.jsx';
import { clusterMarkers } from '../shared/pct-map/clusterMarkers.js';
import useMapViewMascot from '../hooks/useMapViewMascot.js';
import { resolveMapViewMascotFitScale } from '../utils/mapViewMascotMotion.js';
import useZoneDrawing from '../hooks/useZoneDrawing.js';
import useZoneEditPoints from '../hooks/useZoneEditPoints.js';
import useZoneAlignMode from '../hooks/useZoneAlignMode.js';
import useMapCrudActions from '../hooks/useMapCrudActions.js';
import { MascotGpsStatusBanner } from './MascotGpsStatusBanner.jsx';
import { useVisitMascotRegistry } from '../hooks/useVisitMascotCatalogExtras.js';
import { useMapGestures } from '../hooks/useMapGestures.js';

import { TimedToast } from '../shared/components/TimedToast.jsx';
import { ImageLightbox } from '../shared/components/ImageLightbox.jsx';
import {
  CatalogRemarksSection,
  LivingBeingsCatalogPanel,
  BiodiversitySpeciesOpenLinks,
} from './map/LivingBeingsCatalogPanel.jsx';

import { parseZonesForLayer } from './map/ZonePolygonsLayer.jsx';
import { contentAspect } from '../shared/pct-map/pctMapLabels.js';
import { MapViewEditCanvas } from './map/MapViewEditCanvas.jsx';
import { sensitivityToMinStrength } from '../utils/edgeSnap.js';
import {
  NEIGHBOR_SNAP_DEFAULT_RADIUS_PCT,
  normalizeNeighborZones,
} from '../utils/zoneNeighborSnap.js';
import { ZoneDrawModal } from './map/ZoneDrawModal.jsx';
import { PhotoGallery } from './map/PhotoGallery.jsx';
import { LocationTutorialPreviewList } from './map/mapModalShared.jsx';
import { ZoneInfoModal } from './map/ZoneInfoModal.jsx';
import { MarkerModal } from './map/MarkerModal.jsx';
import { MapViewLocationModals } from './map/MapViewLocationModals.jsx';
import { useMapViewPosition } from './map/useMapViewPosition.js';
import { useMapViewRoutes } from './map/useMapViewRoutes.js';
import { useMapViewTypography } from './map/useMapViewTypography.js';
import { useMapViewBadges } from './map/useMapViewBadges.js';
import { useMapViewPlaceHandlers } from './map/useMapViewPlaceHandlers.js';
import { usePlaceFocusSequence } from '../shared/pct-map/usePlaceFocusSequence.js';
import { usePlaceFocusFx } from '../shared/pct-map/usePlaceFocusFx.js';
import { resolvePlaceFocusSettings } from '../shared/pct-map/placeFocusSettings.js';
import { useMapViewEdgeSnap } from './map/useMapViewEdgeSnap.js';
import { useMapViewHandoff } from './map/useMapViewHandoff.js';
import { useTutorialReadIds } from './map/useTutorialReadIds.js';
import {
  MapViewLocationSearch,
  MapViewRouteControls,
  MapViewRoutePickerRow,
  mapCanvasOuterStyle,
  mapCursorForMode,
} from './map/MapViewPanels.jsx';
import {
  useMapViewActiveMap,
  useMapViewData,
  useMapViewSettings,
} from './map/useMapViewContext.js';
import { MapViewToolbar } from './map/MapViewToolbar.jsx';
import { MapCanvasHints } from './map/MapCanvasHints.jsx';
import { WorkMapStage } from './map/WorkMapStage.jsx';
import { useMapViewLocationFilters } from './map/useMapViewLocationFilters.js';
import { useMapCategories } from '../hooks/useMapCategories.js';
import { markerFocusPct, zoneFocusPctFromPoints } from '../utils/mapFocusLocation.js';
import { useMapFullscreen } from '../shared/hooks/useMapFullscreen.js';
import { MapFullscreenShell } from '../shared/components/MapFullscreenShell.jsx';
import { resolveMapCanvasHint } from '../utils/helpResolve.js';
import { pointsSurfaceLabel } from '../utils/zoneSurface.js';

function Lightbox({ src, caption, onClose, useOverlayHistory = true }) {
  return (
    <ImageLightbox
      src={src}
      caption={caption}
      onClose={onClose}
      useOverlayHistory={useOverlayHistory}
    />
  );
}

const NO_MAPS = [];
/** Marge basse avant la première mesure de la barre de parcours (identité stable). */
const ROUTE_BAR_FALLBACK_INSETS = Object.freeze({ bottom: 96 });

function MapViewImpl({
  maps = NO_MAPS,
  onMapChange,
  isTeacher,
  student,
  canSelfAssignTasks = true,
  canEnrollOnTasks,
  onZoneUpdate,
  onRefresh,
  embedded = false,
  onLocationTasksFocus = null,
  onNavigateToTasksForLocation = null,
  onOpenPlantCatalogPreview = null,
  onPersistVisitMascotId = null,
  onForceLogout,
  routeRequest = null,
  onRouteRequestHandled = null,
  placeRequest = null,
  onPlaceRequestHandled = null,
}) {
  const {
    canParticipateContextComments,
    zones,
    markers,
    tasks,
    tutorials,
    plants,
    activeMapId,
    markersOnActiveMap: mapMarkersOnActiveMap,
    zonesOnActiveMap: mapZonesOnActiveMap,
  } = useMapViewData(maps);
  const {
    publicSettings,
    markerEmojis,
    emojiParsingList,
    visitMascotDefaultId,
    mascotDialogSettings,
    contextCommentsEnabled,
    headingUpSiteEnabled,
  } = useMapViewSettings();
  const {
    activeMap,
    activeMapLabel,
    activeMapGeoref,
    mapImageSrc,
    onMapImageError,
    mapFramePaddingPx,
  } = useMapViewActiveMap(maps, activeMapId);
  const canEnrollNewTasks = canEnrollOnTasks !== undefined ? canEnrollOnTasks : canSelfAssignTasks;
  const [mode, setMode] = useState('view');
  const [showLabels, setShowLabels] = useState(true);
  // Regroupement des repères au dézoom (lot 5) : actif par défaut, débrayable depuis la
  // barre d'outils — un professeur qui place des repères veut parfois les voir tous.
  const [clusterMarkersEnabled, setClusterMarkersEnabled] = useState(true);
  const [selectedZone, setSelectedZone] = useState(null);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [pendingZone, setPendingZone] = useState(null);
  const [pendingMarker, setPendingMarker] = useState(null);
  const [neighborSnapEnabled, setNeighborSnapEnabled] = useState(false);
  const allNeighborZones = useMemo(() => normalizeNeighborZones(zones), [zones]);
  // Tracé de zone (mode draw-zone) : points cliqués + actions barre d'outils.
  const { drawPoints, addDrawPoint, resetDrawPoints, finishZone, undoPoint, cancelDraw } =
    useZoneDrawing({
      setMode,
      setPendingZone,
      neighborSnapEnabled,
      neighborZones: allNeighborZones,
      neighborSnapRadiusPct: NEIGHBOR_SNAP_DEFAULT_RADIUS_PCT,
    });
  const [toast, setToast] = useState(null);
  const [mapTutorialPreview, setMapTutorialPreview] = useState(null);
  const [markerPositionUnlocked, setMarkerPositionUnlocked] = useState(false);
  const { mapFullscreen, setMapFullscreen, openMapFullscreen, closeMapFullscreen } =
    useMapFullscreen({
      escapeBlocked: Boolean(
        selectedZone || selectedMarker || pendingZone || pendingMarker || mapTutorialPreview,
      ),
    });
  // Registre global des mascottes proposées → la mascotte peut être un pack importé (srv-…),
  // le choix du visiteur vaut sur toutes les cartes, et `offeredIds` borne la liste à ce que
  // le studio propose (sinon le catalogue livré revenait en entier, dépublication ignorée).
  const { extras: visitMascotCatalogExtras, offeredIds: visitMascotOfferedIds } =
    useVisitMascotRegistry({ enabled: mode === 'view' });
  const mapLayoutOuterRef = useRef(null);
  const {
    containerRef,
    worldRef,
    imgRef,
    tx,
    committed,
    fitScale,
    imgSize,
    stageSize: editStageSize,
    moved,
    fitMap,
    remeasureMap,
    restoreView: restoreEditView,
    toImagePct,
    focusOnPct,
    beginMarkerDrag,
    isCoarsePointer,
    mapInteractionEnabled,
    toggleMapInteraction,
    prefersPageScroll,
    touchAction,
    animateZoomTowardScale,
    beginPan,
    updatePan,
    endPan,
    panByScreenDelta,
    setMapOrientation,
    mapOrientation,
    orientStyle,
  } = useMapGestures({
    mapImageSrc,
    activeMapId,
    mode,
    onRefresh,
    embedded,
    mapLayoutOuterRef,
    mapFullscreen,
  });

  /**
   * Pont viewport SharedMapStage (mode consultation) : focus / largeur barre d'outils.
   * Hors consultation, on retombe sur `useMapGestures`.
   */
  const workViewportApiRef = useRef({
    focusOnPct: () => {},
    fitMap: () => {},
    fitMapAnimated: () => {},
    zoomBy: () => {},
    toImagePct: () => null,
    stageSize: { w: 0, h: 0 },
  });
  /**
   * Contre-échelle mascotte dans SharedMapStage (calque monde zoomé).
   * `Math.max(1, 1/s)` : un focus sur un lieu de tâche (s > 1) ne doit pas rétrécir
   * la mascotte jusqu'à l'invisible — voir `resolveMapViewMascotFitScale`.
   */
  const [workMascotFitScale, setWorkMascotFitScale] = useState(1);
  /**
   * Hauteur affichée du plan DANS SharedMapStage (`fitRect.height`).
   *
   * Le viewport historique (`useMapGestures`) mesure `imgSize` sur son `<img>` — non monté en
   * consultation, où c'est `SharedMapStage` qui porte l'image. `imgSize.h` y restait donc au
   * `1` initial de `usePctMapViewport`, et la marge basse de `clampMapMascotPctForViewport`
   * (fraction de cette hauteur) envoyait la mascotte à `top: 7800%` — invisible sur la carte
   * de travail des tâches. La scène partagée est la seule à connaître sa hauteur : on la lui
   * demande.
   */
  const [workFitHeightPx, setWorkFitHeightPx] = useState(0);
  /** Consultation élève/prof sans édition géométrie ni glisser de repères. */
  const useSharedViewStage = mode === 'view' && !markerPositionUnlocked;
  const { stageInitialView } = useMapViewHandoff({
    useSharedViewStage,
    committed,
    stageSize: editStageSize,
    imgSize,
    fitScale,
    restoreView: restoreEditView,
    workViewportApiRef,
  });
  const onWorkViewportChange = useCallback((api) => {
    workViewportApiRef.current = { ...workViewportApiRef.current, ...api };
    const root = mapLayoutOuterRef.current?.closest?.('.map-view-root');
    const w = Number(api?.stageSize?.w) || 0;
    if (root && w > 0) root.style.setProperty('--fm-map-canvas-w', `${w}px`);
    const s = Number(api?.committed?.s) || 0;
    if (s > 0) setWorkMascotFitScale(resolveMapViewMascotFitScale(s));
    const fitH = Number(api?.fitRect?.height) || 0;
    if (fitH > 0) setWorkFitHeightPx((prev) => (prev === fitH ? prev : fitH));
  }, []);
  const focusMapPct = useCallback(
    (pct, opts) => {
      if (useSharedViewStage) {
        return workViewportApiRef.current.focusOnPct?.(pct, opts);
      }
      return focusOnPct(pct, opts);
    },
    [useSharedViewStage, focusOnPct],
  );

  // Parcours de la carte : chargement, étape courante, reprise, demande de séance.
  const {
    mapRoutes,
    routePlaces,
    setRouteBarHeight,
    activeRoute,
    routeSteps,
    routeIndex,
    currentRouteEntry,
    routePickerOpen,
    setRoutePickerOpen,
    resumableRouteSlug,
    startRoute,
    exitRoute,
    resumeRoute,
    goToRouteIndex,
    routePhase,
    beginRouteSteps,
    showRouteOverview,
    routeFocusInsets,
    routeSettings,
    stageRoute,
  } = useMapViewRoutes({
    activeMapId,
    zonesOnMap: mapZonesOnActiveMap,
    markersOnMap: mapMarkersOnActiveMap,
    mode,
    focusMapPct,
    setSelectedZone,
    setSelectedMarker,
    routeRequest,
    onRouteRequestHandled,
    routeSettingsRaw: publicSettings?.routes,
  });
  const [commentsFocusKey, setCommentsFocusKey] = useState(null);
  useEffect(() => {
    if (!selectedZone && !selectedMarker) setCommentsFocusKey(null);
  }, [selectedZone, selectedMarker]);
  const { s: cs } = committed;
  const { w: iw, h: ih } = imgSize;
  const inv = 1 / cs;
  // Aimant de contour (lot « ancrage magnétique ») : analyse de l'image de fond à la demande.
  const {
    snapEnabled,
    setSnapEnabled,
    snapRadiusPx,
    setSnapRadiusPx,
    snapSensitivity,
    setSnapSensitivity,
    edgeSnap,
    snapRadiusPct,
    edgeTolerancePct,
  } = useMapViewEdgeSnap({ mapImageSrc, mode, iw, inv });

  // Édition du contour d'une zone (mode edit-points) : session, historique Ctrl+Z, translation.
  const {
    editZone,
    editPoints,
    draggingPtIdx,
    editCanUndo,
    undoEditPoints,
    startEditPoints,
    saveEditPoints,
    discardEditPointsSession,
    onTranslatePointerDown,
    onTranslatePointerMove,
    endEditZoneTranslate,
    onTranslateLostPointerCapture,
    onEditPointPointerDown,
    onEditPointPointerMove,
    onEditPointPointerUp,
    insertVertexMode,
    toggleInsertVertexMode,
    insertPointFromPct,
    insertPointAtMidpoint,
    removeSelectedPoints,
    canRemoveSelection,
    selectedPtIdxs,
    multiSelectMode,
    toggleMultiSelectMode,
    onBackgroundPointerDown,
    onBackgroundPointerMove,
    onBackgroundPointerUp,
    onBackgroundLostPointerCapture,
    snapSelectedPoints,
  } = useZoneEditPoints({
    mode,
    setMode,
    toImagePct,
    onRefresh,
    setToast,
    snapPoint: edgeSnap.snapPoint,
    snapRadiusPct,
    snapMinStrength: sensitivityToMinStrength(snapSensitivity),
    neighborSnapEnabled,
    neighborZones: allNeighborZones,
    neighborSnapRadiusPct: NEIGHBOR_SNAP_DEFAULT_RADIUS_PCT,
    edgeTolerancePct,
    mapScaleInv: inv,
    mapImgW: iw,
    mapImgH: ih,
    onKeyboardPan: panByScreenDelta,
    onBackgroundPanStart: beginPan,
    onBackgroundPanMove: updatePan,
    onBackgroundPanEnd: endPan,
  });

  const {
    alignSelectedIds,
    alignPreview,
    alignSaving,
    alignSelectedCount,
    enterAlignMode,
    exitAlignMode,
    toggleAlignZoneId,
    computeAlignPreview,
    discardAlignPreview,
    applyAlignPreview,
    clearAlignSession,
  } = useZoneAlignMode({
    mode,
    setMode,
    zones,
    onRefresh,
    setToast,
  });

  const {
    mascotId: mapMascotId,
    showMascot: showMapMascot,
    animationState: mapMascotAnimationState,
    renderPct: mapMascotRenderPct,
    faceRight: mapMascotFaceRight,
    mascotClassName: mapMascotClassName,
    dialog: mapMascotDialog,
    dialogVisible: mapMascotDialogVisible,
    moveTo: moveMapMascotTo,
    onZoneViewClick: onMapMascotZoneClick,
    onMarkerViewClick: onMapMascotMarkerClick,
    resetMotion: resetMapMascotMotion,
    clearDetailAfterMove: clearMapMascotDetailAfterMove,
  } = useMapViewMascot({
    mapId: activeMapId,
    markers: mapMarkersOnActiveMap,
    fitHeightPx: useSharedViewStage ? workFitHeightPx : imgSize.h,
    enabled: mode === 'view',
    extraCatalogEntries: visitMascotCatalogExtras,
    preferredMascotId: student?.visit_mascot_catalog_id,
    allowedMascotIds: visitMascotOfferedIds,
    defaultMascotId: visitMascotDefaultId,
    onPersistPreferredMascotId: onPersistVisitMascotId,
    mascotDialogSettings,
  });
  // Position du lecteur, carte orientée selon le cap, échelle et rose des vents.
  const {
    mapPosition,
    headingUpAllowed,
    headingUpPref,
    headingUpEffective,
    scaleCompassAllowed,
    scaleCompassPref,
    mapOrientationDeg,
    mascotGps,
  } = useMapViewPosition({
    activeMap,
    mode,
    headingUpSiteEnabled,
    mapOrientation,
    setMapOrientation,
    showMapMascot,
    moveMapMascotTo,
  });
  /** « Commencer le parcours » : première étape (ou celle choisie) et position allumée. */
  const onBeginRoute = useCallback(
    (index) => {
      beginRouteSteps(index);
      if (routeSettings.autoLocate && mapPosition.available && !mapPosition.active) {
        mapPosition.toggle();
      }
    },
    [beginRouteSteps, routeSettings.autoLocate, mapPosition],
  );
  const routeDistanceLabel = useMemo(() => {
    const targetPct = routeEntryFocusPct(currentRouteEntry);
    if (!mapPosition.positionPct || !targetPct || !mapPosition.planSize) return '';
    const meters = distanceMetersBetweenPct(
      mapPosition.positionPct,
      targetPct,
      mapPosition.planSize,
    );
    return meters != null ? formatDistanceFr(meters) : '';
  }, [currentRouteEntry, mapPosition.positionPct, mapPosition.planSize]);
  const [tutorialReadIds, setTutorialReadIds] = useTutorialReadIds(tutorials);

  const hadZoneOrMarkerSelectionRef = useRef(false);
  useEffect(() => {
    if (!onLocationTasksFocus) return;
    const hasSelection = !!(selectedZone || selectedMarker);
    if (selectedZone) {
      onLocationTasksFocus({ kind: 'zone', id: String(selectedZone.id) });
    } else if (selectedMarker) {
      onLocationTasksFocus({ kind: 'marker', id: String(selectedMarker.id) });
    } else if (hadZoneOrMarkerSelectionRef.current) {
      onLocationTasksFocus(null);
    }
    hadZoneOrMarkerSelectionRef.current = hasSelection;
  }, [selectedZone, selectedMarker, onLocationTasksFocus]);

  useLayoutEffect(() => {
    if (!mapFullscreen) return undefined;
    remeasureMap();
    let innerRaf = null;
    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(() => remeasureMap());
    });
    return () => {
      cancelAnimationFrame(outerRaf);
      if (innerRaf != null) cancelAnimationFrame(innerRaf);
    };
  }, [mapFullscreen, remeasureMap]);

  useEffect(() => {
    setMode('view');
    resetDrawPoints();
    setSelectedZone(null);
    setSelectedMarker(null);
    setPendingZone(null);
    setPendingMarker(null);
    setMarkerPositionUnlocked(false);
    discardEditPointsSession();
    clearAlignSession();
    resetMapMascotMotion?.();
  }, [
    activeMapId,
    resetMapMascotMotion,
    resetDrawPoints,
    discardEditPointsSession,
    clearAlignSession,
  ]);

  // Notification / lien direct « lieu » : sélectionne la zone ou le repère, centre la carte
  // dessus et ouvre la fenêtre sur ses messages. Consommée une seule fois (nonce), puis
  // rendue à l'appelant pour qu'un remontage de la carte ne la rejoue pas.
  // Doit rester déclaré APRÈS l'effet de remise à zéro ci-dessus : dans un même rendu
  // (montage, changement de carte), ce dernier désélectionnerait le lieu juste ouvert.
  const handledPlaceRequestRef = useRef(null);
  useEffect(() => {
    if (!placeRequest?.id || handledPlaceRequestRef.current === placeRequest.nonce) return;
    if (placeRequest.mapId && String(placeRequest.mapId) !== String(activeMapId || '')) return;
    const isMarker = placeRequest.kind === 'marker';
    const list = isMarker ? mapMarkersOnActiveMap : mapZonesOnActiveMap;
    const place = list.find((p) => String(p.id) === String(placeRequest.id));
    if (!place) return;
    handledPlaceRequestRef.current = placeRequest.nonce;
    setCommentsFocusKey(`${isMarker ? 'marker' : 'zone'}:${place.id}`);
    if (isMarker) {
      setSelectedZone(null);
      setSelectedMarker(place);
    } else {
      setSelectedMarker(null);
      setSelectedZone(place);
    }
    const pct = isMarker ? markerFocusPct(place) : zoneFocusPctFromPoints(place.points);
    setTimeout(() => {
      if (pct) focusMapPct(pct);
    }, 250);
    onPlaceRequestHandled?.(placeRequest.nonce);
  }, [
    placeRequest,
    activeMapId,
    mapMarkersOnActiveMap,
    mapZonesOnActiveMap,
    focusMapPct,
    onPlaceRequestHandled,
  ]);

  const onMapClick = (e) => {
    if (moved.current) return;
    if (e.target.closest('.map-zone-hit') || e.target.closest('.map-bubble')) return;
    const p = toImagePct(e.clientX, e.clientY);
    if (!p) return;
    if (mode === 'view' && showMapMascot) {
      moveMapMascotTo(p.xp, p.yp);
      return;
    }
    if (mode === 'draw-zone') addDrawPoint(p);
    else if (mode === 'add-marker') {
      setPendingMarker(p);
      setMode('view');
    }
  };

  // Actions CRUD carte (API + refresh) ; les effets d'UI (fermeture/sélection/toast)
  // restent portés par les fenêtres de lieu (`MapViewLocationModals`).
  const crud = useMapCrudActions({
    activeMapId,
    tasks,
    tutorials,
    onRefresh,
    student,
    canEnrollNewTasks,
  });

  /** « Ajuster la position » depuis la fiche d'un repère : déverrouille le glisser. */
  const requestAdjustMarkerPosition = () => {
    setMarkerPositionUnlocked(true);
    setToast(
      'Déplacement des repères activé : fais glisser le repère sur la carte, puis reverrouille dans la barre d’outils si besoin.',
    );
  };

  const toggleMarkerPositionLock = () => {
    setMarkerPositionUnlocked((prev) => {
      const next = !prev;
      setToast(next ? 'Déplacement des repères activé' : 'Déplacement des repères verrouillé');
      return next;
    });
  };

  const mapMascotFitScale = resolveMapViewMascotFitScale(cs);
  // Typographie des étiquettes (emoji, nom) et variables CSS du calque d'étiquettes.
  const {
    showTutorialDots,
    mapTextSizeLabel,
    cycleMapTextSize,
    mapEmojiLabelCenterGap,
    mapEmojiFontPx,
    mapLabelFontPx,
    markerLabelMarginTop,
    mapOverlayLabelLayout,
    mapOverlayCssVars,
    workFitExtraStyle,
  } = useMapViewTypography({ publicSettings, iw, ih, fitScale, cs, inv, isCoarsePointer });
  // Pastilles d'état des lieux (tâches, tutoriels liés).
  const {
    zoneTaskVisualById,
    markerTaskVisualById,
    zoneTutorialCountById,
    markerTutorialCountById,
    getStageZoneStatusDots,
    getStageMarkerStatusDots,
    getStageClusterStatusDots,
  } = useMapViewBadges({ tasks, tutorials, zones, markers, activeMapId, showTutorialDots });
  const mapCanvasHintTexts = useMemo(
    () => ({
      drawZoneMin: resolveMapCanvasHint('drawZoneMin', publicSettings),
      drawZoneReady: resolveMapCanvasHint('drawZoneReady', publicSettings, {
        count: drawPoints.length,
      }),
      addMarker: resolveMapCanvasHint('addMarker', publicSettings),
      editPoints: resolveMapCanvasHint('editPoints', publicSettings),
      pageScroll: resolveMapCanvasHint('pageScroll', publicSettings),
      gesturesActive: resolveMapCanvasHint('gesturesActive', publicSettings),
    }),
    [publicSettings, drawPoints.length],
  );
  const liveSurfaceLabel = useMemo(() => {
    if (!isTeacher || !activeMapGeoref) return null;
    if (mode === 'draw-zone' && drawPoints.length >= 3) {
      return pointsSurfaceLabel(drawPoints, activeMapGeoref);
    }
    if (mode === 'edit-points') return pointsSurfaceLabel(editPoints, activeMapGeoref);
    return null;
  }, [isTeacher, activeMapGeoref, mode, drawPoints, editPoints]);
  // Zones pré-parsées (JSON.parse des points + emoji/nom d'étiquette) : recalculées uniquement
  // quand les données changent, plus à chaque rendu de la carte (zoom, pan, mascotte…).
  const zoneLabelAspect = contentAspect(iw, ih);
  const parsedZones = useMemo(
    () => parseZonesForLayer(zones, emojiParsingList, { aspect: zoneLabelAspect }),
    [zones, emojiParsingList, zoneLabelAspect],
  );

  // Catalogue des catégories de la carte active (globales + propres à la carte).
  const { categories: mapCategoryCatalog } = useMapCategories(activeMapId);
  const mapCategoriesById = useMemo(
    () => new Map((mapCategoryCatalog || []).map((c) => [String(c.id), c])),
    [mapCategoryCatalog],
  );

  /**
   * Regroupement des repères au dézoom (lot 5, `docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §8.3) :
   * même module que le plan. Les repères dont les pastilles se recouvrent à l'écran sont
   * fusionnés ; en mode édition, jamais de groupe (on pose et on déplace des repères un par
   * un). Le calcul suit `committed.s`, donc un commit de geste, pas chaque `pointermove`.
   */
  const markerClusters = useMemo(
    () =>
      clusterMarkers(mapMarkersOnActiveMap, {
        contentWidthPx: imgSize.w,
        contentHeightPx: imgSize.h,
        scale: committed.s,
        categoriesById: mapCategoriesById,
        enabled: clusterMarkersEnabled && mode === 'view',
      }),
    [
      mapMarkersOnActiveMap,
      imgSize.w,
      imgSize.h,
      committed.s,
      mapCategoriesById,
      clusterMarkersEnabled,
      mode,
    ],
  );

  // Recherche et filtres de lieux : options, lieux retenus, lieux atténués, raccourci « / ».
  const {
    mapLocationFilters,
    setMapLocationFilters,
    mapLocationSearchRef,
    mapSpeciesOptions,
    mapCategoryOptions,
    matchingZoneIds,
    matchingMarkerIds,
    mapFilterResultItems,
    mapFilterActive,
    mapFiltersAtDefaults,
    dimmedZoneIds,
    dimmedMarkerIds,
    getFilterDimSeen,
  } = useMapViewLocationFilters({
    activeMapId,
    activeMap,
    mode,
    zones,
    markersOnMap: mapMarkersOnActiveMap,
    parsedZones,
    categoryCatalog: mapCategoryCatalog,
    badges: {
      zoneTaskVisualById,
      markerTaskVisualById,
      zoneTutorialCountById,
      markerTutorialCountById,
      emojiParsingList,
    },
  });

  // Zoom sur le lieu avant sa fiche, puis retour à la vue d'avant (scène partagée seulement ;
  // pendant un parcours, la caméra guidée garde la main).
  const placeFocusSettings = useMemo(
    () => resolvePlaceFocusSettings(publicSettings?.place_focus),
    [publicSettings?.place_focus],
  );
  const workPlaceFocusActive = useSharedViewStage && placeFocusSettings.workEnabled && !activeRoute;
  const getWorkViewport = useCallback(() => workViewportApiRef.current, []);
  const workPlaceFx = usePlaceFocusFx(placeFocusSettings.fx.work);
  const placeFocus = usePlaceFocusSequence({
    getViewport: getWorkViewport,
    enabled: workPlaceFocusActive,
    durationMs: placeFocusSettings.durationMs,
    maxZoom: placeFocusSettings.maxZoom,
    restoreOnClose: placeFocusSettings.restoreOnClose,
    resetKey: String(activeMapId || ''),
    onFx: workPlaceFx.onFx,
  });
  const openZoneFocused = useCallback(
    (zone) => placeFocus.focusThenOpen({ ...zone, kind: 'zone' }, () => setSelectedZone(zone)),
    [placeFocus],
  );
  const openMarkerFocused = useCallback(
    (marker) =>
      placeFocus.focusThenOpen({ ...marker, kind: 'marker' }, () => setSelectedMarker(marker)),
    [placeFocus],
  );
  // Fermeture d'une fiche (quel qu'en soit le bouton) : retour à la vue d'avant le zoom. Hors
  // consultation (passage à l'édition des sommets), la vue mémorisée est simplement oubliée.
  const hadPlaceDetailRef = useRef(false);
  useEffect(() => {
    const hasDetail = !!(selectedZone || selectedMarker);
    if (hadPlaceDetailRef.current && !hasDetail) {
      if (mode === 'view' && useSharedViewStage) placeFocus.restore();
      else placeFocus.forget();
    }
    hadPlaceDetailRef.current = hasDetail;
  }, [selectedZone, selectedMarker, mode, useSharedViewStage, placeFocus]);

  // Ouverture d'un lieu : toucher (scène, canevas, groupe), résultat de recherche, fond.
  const {
    onSelectMapFilterResult,
    openZoneFromMap,
    openMarkerFromMap,
    openClusterFromMap,
    onSelectPlaceFromStage,
    onOpenGroupFromStage,
    onWorkBackgroundClick,
    selectedPlaceForStage,
  } = useMapViewPlaceHandlers({
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
    openZone: openZoneFocused,
    openMarker: openMarkerFocused,
    placeFocusActive: workPlaceFocusActive,
  });

  const workTargetPct = useMemo(
    () => (activeRoute ? routeEntryFocusPct(currentRouteEntry) : null),
    [activeRoute, currentRouteEntry],
  );

  const cursor = mapCursorForMode(mode);
  const mobileInteractionsActive = mapInteractionEnabled || committed.s > 1.05;
  const canManageMarkerPositions = !!isTeacher;

  return (
    <div
      className={`map-view-root ${embedded ? 'map-view-root--embedded' : 'map-view-root--solo'}${mapFullscreen ? ' map-view-root--map-fullscreen-active' : ''}`}
    >
      {toast && <TimedToast msg={toast} onDone={() => setToast(null)} />}
      {mapTutorialPreview && (
        <TutorialPreviewModal
          tutorial={mapTutorialPreview}
          onClose={() => setMapTutorialPreview(null)}
          readAcknowledge={{
            isRead: tutorialReadIds.has(Number(mapTutorialPreview.id)),
            onAcknowledged: (id) => setTutorialReadIds((prev) => new Set([...prev, id])),
            onForceLogout,
          }}
        />
      )}

      <MapViewLocationModals
        activeMapId={activeMapId}
        activeMapGeoref={activeMapGeoref}
        isTeacher={isTeacher}
        student={student}
        canSelfAssignTasks={canSelfAssignTasks}
        canEnrollOnTasks={canEnrollNewTasks}
        plants={plants}
        tasks={tasks}
        tutorials={tutorials}
        categoryCatalog={mapCategoryCatalog}
        markerEmojis={markerEmojis}
        emojiParsingList={emojiParsingList}
        contextCommentsEnabled={contextCommentsEnabled}
        canParticipateContextComments={canParticipateContextComments}
        commentsFocusKey={commentsFocusKey}
        selectedZone={selectedZone}
        setSelectedZone={setSelectedZone}
        selectedMarker={selectedMarker}
        setSelectedMarker={setSelectedMarker}
        pendingZone={pendingZone}
        setPendingZone={setPendingZone}
        pendingMarker={pendingMarker}
        setPendingMarker={setPendingMarker}
        crud={crud}
        onZoneUpdate={onZoneUpdate}
        onRefresh={onRefresh}
        onNavigateToTasksForLocation={onNavigateToTasksForLocation}
        onOpenPlantCatalogPreview={onOpenPlantCatalogPreview}
        onOpenTutorialPreview={setMapTutorialPreview}
        onCloseDetail={clearMapMascotDetailAfterMove}
        onEditZonePoints={startEditPoints}
        onRequestAdjustMarkerPosition={requestAdjustMarkerPosition}
        setToast={setToast}
      />

      {!mapFullscreen ? (
        <MapViewToolbar
          maps={maps}
          activeMapId={activeMapId}
          onMapChange={onMapChange}
          mode={mode}
          isTeacher={isTeacher}
          drawPointsCount={drawPoints.length}
          onModeButtonClick={(m) => {
            setMode((p) => (p === m && m !== 'view' ? 'view' : m));
            if (m === 'view') {
              resetDrawPoints();
              discardEditPointsSession();
            }
            if (m !== 'align-zones') clearAlignSession();
          }}
          onFinishZone={finishZone}
          onUndoPoint={undoPoint}
          onCancelDraw={cancelDraw}
          editZoneName={editZone?.name}
          editCanUndo={editCanUndo}
          editPointsCount={editPoints.length}
          selectedPointsCount={selectedPtIdxs.size}
          insertVertexMode={insertVertexMode}
          onToggleInsertVertexMode={toggleInsertVertexMode}
          canRemoveSelection={canRemoveSelection}
          onRemoveSelectedPoints={() => {
            if (!removeSelectedPoints()) setToast('Un contour garde au moins 3 sommets');
          }}
          multiSelectMode={multiSelectMode}
          onToggleMultiSelectMode={toggleMultiSelectMode}
          snapEnabled={snapEnabled}
          snapStatus={edgeSnap.status}
          onToggleSnap={() => setSnapEnabled((v) => !v)}
          snapRadiusPx={snapRadiusPx}
          onSnapRadiusChange={setSnapRadiusPx}
          snapSensitivity={snapSensitivity}
          onSnapSensitivityChange={setSnapSensitivity}
          onSnapSelectedPoints={() => {
            const movedCount = snapSelectedPoints();
            setToast(
              movedCount > 0
                ? `${movedCount} sommet${movedCount > 1 ? 's' : ''} collé${movedCount > 1 ? 's' : ''} au contour`
                : 'Aucun contour trouvé à proximité',
            );
          }}
          neighborSnapEnabled={neighborSnapEnabled}
          onToggleNeighborSnap={() => setNeighborSnapEnabled((v) => !v)}
          alignSelectedCount={alignSelectedCount}
          alignHasPreview={Boolean(alignPreview?.aligned?.length)}
          alignSaving={alignSaving}
          onEnterAlignMode={() => {
            resetDrawPoints();
            discardEditPointsSession();
            setSelectedZone(null);
            enterAlignMode();
          }}
          onExitAlignMode={exitAlignMode}
          onComputeAlignPreview={computeAlignPreview}
          onDiscardAlignPreview={discardAlignPreview}
          onApplyAlignPreview={applyAlignPreview}
          onUndoEditPoints={undoEditPoints}
          onSaveEditPoints={saveEditPoints}
          onExitEditPoints={() => {
            setMode('view');
            discardEditPointsSession();
          }}
          canManageMarkerPositions={canManageMarkerPositions}
          markerPositionUnlocked={markerPositionUnlocked}
          onToggleMarkerPositionLock={toggleMarkerPositionLock}
          isCoarsePointer={isCoarsePointer}
          mobileInteractionsActive={mobileInteractionsActive}
          onToggleMapInteraction={toggleMapInteraction}
          showLabels={showLabels}
          onToggleLabels={() => setShowLabels((l) => !l)}
          clusterMarkersEnabled={clusterMarkersEnabled}
          onToggleClusterMarkers={() => setClusterMarkersEnabled((v) => !v)}
          mapTextSizeLabel={mapTextSizeLabel}
          onCycleMapTextSize={cycleMapTextSize}
          gps={mascotGps}
          scaleCompass={{
            allowed: scaleCompassAllowed,
            effective: scaleCompassPref.effective,
            toggle: scaleCompassPref.toggle,
          }}
          containerRef={containerRef}
          txRef={tx}
          fitMap={fitMap}
          animateZoomTowardScale={animateZoomTowardScale}
          onOpenFullscreen={openMapFullscreen}
          stageOwnsViewportControls={useSharedViewStage}
        />
      ) : null}

      <MapViewRoutePickerRow
        visible={mode === 'view' && !mapFullscreen}
        routes={mapRoutes}
        places={routePlaces}
        open={routePickerOpen}
        onToggle={setRoutePickerOpen}
        onStart={startRoute}
      />

      <MascotGpsStatusBanner gps={mascotGps} />

      <MapFullscreenShell
        active={mapFullscreen}
        onClose={closeMapFullscreen}
        layerClassName="map-view-fullscreen-shell"
      >
        <div
          ref={mapLayoutOuterRef}
          className={`map-view-canvas-outer${mapFullscreen ? ' map-view-canvas-outer--fullscreen' : ''}`}
          style={mapCanvasOuterStyle({ embedded, framePaddingPx: mapFramePaddingPx })}
        >
          <MapViewLocationSearch
            visible={mode === 'view'}
            filters={mapLocationFilters}
            setFilters={setMapLocationFilters}
            speciesOptions={mapSpeciesOptions}
            categoryOptions={mapCategoryOptions}
            zoneMatchCount={matchingZoneIds.size}
            markerMatchCount={matchingMarkerIds.size}
            searchInputRef={mapLocationSearchRef}
            resultItems={mapFilterResultItems}
            resultsCollapsedByDefault={mapFiltersAtDefaults}
            onSelectItem={onSelectMapFilterResult}
          />
          <div className="map-view-canvas-slot">
            {useSharedViewStage ? (
              <WorkMapStage
                map={{
                  id: activeMapId,
                  map_image_url: mapImageSrc,
                  label: activeMapLabel,
                  georef: activeMapGeoref,
                  geo_anchors: activeMapGeoref,
                }}
                zones={mapZonesOnActiveMap}
                markers={mapMarkersOnActiveMap}
                categoriesById={mapCategoriesById}
                selectedPlace={selectedPlaceForStage}
                autoFocusSelected={!workPlaceFocusActive}
                placeFocusFx={workPlaceFx.fx}
                onSelectPlace={onSelectPlaceFromStage}
                onOpenGroup={onOpenGroupFromStage}
                position={mapPosition}
                onLocateToggle={mapPosition.toggle}
                clusteringEnabled={clusterMarkersEnabled}
                showLabels={showLabels}
                getIsSeen={getFilterDimSeen}
                getZoneStatusDots={getStageZoneStatusDots}
                getMarkerStatusDots={getStageMarkerStatusDots}
                mergeStatusDots={getStageClusterStatusDots}
                gesturesEnabled={mapInteractionEnabled || !isCoarsePointer}
                headingUpAllowed={headingUpAllowed}
                headingUpEffective={headingUpEffective}
                headingUpUserEnabled={headingUpPref.userEnabled}
                onHeadingUpToggle={() => headingUpPref.setEnabled(!headingUpPref.userEnabled)}
                scaleCompassAllowed={scaleCompassAllowed}
                scaleCompassEffective={scaleCompassPref.effective}
                onScaleCompassToggle={scaleCompassPref.toggle}
                fitExtraStyle={workFitExtraStyle}
                focusInsets={activeRoute ? routeFocusInsets || ROUTE_BAR_FALLBACK_INSETS : null}
                targetPct={workTargetPct}
                routeLineAnimated={routeSettings.lineAnimated}
                route={mode === 'view' ? stageRoute : null}
                onViewportChange={onWorkViewportChange}
                initialView={stageInitialView}
                onBackgroundClick={onWorkBackgroundClick}
                onMapImageError={onMapImageError}
                overlaySlot={
                  <MapViewMascotOverlay
                    show={showMapMascot}
                    mascotClassName={mapMascotClassName}
                    embedded={embedded}
                    renderPct={mapMascotRenderPct}
                    fitScale={workMascotFitScale}
                    faceRight={mapMascotFaceRight}
                    animationState={mapMascotAnimationState}
                    mascotId={mapMascotId}
                    extraCatalogEntries={visitMascotCatalogExtras}
                    dialogVisible={mapMascotDialogVisible}
                    dialog={mapMascotDialog}
                  />
                }
              />
            ) : (
              <MapViewEditCanvas
                containerRef={containerRef}
                worldRef={worldRef}
                imgRef={imgRef}
                cursor={cursor}
                touchAction={touchAction}
                mapOverlayCssVars={mapOverlayCssVars}
                onMapClick={onMapClick}
                iw={iw}
                ih={ih}
                inv={inv}
                cs={cs}
                imgSize={imgSize}
                orientStyle={orientStyle}
                mapImageSrc={mapImageSrc}
                activeMapLabel={activeMapLabel}
                activeMapGeoref={activeMapGeoref}
                onMapImageError={onMapImageError}
                toImagePct={toImagePct}
                isCoarsePointer={isCoarsePointer}
                prefersPageScroll={prefersPageScroll}
                mode={mode}
                showLabels={showLabels}
                isTeacher={isTeacher}
                markerPositionUnlocked={markerPositionUnlocked}
                embedded={embedded}
                parsedZones={parsedZones}
                editZone={editZone}
                selectedZone={selectedZone}
                alignSelectedIds={alignSelectedIds}
                alignPreview={alignPreview}
                dimmedZoneIds={dimmedZoneIds}
                dimmedMarkerIds={dimmedMarkerIds}
                zoneTaskVisualById={zoneTaskVisualById}
                markerTaskVisualById={markerTaskVisualById}
                zoneTutorialCountById={zoneTutorialCountById}
                markerTutorialCountById={markerTutorialCountById}
                showTutorialDots={showTutorialDots}
                mapEmojiFontPx={mapEmojiFontPx}
                mapLabelFontPx={mapLabelFontPx}
                mapEmojiLabelCenterGap={mapEmojiLabelCenterGap}
                markerLabelMarginTop={markerLabelMarginTop}
                mapOverlayLabelLayout={mapOverlayLabelLayout}
                openZoneFromMap={openZoneFromMap}
                openMarkerFromMap={openMarkerFromMap}
                openClusterFromMap={openClusterFromMap}
                beginMarkerDrag={beginMarkerDrag}
                markerClusters={markerClusters}
                drawPoints={drawPoints}
                editPoints={editPoints}
                draggingPtIdx={draggingPtIdx}
                selectedPtIdxs={selectedPtIdxs}
                insertVertexMode={insertVertexMode}
                insertPointFromPct={insertPointFromPct}
                insertPointAtMidpoint={insertPointAtMidpoint}
                onBackgroundPointerDown={onBackgroundPointerDown}
                onBackgroundPointerMove={onBackgroundPointerMove}
                onBackgroundPointerUp={onBackgroundPointerUp}
                onBackgroundLostPointerCapture={onBackgroundLostPointerCapture}
                onTranslatePointerDown={onTranslatePointerDown}
                onTranslatePointerMove={onTranslatePointerMove}
                endEditZoneTranslate={endEditZoneTranslate}
                onTranslateLostPointerCapture={onTranslateLostPointerCapture}
                onEditPointPointerDown={onEditPointPointerDown}
                onEditPointPointerMove={onEditPointPointerMove}
                onEditPointPointerUp={onEditPointPointerUp}
                showMapMascot={showMapMascot}
                mapMascotClassName={mapMascotClassName}
                mapMascotRenderPct={mapMascotRenderPct}
                mapMascotFitScale={mapMascotFitScale}
                mapMascotFaceRight={mapMascotFaceRight}
                mapMascotAnimationState={mapMascotAnimationState}
                mapMascotId={mapMascotId}
                visitMascotCatalogExtras={visitMascotCatalogExtras}
                mapMascotDialogVisible={mapMascotDialogVisible}
                mapMascotDialog={mapMascotDialog}
                mapPosition={mapPosition}
                scaleCompassPref={scaleCompassPref}
                mapOrientationDeg={mapOrientationDeg}
                mapCanvasHintTexts={mapCanvasHintTexts}
                liveSurfaceLabel={liveSurfaceLabel}
              />
            )}
            {useSharedViewStage ? (
              <MapCanvasHints
                mode={mode}
                drawPointsCount={drawPoints.length}
                prefersPageScroll={prefersPageScroll}
                isCoarsePointer={isCoarsePointer}
                hintTexts={mapCanvasHintTexts}
                surfaceLabel={liveSurfaceLabel}
              />
            ) : null}
          </div>
          <MapViewRouteControls
            visible={mode === 'view'}
            activeRoute={activeRoute}
            resumableRouteSlug={resumableRouteSlug}
            onResume={resumeRoute}
            steps={routeSteps}
            index={routeIndex}
            phase={routePhase}
            onBegin={onBeginRoute}
            onShowOverview={showRouteOverview}
            onGoToIndex={goToRouteIndex}
            onExit={exitRoute}
            onHeight={setRouteBarHeight}
            canLocate={!!mapPosition?.available}
            distanceLabel={routeDistanceLabel}
          />
        </div>
      </MapFullscreenShell>
    </div>
  );
}

/** Mémoïsation (comparaison shallow par défaut) : évite le re-render de cette vue lourde
 *  à chaque tick du polling global d'App.jsx quand ses props ne changent pas. */
const MapView = React.memo(MapViewImpl);
MapView.displayName = 'MapView';

export {
  Lightbox,
  PhotoGallery,
  ZoneInfoModal,
  ZoneDrawModal,
  MarkerModal,
  MapView,
  LivingBeingsCatalogPanel,
  CatalogRemarksSection,
  BiodiversitySpeciesOpenLinks,
  LocationTutorialPreviewList,
};
