import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';

import { api } from '../services/api';

import { MARKER_EMOJIS, parseEmojiListSetting } from '../constants/emojis';

import {
  resolveMapOverlayTypography,
  resolveMapOverlayCssVariables,
} from '../utils/mapOverlayTypography';
import { resolveMapOverlayLabelLayout } from '../utils/mapOverlayZoneLabels.js';
import { useMapOverlayTextSizePreference } from '../hooks/useMapOverlayTextSizePreference.js';

import { TASK_VISUAL_LABEL } from '../utils/taskEnrollment.js';
import {
  computeTaskVisualByLocation,
  computeTutorialCountByLocation,
} from '../utils/mapLocationBadges.js';
import { buildMapImageCandidates } from '../utils/mapImageCandidates';

import { TutorialPreviewModal } from './TutorialPreviewModal';
import { fetchTutorialReadIds } from './TutorialReadAcknowledge';

import { MapViewMascotOverlay } from './MapViewMascotOverlay.jsx';
import { MapViewMarkerBubble } from './MapViewMarkerBubble.jsx';
import { MapViewBackgroundImage } from './MapViewBackgroundImage.jsx';
import { MapViewWorldLayer } from './MapViewWorldLayer.jsx';
import useMapViewMascot from '../hooks/useMapViewMascot.js';
import useZoneDrawing from '../hooks/useZoneDrawing.js';
import useZoneEditPoints from '../hooks/useZoneEditPoints.js';
import useMapCrudActions from '../hooks/useMapCrudActions.js';
import useMascotGpsFollow from '../hooks/useMascotGpsFollow.js';
import { MascotGpsStatusBanner } from './MascotGpsStatusBanner.jsx';
import useVisitMascotCatalogExtras from '../hooks/useVisitMascotCatalogExtras.js';
import { useMapGestures } from '../hooks/useMapGestures.js';

import { TimedToast } from '../shared/components/TimedToast.jsx';
import { ImageLightbox } from '../shared/components/ImageLightbox.jsx';
import {
  CatalogRemarksSection,
  LivingBeingsCatalogPanel,
  BiodiversitySpeciesOpenLinks,
} from './map/LivingBeingsCatalogPanel.jsx';

import { ZonePolygonsLayer, parseZonesForLayer } from './map/ZonePolygonsLayer.jsx';
import { DrawingLayer } from './map/DrawingLayer.jsx';
import { EditPointsLayer } from './map/EditPointsLayer.jsx';
import useMapImageEdgeSnap from '../hooks/useMapImageEdgeSnap.js';
import { EDGE_SNAP_DEFAULTS, sensitivityToMinStrength } from '../utils/edgeSnap.js';
import { ZoneDrawModal } from './map/ZoneDrawModal.jsx';
import { PhotoGallery } from './map/PhotoGallery.jsx';
import { LocationTutorialPreviewList } from './map/mapModalShared.jsx';
import { ZoneInfoModal } from './map/ZoneInfoModal.jsx';
import { MarkerModal } from './map/MarkerModal.jsx';
import { MapViewToolbar } from './map/MapViewToolbar.jsx';
import { MapCanvasHints } from './map/MapCanvasHints.jsx';
import { MapLocationFiltersBar } from './map/MapLocationFiltersBar.jsx';
import { MapLocationFilterResults } from './map/MapLocationFilterResults.jsx';
import {
  MAP_LOCATION_FILTER_DEFAULTS,
  applyMapLocationFilters,
  collectMapSpeciesOptions,
  isMapLocationFilterActive,
} from '../utils/mapLocationFilters.js';
import {
  focusMapOnPct,
  markerFocusPct,
  zoneFocusPctFromPoints,
} from '../utils/mapFocusLocation.js';
import { useMapFullscreen } from '../shared/hooks/useMapFullscreen.js';
import { MapFullscreenShell } from '../shared/components/MapFullscreenShell.jsx';
import { usePublicSettings } from '../contexts/PublicSettingsContext.jsx';
import { resolveMapCanvasHint } from '../utils/helpResolve.js';
import { useSession } from '../contexts/SessionContext.jsx';
import { useData } from '../contexts/DataContext.jsx';

/**
 * Bulle repère mémoïsée : évite le re-render de chaque bulle à chaque rendu de la carte.
 * Le repère est passé par la bulle aux handlers (`onOpenMarker(marker, e)`,
 * `onBeginMarkerDrag(marker.id, …)`) pour que le parent fournisse des fonctions stables.
 */
const MapViewMarkerBubbleMemo = React.memo(function MapViewMarkerBubbleMemo({
  marker,
  draggable,
  onOpenMarker,
  onBeginMarkerDrag,
  ...bubbleProps
}) {
  const onOpen = useCallback((e) => onOpenMarker(marker, e), [marker, onOpenMarker]);
  const onPointerDown = useMemo(
    () =>
      draggable
        ? (e) => {
            e.stopPropagation();
            onBeginMarkerDrag(marker.id, e.currentTarget, e.pointerId);
          }
        : undefined,
    [draggable, marker.id, onBeginMarkerDrag],
  );
  return (
    <MapViewMarkerBubble
      marker={marker}
      draggable={draggable}
      onOpen={onOpen}
      onPointerDown={onPointerDown}
      {...bubbleProps}
    />
  );
});

function Lightbox({ src, caption, onClose, useOverlayHistory = false }) {
  return (
    <ImageLightbox
      src={src}
      caption={caption}
      onClose={onClose}
      useOverlayHistory={useOverlayHistory}
    />
  );
}

function MapViewImpl({
  maps = [],
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
}) {
  const publicSettings = usePublicSettings();
  const { canParticipateContextComments = true } = useSession();
  const {
    zones = [],
    markers = [],
    tasks = [],
    tutorials = [],
    plants = [],
    activeMapId = '',
  } = useData();
  const canEnrollNewTasks = canEnrollOnTasks !== undefined ? canEnrollOnTasks : canSelfAssignTasks;
  const [mode, setMode] = useState('view');
  const [showLabels, setShowLabels] = useState(true);
  const [selectedZone, setSelectedZone] = useState(null);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [pendingZone, setPendingZone] = useState(null);
  const [pendingMarker, setPendingMarker] = useState(null);
  // Tracé de zone (mode draw-zone) : points cliqués + actions barre d'outils.
  const { drawPoints, addDrawPoint, resetDrawPoints, finishZone, undoPoint, cancelDraw } =
    useZoneDrawing({ setMode, setPendingZone });
  const [toast, setToast] = useState(null);
  const [mapTutorialPreview, setMapTutorialPreview] = useState(null);
  const [tutorialReadIds, setTutorialReadIds] = useState(() => new Set());
  const [markerPositionUnlocked, setMarkerPositionUnlocked] = useState(false);
  const [mapLocationFilters, setMapLocationFilters] = useState(() => ({
    ...MAP_LOCATION_FILTER_DEFAULTS,
  }));
  const mapLocationSearchRef = useRef(null);
  const { mapFullscreen, setMapFullscreen, openMapFullscreen, closeMapFullscreen } =
    useMapFullscreen({
      escapeBlocked: Boolean(
        selectedZone || selectedMarker || pendingZone || pendingMarker || mapTutorialPreview,
      ),
    });
  const configuredLocationEmojis = String(
    publicSettings?.ui?.map?.location_emojis || publicSettings?.map?.location_emojis || '',
  );
  const markerEmojis = useMemo(
    () => parseEmojiListSetting(configuredLocationEmojis, MARKER_EMOJIS),
    [configuredLocationEmojis],
  );
  const visitMascotDefaultId = String(publicSettings?.visit?.mascot?.default_id || '').trim();
  // Registre global des packs publiés → la mascotte peut être un pack importé (srv-…),
  // et le choix du visiteur vaut sur toutes les cartes.
  const visitMascotCatalogExtras = useVisitMascotCatalogExtras({ enabled: mode === 'view' });
  const mapMarkersOnActiveMap = useMemo(
    () => (markers || []).filter((m) => m.map_id === activeMapId),
    [markers, activeMapId],
  );
  const contextCommentsEnabled = publicSettings?.modules?.context_comments_enabled !== false;
  const emojiParsingList = useMemo(
    () => [...new Set([...markerEmojis, ...MARKER_EMOJIS])],
    [markerEmojis],
  );
  const activeMap = maps.find((m) => m.id === activeMapId);
  const mapImageCandidates = useMemo(() => buildMapImageCandidates(activeMap), [activeMap]);
  const [mapImageIdx, setMapImageIdx] = useState(0);
  const mapImageSrc = mapImageCandidates[Math.min(mapImageIdx, mapImageCandidates.length - 1)];
  const mapFramePaddingPx = useMemo(() => {
    const custom = Number(activeMap?.frame_padding_px);
    if (Number.isFinite(custom) && custom >= 0) return Math.min(custom, 32);
    return 8;
  }, [activeMap?.frame_padding_px]);
  const mapLayoutOuterRef = useRef(null);
  const {
    containerRef,
    worldRef,
    imgRef,
    tx,
    committed,
    fitScale,
    imgSize,
    moved,
    applyTransform,
    commit,
    fitMap,
    remeasureMap,
    toImagePct,
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
  } = useMapGestures({
    mapImageSrc,
    activeMapId,
    mode,
    onRefresh,
    embedded,
    mapLayoutOuterRef,
    mapFullscreen,
  });
  const { s: cs } = committed;
  const { w: iw, h: ih } = imgSize;
  const inv = 1 / cs;
  // Aimant de contour (lot « ancrage magnétique ») : analyse de l'image de fond à la demande.
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [snapRadiusPx, setSnapRadiusPx] = useState(EDGE_SNAP_DEFAULTS.radiusScreenPx);
  const [snapSensitivity, setSnapSensitivity] = useState(EDGE_SNAP_DEFAULTS.sensitivity);
  const edgeSnap = useMapImageEdgeSnap({
    src: mapImageSrc,
    active: snapEnabled && mode === 'edit-points',
  });
  // Rayons exprimés à l'écran → convertis en % d'image (constants visuellement au zoom).
  const snapRadiusPct = iw > 0 ? Math.max(0.05, ((snapRadiusPx * inv) / iw) * 100) : 1;
  const edgeTolerancePct = iw > 0 ? Math.min(8, Math.max(0.3, ((28 * inv) / iw) * 100)) : 3;

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
    fitHeightPx: imgSize.h,
    enabled: mode === 'view',
    extraCatalogEntries: visitMascotCatalogExtras,
    preferredMascotId: student?.visit_mascot_catalog_id,
    defaultMascotId: visitMascotDefaultId,
    onPersistPreferredMascotId: onPersistVisitMascotId,
    mascotDialogSettings: publicSettings?.visit?.mascot?.dialog,
  });
  const mascotGps = useMascotGpsFollow({
    georef: activeMap?.georef ?? null,
    gpsEnabled: !!activeMap?.gps_enabled && mode === 'view' && showMapMascot,
    moveTo: moveMapMascotTo,
  });
  const { zoneTaskVisualById, markerTaskVisualById } = useMemo(
    () => computeTaskVisualByLocation(tasks),
    [tasks],
  );

  const { zoneTutorialCountById, markerTutorialCountById } = useMemo(
    () => computeTutorialCountByLocation({ tutorials, tasks, zones, markers, activeMapId }),
    [tutorials, zones, markers, activeMapId, tasks],
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const ids = await fetchTutorialReadIds();
      if (!cancelled) setTutorialReadIds(new Set(ids));
    };
    load();
    if (typeof window !== 'undefined') {
      window.addEventListener('foretmap_session_changed', load);
      return () => {
        cancelled = true;
        window.removeEventListener('foretmap_session_changed', load);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [tutorials]);

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

  useEffect(() => {
    setMapImageIdx(0);
  }, [mapImageCandidates]);

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
    setMapLocationFilters({ ...MAP_LOCATION_FILTER_DEFAULTS });
    discardEditPointsSession();
    resetMapMascotMotion?.();
  }, [activeMapId, resetMapMascotMotion, resetDrawPoints, discardEditPointsSession]);

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
  // restent portés par les wrappers ci-dessous et les call sites des modales.
  const {
    saveMarker,
    updateMarker,
    linkTaskToLocation,
    unlinkTaskFromLocation,
    linkTutorialToLocation,
    unlinkTutorialFromLocation,
    deleteMarker,
    deleteZone,
    duplicateZone,
    duplicateMarker,
    assignTasksToStudent,
  } = useMapCrudActions({ activeMapId, tasks, tutorials, onRefresh, student, canEnrollNewTasks });

  const updateMarkerAndClose = async (id, data) => {
    await updateMarker(id, data);
    setSelectedMarker(null);
  };

  const duplicateZoneAndSelect = async (z) => {
    const created = await duplicateZone(z);
    setSelectedZone(created);
    setToast('Zone dupliquée ✓');
  };

  const duplicateMarkerAndSelect = async (m) => {
    const created = await duplicateMarker(m);
    setSelectedMarker(created);
    setToast('Repère dupliqué ✓');
  };

  const toggleMarkerPositionLock = () => {
    setMarkerPositionUnlocked((prev) => {
      const next = !prev;
      setToast(next ? 'Déplacement des repères activé' : 'Déplacement des repères verrouillé');
      return next;
    });
  };

  const mapMascotFitScale = Math.max(1, inv);
  // Hauteur affichée du plan AU REPOS (ajusté), indépendante du zoom : dimensionne les étiquettes
  // à une taille stable, le grossissement au zoom étant porté séparément par `mapZoomRatio`.
  const safeFitScale = fitScale > 0 ? fitScale : 1;
  const mapFitHeightPx = ih * safeFitScale;
  const mapFitWidthPx = iw * safeFitScale;
  const mapZoomRatio = cs / safeFitScale;
  const {
    percent: mapTextSizePercent,
    label: mapTextSizeLabel,
    cycle: cycleMapTextSize,
  } = useMapOverlayTextSizePreference();
  const mapSettings =
    publicSettings?.map && typeof publicSettings.map === 'object' ? publicSettings.map : null;
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
  const { mapEmojiLabelCenterGap, mapEmojiFontPx, mapLabelFontPx, markerLabelMarginTop } =
    resolveMapOverlayTypography(mapSettings, mapFitHeightPx, {
      worldScale: cs,
      zoomRatio: mapZoomRatio,
      fitWidthPx: mapFitWidthPx,
      isCoarsePointer,
      userTextSizePercent: mapTextSizePercent,
    });
  const mapOverlayLabelLayout = useMemo(
    () => resolveMapOverlayLabelLayout(mapSettings, { inv, isCoarsePointer }),
    [mapSettings, inv, isCoarsePointer],
  );
  const mapOverlayCssVars = useMemo(
    () =>
      resolveMapOverlayCssVariables(mapSettings, mapFitHeightPx, {
        fitWidthPx: mapFitWidthPx,
        isCoarsePointer,
        userTextSizePercent: mapTextSizePercent,
      }),
    [mapSettings, mapFitHeightPx, mapFitWidthPx, isCoarsePointer, mapTextSizePercent],
  );

  // Zones pré-parsées (JSON.parse des points + emoji/nom d'étiquette) : recalculées uniquement
  // quand les données changent, plus à chaque rendu de la carte (zoom, pan, mascotte…).
  const parsedZones = useMemo(
    () => parseZonesForLayer(zones, emojiParsingList),
    [zones, emojiParsingList],
  );

  const mapSpeciesOptions = useMemo(
    () => collectMapSpeciesOptions(zones, mapMarkersOnActiveMap),
    [zones, mapMarkersOnActiveMap],
  );

  const mapFilterContext = useMemo(
    () => ({
      zoneTaskVisualById,
      markerTaskVisualById,
      zoneTutorialCountById,
      markerTutorialCountById,
      emojiParsingList,
      speciesOptions: mapSpeciesOptions,
    }),
    [
      zoneTaskVisualById,
      markerTaskVisualById,
      zoneTutorialCountById,
      markerTutorialCountById,
      emojiParsingList,
      mapSpeciesOptions,
    ],
  );

  const {
    matchingZoneIds,
    matchingMarkerIds,
    resultItems: mapFilterResultItems,
    filterActive: mapFilterActive,
  } = useMemo(
    () =>
      applyMapLocationFilters({
        zones,
        markers: mapMarkersOnActiveMap,
        filters: mapLocationFilters,
        context: mapFilterContext,
      }),
    [zones, mapMarkersOnActiveMap, mapLocationFilters, mapFilterContext],
  );

  const dimmedZoneIds = useMemo(() => {
    if (!mapFilterActive) return null;
    const set = new Set();
    for (const parsed of parsedZones) {
      const id = String(parsed.zone.id);
      if (!matchingZoneIds.has(id)) set.add(id);
    }
    return set;
  }, [mapFilterActive, parsedZones, matchingZoneIds]);

  const dimmedMarkerIds = useMemo(() => {
    if (!mapFilterActive) return null;
    const set = new Set();
    for (const m of mapMarkersOnActiveMap) {
      const id = String(m.id);
      if (!matchingMarkerIds.has(id)) set.add(id);
    }
    return set;
  }, [mapFilterActive, mapMarkersOnActiveMap, matchingMarkerIds]);

  const focusMapOnLocation = useCallback(
    (focusPct) => {
      focusMapOnPct(focusPct, {
        containerRef,
        txRef: tx,
        imgSize,
        animateZoomTowardScale,
        commit,
        fitScale,
      });
    },
    [containerRef, tx, imgSize, animateZoomTowardScale, commit, fitScale],
  );

  const onSelectMapFilterResult = useCallback(
    (row) => {
      if (!row?.item) return;
      if (row.kind === 'zone') {
        if (showMapMascot) onMapMascotZoneClick(row.item, setSelectedZone);
        else setSelectedZone(row.item);
        focusMapOnLocation(zoneFocusPctFromPoints(row.item.points));
      } else {
        if (showMapMascot) onMapMascotMarkerClick(row.item, setSelectedMarker);
        else setSelectedMarker(row.item);
        focusMapOnLocation(markerFocusPct(row.item));
      }
    },
    [showMapMascot, onMapMascotZoneClick, onMapMascotMarkerClick, focusMapOnLocation],
  );

  useEffect(() => {
    if (mode !== 'view') return undefined;
    const onKeyDown = (e) => {
      if (e.defaultPrevented) return;
      const tag = String(e.target?.tagName || '').toLowerCase();
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        e.target?.isContentEditable
      ) {
        return;
      }
      const slash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey;
      const ctrlK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
      if (slash || ctrlK) {
        e.preventDefault();
        mapLocationSearchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode]);

  const openZoneFromMap = useCallback(
    (z, e) => {
      if (mode === 'view' && !moved.current) {
        e.stopPropagation();
        if (showMapMascot) onMapMascotZoneClick(z, setSelectedZone);
        else setSelectedZone(z);
      }
    },
    [mode, moved, showMapMascot, onMapMascotZoneClick],
  );

  const openMarkerFromMap = useCallback(
    (m, e) => {
      e.stopPropagation();
      if (!moved.current) {
        if (mode === 'view' && showMapMascot) onMapMascotMarkerClick(m, setSelectedMarker);
        else setSelectedMarker(m);
      }
    },
    [mode, moved, showMapMascot, onMapMascotMarkerClick],
  );

  const cursor =
    mode === 'view'
      ? 'grab'
      : mode === 'draw-zone'
        ? 'crosshair'
        : mode === 'edit-points'
          ? 'default'
          : 'cell';
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

      {selectedZone && (
        <ZoneInfoModal
          zone={selectedZone}
          plants={plants}
          tasks={tasks}
          tutorials={tutorials}
          isTeacher={isTeacher}
          student={student}
          canSelfAssignTasks={canSelfAssignTasks}
          canEnrollOnTasks={canEnrollNewTasks}
          markerEmojis={markerEmojis}
          emojiParsingList={emojiParsingList}
          contextCommentsEnabled={contextCommentsEnabled}
          canParticipateContextComments={canParticipateContextComments}
          onClose={() => {
            clearMapMascotDetailAfterMove();
            setSelectedZone(null);
          }}
          onUpdate={async (id, data) => {
            await onZoneUpdate(id, data);
            setSelectedZone(null);
            await onRefresh();
          }}
          onDelete={async (id) => {
            await deleteZone(id);
            setSelectedZone(null);
          }}
          onDuplicate={isTeacher ? duplicateZoneAndSelect : undefined}
          onLinkTask={async (taskId) => linkTaskToLocation(taskId, 'zone', selectedZone.id)}
          onUnlinkTask={(t) => unlinkTaskFromLocation(t, 'zone', selectedZone.id)}
          onAssignTasks={assignTasksToStudent}
          onLinkTutorial={async (tutorialId) =>
            linkTutorialToLocation(tutorialId, 'zone', selectedZone.id)
          }
          onUnlinkTutorial={(tu) => unlinkTutorialFromLocation(tu, 'zone', selectedZone.id)}
          onEditPoints={
            isTeacher
              ? (z) => {
                  startEditPoints(z);
                  setSelectedZone(null);
                }
              : null
          }
          onNavigateToTasksForLocation={onNavigateToTasksForLocation}
          onOpenTutorialPreview={setMapTutorialPreview}
          onOpenPlantCatalogPreview={
            onOpenPlantCatalogPreview
              ? (id) => {
                  onOpenPlantCatalogPreview(id);
                  setSelectedZone(null);
                }
              : null
          }
        />
      )}
      {selectedMarker && (
        <MarkerModal
          marker={selectedMarker}
          plants={plants}
          tasks={tasks}
          tutorials={tutorials}
          isTeacher={isTeacher}
          student={student}
          canSelfAssignTasks={canSelfAssignTasks}
          canEnrollOnTasks={canEnrollNewTasks}
          markerEmojis={markerEmojis}
          contextCommentsEnabled={contextCommentsEnabled}
          canParticipateContextComments={canParticipateContextComments}
          onClose={() => {
            clearMapMascotDetailAfterMove();
            setSelectedMarker(null);
          }}
          onUpdate={updateMarkerAndClose}
          onDelete={deleteMarker}
          onDuplicate={isTeacher ? duplicateMarkerAndSelect : undefined}
          onLinkTask={async (taskId) => linkTaskToLocation(taskId, 'marker', selectedMarker.id)}
          onUnlinkTask={(t) => unlinkTaskFromLocation(t, 'marker', selectedMarker.id)}
          onLinkTutorial={async (tutorialId) =>
            linkTutorialToLocation(tutorialId, 'marker', selectedMarker.id)
          }
          onUnlinkTutorial={(tu) => unlinkTutorialFromLocation(tu, 'marker', selectedMarker.id)}
          onAssignTasks={assignTasksToStudent}
          onNavigateToTasksForLocation={onNavigateToTasksForLocation}
          onOpenTutorialPreview={setMapTutorialPreview}
          onOpenPlantCatalogPreview={
            onOpenPlantCatalogPreview
              ? (id) => {
                  onOpenPlantCatalogPreview(id);
                  setSelectedMarker(null);
                }
              : null
          }
          onRequestAdjustMarkerPosition={
            isTeacher
              ? () => {
                  setMarkerPositionUnlocked(true);
                  setToast(
                    'Déplacement des repères activé : fais glisser le repère sur la carte, puis reverrouille dans la barre d’outils si besoin.',
                  );
                }
              : undefined
          }
        />
      )}
      {pendingZone && (
        <ZoneDrawModal
          points_pct={pendingZone}
          plants={plants}
          markerEmojis={markerEmojis}
          emojiParsingList={emojiParsingList}
          onClose={() => setPendingZone(null)}
          onSave={async (data) => {
            await api('/api/zones', 'POST', { ...data, map_id: activeMapId });
            setPendingZone(null);
            await onRefresh();
          }}
        />
      )}
      {pendingMarker && (
        <MarkerModal
          marker={{
            x_pct: pendingMarker.xp,
            y_pct: pendingMarker.yp,
            label: '',
            note: '',
            emoji: markerEmojis[0] || '🌱',
            plant_name: '',
            map_id: activeMapId,
          }}
          plants={plants}
          isTeacher={isTeacher}
          markerEmojis={markerEmojis}
          onClose={() => setPendingMarker(null)}
          onSave={saveMarker}
          onDelete={() => setPendingMarker(null)}
        />
      )}

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
            const moved = snapSelectedPoints();
            setToast(
              moved > 0
                ? `${moved} sommet${moved > 1 ? 's' : ''} collé${moved > 1 ? 's' : ''} au contour`
                : 'Aucun contour trouvé à proximité',
            );
          }}
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
          mapTextSizeLabel={mapTextSizeLabel}
          onCycleMapTextSize={cycleMapTextSize}
          gps={mascotGps}
          containerRef={containerRef}
          txRef={tx}
          fitMap={fitMap}
          animateZoomTowardScale={animateZoomTowardScale}
          onOpenFullscreen={openMapFullscreen}
        />
      ) : null}

      <MascotGpsStatusBanner gps={mascotGps} />

      <MapFullscreenShell
        active={mapFullscreen}
        onClose={closeMapFullscreen}
        layerClassName="map-view-fullscreen-shell"
      >
        <div
          ref={mapLayoutOuterRef}
          className={`map-view-canvas-outer${mapFullscreen ? ' map-view-canvas-outer--fullscreen' : ''}`}
          style={{
            minHeight: 0,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
            ...(embedded
              ? {
                  paddingTop: 0,
                  paddingLeft: mapFramePaddingPx,
                  paddingRight: mapFramePaddingPx,
                  paddingBottom: mapFramePaddingPx,
                }
              : { padding: mapFramePaddingPx }),
          }}
        >
          {mode === 'view' && (
            <>
              <MapLocationFiltersBar
                filters={mapLocationFilters}
                setFilters={setMapLocationFilters}
                speciesOptions={mapSpeciesOptions}
                zoneMatchCount={matchingZoneIds.size}
                markerMatchCount={matchingMarkerIds.size}
                searchInputRef={mapLocationSearchRef}
              />
              {isMapLocationFilterActive(mapLocationFilters) && mapFilterResultItems.length > 0 ? (
                <MapLocationFilterResults
                  items={mapFilterResultItems}
                  onSelectItem={onSelectMapFilterResult}
                />
              ) : null}
            </>
          )}
          <div className="map-view-canvas-slot">
            <div
              ref={containerRef}
              className="map-view-canvas map-viewport"
              style={{
                cursor,
                touchAction,
                userSelect: 'none',
                WebkitUserSelect: 'none',
                ...mapOverlayCssVars,
              }}
              onClick={onMapClick}
            >
              <MapViewWorldLayer worldRef={worldRef} width={iw} height={ih}>
                <MapViewBackgroundImage
                  imgRef={imgRef}
                  src={mapImageSrc}
                  alt={`Plan ${activeMap?.label || 'du jardin'}`}
                  width={iw}
                  height={ih}
                  onError={() =>
                    setMapImageIdx((idx) => (idx < mapImageCandidates.length - 1 ? idx + 1 : idx))
                  }
                />

                <svg
                  className="map-zone-svg-layer"
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: iw,
                    height: ih,
                    overflow: 'visible',
                    pointerEvents: 'none',
                    textRendering: 'optimizeLegibility',
                  }}
                >
                  <g style={{ pointerEvents: 'all' }}>
                    <ZonePolygonsLayer
                      parsedZones={parsedZones}
                      iw={iw}
                      ih={ih}
                      inv={inv}
                      mode={mode}
                      showLabels={showLabels}
                      editZoneId={editZone?.id ?? null}
                      dimmedZoneIds={dimmedZoneIds}
                      zoneTaskVisualById={zoneTaskVisualById}
                      zoneTutorialCountById={zoneTutorialCountById}
                      emojiFontPx={mapEmojiFontPx}
                      labelFontPx={mapLabelFontPx}
                      emojiLabelCenterGap={mapEmojiLabelCenterGap}
                      minSideFactor={mapOverlayLabelLayout.minSideFactor}
                      labelMaxWorldLength={mapOverlayLabelLayout.maxWorldLength}
                      labelCompressChars={mapOverlayLabelLayout.compressChars}
                      onZoneOpen={openZoneFromMap}
                    />
                    <DrawingLayer drawPoints={drawPoints} iw={iw} ih={ih} inv={inv} />
                    <EditPointsLayer
                      mode={mode}
                      editPoints={editPoints}
                      draggingPtIdx={draggingPtIdx}
                      selectedPtIdxs={selectedPtIdxs}
                      insertVertexMode={insertVertexMode}
                      iw={iw}
                      ih={ih}
                      inv={inv}
                      toImagePct={toImagePct}
                      onInsertPointFromPct={insertPointFromPct}
                      onInsertPointAtMidpoint={insertPointAtMidpoint}
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
                    />
                  </g>
                </svg>

                <MapViewMascotOverlay
                  show={showMapMascot}
                  mascotClassName={mapMascotClassName}
                  embedded={embedded}
                  renderPct={mapMascotRenderPct}
                  fitScale={mapMascotFitScale}
                  faceRight={mapMascotFaceRight}
                  animationState={mapMascotAnimationState}
                  mascotId={mapMascotId}
                  extraCatalogEntries={visitMascotCatalogExtras}
                  dialogVisible={mapMascotDialogVisible}
                  dialog={mapMascotDialog}
                />

                {markers.map((m) => {
                  const markerTaskVisual = markerTaskVisualById.get(m.id);
                  const markerTaskLabel = markerTaskVisual
                    ? TASK_VISUAL_LABEL[markerTaskVisual]
                    : '';
                  const markerTutorialCount = markerTutorialCountById.get(m.id) || 0;
                  const markerTutorialLabel =
                    markerTutorialCount === 0
                      ? ''
                      : markerTutorialCount === 1
                        ? '1 tutoriel lié'
                        : `${markerTutorialCount} tutoriels liés`;
                  const markerAriaLabel = [
                    m.label || 'Repère',
                    markerTaskLabel,
                    markerTutorialLabel,
                  ]
                    .filter(Boolean)
                    .join(' — ');
                  const markerDraggable = isTeacher && markerPositionUnlocked;
                  return (
                    <MapViewMarkerBubbleMemo
                      key={m.id}
                      marker={m}
                      dimmed={dimmedMarkerIds?.has(String(m.id))}
                      ariaLabel={markerAriaLabel}
                      showLabels={showLabels}
                      isCoarsePointer={isCoarsePointer}
                      draggable={markerDraggable}
                      emojiFontSize={`${mapEmojiFontPx}px`}
                      labelFontSize={`${mapLabelFontPx}px`}
                      labelMarginTop={markerLabelMarginTop}
                      labelMaxWidthPx={mapOverlayLabelLayout.maxScreenPx}
                      taskVisual={markerTaskVisual}
                      taskLabel={markerTaskLabel}
                      tutorialCount={markerTutorialCount}
                      tutorialLabel={markerTutorialLabel}
                      onOpenMarker={openMarkerFromMap}
                      onBeginMarkerDrag={beginMarkerDrag}
                    />
                  );
                })}
              </MapViewWorldLayer>

              <MapCanvasHints
                mode={mode}
                drawPointsCount={drawPoints.length}
                prefersPageScroll={prefersPageScroll}
                isCoarsePointer={isCoarsePointer}
                hintTexts={mapCanvasHintTexts}
              />
            </div>
          </div>
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
