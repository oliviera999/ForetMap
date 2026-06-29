import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';

import { api } from '../services/api';

import {
  MARKER_EMOJIS,
  parseEmojiListSetting,
  detectLeadingMarkerEmoji,
  stripLeadingMarkerEmoji,
} from '../constants/emojis';

import { resolveMapOverlayTypography } from '../utils/mapOverlayTypography';

import { TASK_VISUAL_LABEL } from '../utils/taskEnrollment.js';
import {
  computeTaskVisualByLocation,
  computeTutorialCountByLocation,
} from '../utils/mapLocationBadges.js';
import {
  clampEditZonePct,
  clampEditPts,
  cloneEditPts,
  editPtsSnapshotEqual,
  offsetDuplicateZonePoints,
} from '../utils/zoneEditGeometry.js';
import { orderedLivingBeingsForForm } from '../utils/livingBeings';
import { buildMapImageCandidates } from '../utils/mapImageCandidates';

import { taskLocationIds, tutorialLocationIds } from '../utils/mapLocationContext';
import { TutorialPreviewModal } from './TutorialPreviewModal';
import { fetchTutorialReadIds } from './TutorialReadAcknowledge';

import { MapViewMascotOverlay } from './MapViewMascotOverlay.jsx';
import { MapViewMarkerBubble } from './MapViewMarkerBubble.jsx';
import { MapViewBackgroundImage } from './MapViewBackgroundImage.jsx';
import { MapViewWorldLayer } from './MapViewWorldLayer.jsx';
import useMapViewMascot from '../hooks/useMapViewMascot.js';
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

import { ZoneDrawModal } from './map/ZoneDrawModal.jsx';
import { PhotoGallery } from './map/PhotoGallery.jsx';
import { LocationTutorialPreviewList } from './map/mapModalShared.jsx';
import { ZoneInfoModal } from './map/ZoneInfoModal.jsx';
import { MarkerModal } from './map/MarkerModal.jsx';
import { MapViewToolbar } from './map/MapViewToolbar.jsx';
import { MapCanvasHints } from './map/MapCanvasHints.jsx';
import { useMapFullscreen } from '../shared/hooks/useMapFullscreen.js';
import { MapFullscreenShell } from '../shared/components/MapFullscreenShell.jsx';
import { usePublicSettings } from '../contexts/PublicSettingsContext.jsx';
import { resolveMapCanvasHint } from '../utils/helpResolve.js';
import { useSession } from '../contexts/SessionContext.jsx';
import { useData } from '../contexts/DataContext.jsx';

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
  const [drawPoints, setDrawPoints] = useState([]);
  const [editZone, setEditZone] = useState(null);
  const [editPoints, setEditPoints] = useState([]);
  const [draggingPtIdx, setDraggingPtIdx] = useState(-1);
  const [editCanUndo, setEditCanUndo] = useState(false);
  const editZoneTranslateLastRef = useRef(null);
  const editPointsHistoryRef = useRef([]);
  const editPointsRef = useRef([]);
  const [selectedZone, setSelectedZone] = useState(null);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [pendingZone, setPendingZone] = useState(null);
  const [pendingMarker, setPendingMarker] = useState(null);
  const [toast, setToast] = useState(null);
  const [mapTutorialPreview, setMapTutorialPreview] = useState(null);
  const [tutorialReadIds, setTutorialReadIds] = useState(() => new Set());
  const [markerPositionUnlocked, setMarkerPositionUnlocked] = useState(false);
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
  const visitMascotAllowedIds = useMemo(() => {
    const raw = publicSettings?.visit?.mascot?.allowed_ids;
    if (Array.isArray(raw)) {
      return raw.map((id) => String(id || '').trim()).filter(Boolean);
    }
    if (typeof raw === 'string') {
      return raw
        .split(/[,\n;]+/g)
        .map((id) => String(id || '').trim())
        .filter(Boolean);
    }
    return [];
  }, [publicSettings?.visit?.mascot?.allowed_ids]);
  const visitMascotDefaultId = String(publicSettings?.visit?.mascot?.default_id || '').trim();
  // Packs mascotte serveur publiés de la carte → la mascotte peut être un pack importé (srv-…).
  const visitMascotCatalogExtras = useVisitMascotCatalogExtras({
    mapId: activeMapId,
    enabled: mode === 'view',
  });
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
  } = useMapGestures({
    mapImageSrc,
    activeMapId,
    mode,
    onRefresh,
    embedded,
    mapLayoutOuterRef,
    mapFullscreen,
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
    allowedMascotIds: visitMascotAllowedIds,
    defaultMascotId: visitMascotDefaultId,
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
    setDrawPoints([]);
    setEditZone(null);
    setEditPoints([]);
    setSelectedZone(null);
    setSelectedMarker(null);
    setPendingZone(null);
    setPendingMarker(null);
    setMarkerPositionUnlocked(false);
    editZoneTranslateLastRef.current = null;
    editPointsHistoryRef.current = [];
    setEditCanUndo(false);
    resetMapMascotMotion?.();
  }, [activeMapId, resetMapMascotMotion]);

  useEffect(() => {
    if (mode !== 'edit-points') editZoneTranslateLastRef.current = null;
  }, [mode]);

  useEffect(() => {
    editPointsRef.current = editPoints;
  }, [editPoints]);

  const onMapClick = (e) => {
    if (moved.current) return;
    if (e.target.closest('.map-zone-hit') || e.target.closest('.map-bubble')) return;
    const p = toImagePct(e.clientX, e.clientY);
    if (!p) return;
    if (mode === 'view' && showMapMascot) {
      moveMapMascotTo(p.xp, p.yp);
      return;
    }
    if (mode === 'draw-zone') setDrawPoints((pts) => [...pts, p]);
    else if (mode === 'add-marker') {
      setPendingMarker(p);
      setMode('view');
    }
  };

  const finishZone = () => {
    if (drawPoints.length >= 3) {
      setPendingZone(drawPoints);
      setDrawPoints([]);
      setMode('view');
    }
  };
  const undoPoint = () => setDrawPoints((pts) => pts.slice(0, -1));
  const cancelDraw = () => {
    setDrawPoints([]);
    setMode('view');
  };

  const recordEditHistoryAfterGesture = useCallback(() => {
    if (mode !== 'edit-points') return;
    const cur = clampEditPts(cloneEditPts(editPointsRef.current));
    const h = editPointsHistoryRef.current;
    const last = h[h.length - 1];
    if (last && editPtsSnapshotEqual(last, cur)) return;
    h.push(cur);
    while (h.length > 30) h.shift();
    setEditCanUndo(h.length > 1);
  }, [mode]);

  const scheduleRecordEditHistory = useCallback(() => {
    window.setTimeout(() => {
      recordEditHistoryAfterGesture();
    }, 0);
  }, [recordEditHistoryAfterGesture]);

  const undoEditPoints = useCallback(() => {
    const h = editPointsHistoryRef.current;
    if (h.length <= 1) return;
    h.pop();
    const prev = h[h.length - 1];
    setEditPoints(cloneEditPts(prev));
    setEditCanUndo(h.length > 1);
  }, []);

  useEffect(() => {
    if (mode !== 'edit-points') return undefined;
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
      const t = e.target;
      if (t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      undoEditPoints();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [mode, undoEditPoints]);

  const discardEditPointsSession = useCallback(() => {
    setEditZone(null);
    setEditPoints([]);
    editPointsHistoryRef.current = [];
    setEditCanUndo(false);
    editZoneTranslateLastRef.current = null;
  }, []);

  const startEditPoints = (z) => {
    let pts;
    try {
      pts = z.points ? JSON.parse(z.points) : [];
    } catch (e) {
      pts = [];
    }
    const clamped = clampEditPts(pts);
    editPointsHistoryRef.current = [cloneEditPts(clamped)];
    setEditCanUndo(false);
    setEditZone(z);
    setEditPoints(clamped);
    setMode('edit-points');
    setSelectedZone(null);
  };
  const saveEditPoints = async () => {
    if (!editZone) return;
    await api(`/api/zones/${editZone.id}`, 'PUT', { points: editPoints });
    await onRefresh();
    discardEditPointsSession();
    setMode('view');
    setToast('Contour sauvegardé ✓');
  };

  const saveMarker = async (d) => {
    const payload = { ...d, map_id: d.map_id || activeMapId };
    await api('/api/map/markers', 'POST', payload);
    await onRefresh();
  };

  const updateMarker = async (id, data) => {
    const payload = { ...data, map_id: data.map_id || activeMapId };
    await api(`/api/map/markers/${id}`, 'PUT', payload);
    await onRefresh();
    setSelectedMarker(null);
  };
  const linkTaskToZone = async (taskId, zoneId) => {
    const t = (tasks || []).find((x) => x.id === taskId);
    const { zoneIds: zi, markerIds: mi } = taskLocationIds(t);
    const zoneIds = [...new Set([...zi, zoneId])];
    await api(`/api/tasks/${taskId}`, 'PUT', { zone_ids: zoneIds, marker_ids: mi });
    await onRefresh();
  };
  const linkTaskToMarker = async (taskId, markerId) => {
    const t = (tasks || []).find((x) => x.id === taskId);
    const { zoneIds: zi, markerIds: mi } = taskLocationIds(t);
    const markerIds = [...new Set([...mi, markerId])];
    await api(`/api/tasks/${taskId}`, 'PUT', { zone_ids: zi, marker_ids: markerIds });
    await onRefresh();
  };
  const unlinkTaskFromZone = async (task, zoneId) => {
    const { zoneIds: zi, markerIds: mi } = taskLocationIds(task);
    const zoneIds = zi.filter((id) => id !== zoneId);
    const payload = { zone_ids: zoneIds, marker_ids: mi };
    if (zoneIds.length === 0 && mi.length === 0) payload.map_id = activeMapId;
    await api(`/api/tasks/${task.id}`, 'PUT', payload);
    await onRefresh();
  };
  const unlinkTaskFromMarker = async (task, markerId) => {
    const { zoneIds: zi, markerIds: mi } = taskLocationIds(task);
    const markerIds = mi.filter((id) => id !== markerId);
    const payload = { zone_ids: zi, marker_ids: markerIds };
    if (zi.length === 0 && markerIds.length === 0) payload.map_id = activeMapId;
    await api(`/api/tasks/${task.id}`, 'PUT', payload);
    await onRefresh();
  };
  const linkTutorialToZone = async (tutorialId, zoneId) => {
    const tu = (tutorials || []).find((x) => Number(x.id) === Number(tutorialId));
    if (!tu) return;
    const { zoneIds: zi, markerIds: mi } = tutorialLocationIds(tu);
    const zoneIds = [...new Set([...(zi || []), zoneId])];
    await api(`/api/tutorials/${tutorialId}`, 'PUT', { zone_ids: zoneIds, marker_ids: mi });
    await onRefresh();
  };
  const unlinkTutorialFromZone = async (tutorial, zoneId) => {
    const { zoneIds: zi, markerIds: mi } = tutorialLocationIds(tutorial);
    const zoneIds = zi.filter((id) => String(id) !== String(zoneId));
    await api(`/api/tutorials/${tutorial.id}`, 'PUT', { zone_ids: zoneIds, marker_ids: mi });
    await onRefresh();
  };
  const linkTutorialToMarker = async (tutorialId, markerId) => {
    const tu = (tutorials || []).find((x) => Number(x.id) === Number(tutorialId));
    if (!tu) return;
    const { zoneIds: zi, markerIds: mi } = tutorialLocationIds(tu);
    const markerIds = [...new Set([...(mi || []), markerId])];
    await api(`/api/tutorials/${tutorialId}`, 'PUT', { zone_ids: zi, marker_ids: markerIds });
    await onRefresh();
  };
  const unlinkTutorialFromMarker = async (tutorial, markerId) => {
    const { zoneIds: zi, markerIds: mi } = tutorialLocationIds(tutorial);
    const markerIds = mi.filter((id) => String(id) !== String(markerId));
    await api(`/api/tutorials/${tutorial.id}`, 'PUT', { zone_ids: zi, marker_ids: markerIds });
    await onRefresh();
  };
  const deleteMarker = async (id) => {
    await api(`/api/map/markers/${id}`, 'DELETE');
    await onRefresh();
  };
  const deleteZone = async (id) => {
    await api(`/api/zones/${id}`, 'DELETE');
    await onRefresh();
  };
  const duplicateZone = async (z) => {
    let pts;
    try {
      pts = z.points ? JSON.parse(z.points) : [];
    } catch (e) {
      pts = [];
    }
    if (!pts || pts.length < 3) throw new Error('Contour invalide');
    const shifted = offsetDuplicateZonePoints(pts);
    if (!shifted) throw new Error('Contour invalide');
    const living = orderedLivingBeingsForForm(
      z.living_beings_list || z.living_beings,
      z.current_plant,
    );
    const created = await api('/api/zones', 'POST', {
      name: `${z.name || 'Zone'} (copie)`,
      points: shifted,
      color: z.color || '#86efac80',
      current_plant: '',
      living_beings: living,
      stage: z.stage || 'empty',
      map_id: z.map_id || activeMapId,
      description: z.description || '',
    });
    await onRefresh();
    setSelectedZone(created);
    setToast('Zone dupliquée ✓');
  };

  const duplicateMarker = async (m) => {
    const dx = 1.5;
    const dy = 1.5;
    const nx = Math.min(100, Math.max(0, Number(m.x_pct) + dx));
    const ny = Math.min(100, Math.max(0, Number(m.y_pct) + dy));
    const living = orderedLivingBeingsForForm(
      m.living_beings_list || m.living_beings,
      m.plant_name,
    );
    const baseLabel = String(m.label || 'Repère')
      .replace(/\s*\(copie\)\s*$/i, '')
      .trim();
    const created = await api('/api/map/markers', 'POST', {
      map_id: m.map_id || activeMapId,
      x_pct: nx,
      y_pct: ny,
      label: `${baseLabel} (copie)`,
      plant_name: '',
      living_beings: living,
      note: m.note || '',
      emoji: String(m.emoji ?? '').trim(),
      visit_subtitle: m.visit_subtitle,
      visit_short_description: m.visit_short_description,
      visit_details_title: m.visit_details_title,
      visit_details_text: m.visit_details_text,
    });
    await onRefresh();
    setSelectedMarker(created);
    setToast('Repère dupliqué ✓');
  };

  const assignTasksToStudent = async (taskIds) => {
    const ids = [...new Set((taskIds || []).filter(Boolean))];
    if (!canEnrollNewTasks || !ids.length || !student) {
      return { assignedCount: 0, failedCount: 0, firstError: null };
    }
    let assignedCount = 0;
    let failedCount = 0;
    let firstError = null;
    for (const taskId of ids) {
      try {
        await api(`/api/tasks/${taskId}/assign`, 'POST', {
          firstName: student.first_name,
          lastName: student.last_name,
          studentId: student.id,
        });
        assignedCount += 1;
      } catch (err) {
        failedCount += 1;
        if (!firstError) firstError = err?.message || 'Erreur serveur';
      }
    }
    await onRefresh();
    return { assignedCount, failedCount, firstError };
  };
  const toggleMarkerPositionLock = () => {
    setMarkerPositionUnlocked((prev) => {
      const next = !prev;
      setToast(next ? 'Déplacement des repères activé' : 'Déplacement des repères verrouillé');
      return next;
    });
  };

  const { s: cs } = committed;
  const { w: iw, h: ih } = imgSize;
  const inv = 1 / cs;
  const mapMascotFitScale = Math.max(1, inv);
  // Hauteur affichée du plan AU REPOS (ajusté), indépendante du zoom : dimensionne les étiquettes
  // à une taille stable, le grossissement au zoom étant porté séparément par `mapZoomRatio`.
  const safeFitScale = fitScale > 0 ? fitScale : 1;
  const mapFitHeightPx = ih * safeFitScale;
  const mapZoomRatio = cs / safeFitScale;
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
    });

  const toWorld = (p) => ({ cx: (p.xp / 100) * iw, cy: (p.yp / 100) * ih });

  const renderZonePoly = (z) => {
    let pts;
    try {
      pts = z.points ? JSON.parse(z.points) : null;
    } catch (e) {
      pts = null;
    }
    if (!pts || pts.length < 3) return null;
    const wp = pts.map(toWorld);
    const str = wp.map((p) => `${p.cx},${p.cy}`).join(' ');
    const mx = wp.reduce((s, p) => s + p.cx, 0) / wp.length;
    const my = wp.reduce((s, p) => s + p.cy, 0) / wp.length;
    const zoneEmoji = detectLeadingMarkerEmoji(z.name || '', emojiParsingList);
    const zoneName = stripLeadingMarkerEmoji(z.name || '', emojiParsingList);
    const isEd = mode === 'edit-points' && editZone?.id === z.id;
    const zoneTaskVisual = zoneTaskVisualById.get(z.id);
    const zoneTutorialCount = zoneTutorialCountById.get(z.id) || 0;
    return (
      <g
        key={z.id}
        className={mode === 'view' ? 'map-zone-hit' : ''}
        style={{ cursor: mode === 'view' ? 'pointer' : 'default' }}
        onClick={(e) => {
          if (mode === 'view' && !moved.current) {
            e.stopPropagation();
            if (showMapMascot) onMapMascotZoneClick(z, setSelectedZone);
            else setSelectedZone(z);
          }
        }}
      >
        <polygon
          points={str}
          fill={isEd ? 'rgba(82,183,136,0.35)' : z.color || '#86efac90'}
          stroke={isEd ? '#52b788' : 'rgba(26,71,49,0.5)'}
          strokeWidth={(isEd ? 2.5 : 1.5) * inv}
          strokeDasharray={z.special ? `${5 * inv},${3 * inv}` : 'none'}
        />
        {showLabels && (
          <text
            x={mx}
            y={my}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={mapEmojiFontPx}
            fontFamily="ForetMapColorEmoji, Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {zoneEmoji || ''}
          </text>
        )}
        {showLabels && (
          <text
            x={mx}
            y={my + (zoneEmoji ? mapEmojiLabelCenterGap : 0)}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={mapLabelFontPx}
            fontWeight="700"
            fontFamily="DM Sans,sans-serif"
            fill="#1a4731"
            stroke="rgba(255,255,255,0.8)"
            strokeWidth={3 * inv}
            paintOrder="stroke"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {zoneName || z.name}
          </text>
        )}
        {zoneTaskVisual && (
          <circle
            className={`map-task-status map-task-status--${zoneTaskVisual}`}
            cx={mx + 16 * inv}
            cy={my - 12 * inv}
            r={Math.max(5, 7 * inv)}
            style={{ pointerEvents: 'none' }}
          >
            <title>{TASK_VISUAL_LABEL[zoneTaskVisual]}</title>
          </circle>
        )}
        {zoneTutorialCount > 0 && (
          <circle
            className="map-tutorial-zone-dot"
            cx={mx - 16 * inv}
            cy={my - 12 * inv}
            r={Math.max(4, 6 * inv)}
            style={{ pointerEvents: 'none' }}
          >
            <title>
              {zoneTutorialCount === 1 ? '1 tutoriel lié' : `${zoneTutorialCount} tutoriels liés`}
            </title>
          </circle>
        )}
      </g>
    );
  };

  const endEditZoneTranslate = (e) => {
    scheduleRecordEditHistory();
    editZoneTranslateLastRef.current = null;
    if (e?.currentTarget?.hasPointerCapture?.(e.pointerId)) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
  };

  const renderEditPts = () => {
    if (mode !== 'edit-points' || !editPoints.length) return null;
    const wp = editPoints.map(toWorld);
    const str = wp.map((p) => `${p.cx},${p.cy}`).join(' ');
    /** Anneau léger + croix : voir le sol sous le sommet ; disque invisible pour le doigt. */
    const rHit = Math.max(22, 14 * inv);
    const rVis = Math.max(4, 5.5 * inv);
    const crossHalf = Math.max(9, 11 * inv);
    const crossStroke = Math.max(1, 1.2 * inv);
    const centerR = Math.max(1.4, 1.7 * inv);
    return (
      <g>
        <polygon
          className="edit-zone-translate"
          points={str}
          fill="rgba(82,183,136,0.2)"
          stroke="#52b788"
          strokeWidth={2 * inv}
          style={{ cursor: 'move', touchAction: 'none' }}
          onPointerDown={(e) => {
            e.stopPropagation();
            const p0 = toImagePct(e.clientX, e.clientY);
            if (!p0) return;
            editZoneTranslateLastRef.current = p0;
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch (_) {}
          }}
          onPointerMove={(e) => {
            const last = editZoneTranslateLastRef.current;
            if (!last) return;
            const p2 = toImagePct(e.clientX, e.clientY);
            if (!p2) return;
            const dx = p2.xp - last.xp;
            const dy = p2.yp - last.yp;
            editZoneTranslateLastRef.current = p2;
            setEditPoints((pts) =>
              clampEditPts(pts.map((pt) => ({ xp: pt.xp + dx, yp: pt.yp + dy }))),
            );
            e.preventDefault();
          }}
          onPointerUp={endEditZoneTranslate}
          onPointerCancel={endEditZoneTranslate}
          onLostPointerCapture={() => {
            editZoneTranslateLastRef.current = null;
          }}
        />
        {wp.map((p, i) => {
          const dragging = draggingPtIdx === i;
          return (
            <g
              key={i}
              className={`edit-pt${dragging ? ' edit-pt--dragging' : ''}`}
              style={{ cursor: 'grab', touchAction: 'none' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                setDraggingPtIdx(i);
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch (_) {}
              }}
              onPointerMove={(e) => {
                if (draggingPtIdx === i) {
                  const p2 = toImagePct(e.clientX, e.clientY);
                  if (p2)
                    setEditPoints((pts) =>
                      pts.map((pt, j) => (j === i ? clampEditZonePct(p2) : pt)),
                    );
                }
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                scheduleRecordEditHistory();
                setDraggingPtIdx(-1);
                if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
                  try {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  } catch (_) {}
                }
              }}
            >
              <circle cx={p.cx} cy={p.cy} r={rHit} fill="transparent" />
              <circle
                cx={p.cx}
                cy={p.cy}
                r={rVis}
                fill={dragging ? 'rgba(26,71,49,0.38)' : 'rgba(255,255,255,0.18)'}
                stroke="#1a4731"
                strokeWidth={dragging ? 2.4 * inv : 1.6 * inv}
                style={{ pointerEvents: 'none' }}
              />
              <g className="edit-pt-cross" style={{ pointerEvents: 'none' }}>
                <line
                  x1={p.cx - crossHalf}
                  y1={p.cy}
                  x2={p.cx + crossHalf}
                  y2={p.cy}
                  stroke="rgba(26,71,49,0.88)"
                  strokeWidth={crossStroke}
                  strokeLinecap="round"
                />
                <line
                  x1={p.cx}
                  y1={p.cy - crossHalf}
                  x2={p.cx}
                  y2={p.cy + crossHalf}
                  stroke="rgba(26,71,49,0.88)"
                  strokeWidth={crossStroke}
                  strokeLinecap="round"
                />
              </g>
              <circle
                cx={p.cx}
                cy={p.cy}
                r={centerR}
                fill={dragging ? '#1a4731' : 'rgba(26,71,49,0.82)'}
                style={{ pointerEvents: 'none' }}
              />
            </g>
          );
        })}
      </g>
    );
  };

  const renderDrawing = () => {
    if (!drawPoints.length) return null;
    const wp = drawPoints.map(toWorld);
    const str = wp.map((p) => `${p.cx},${p.cy}`).join(' ');
    const rVis = Math.max(3.5, 5 * inv);
    const crossHalf = Math.max(7, 9 * inv);
    const crossStroke = Math.max(1, 1.1 * inv);
    const centerR = Math.max(1.2, 1.5 * inv);
    return (
      <g>
        {drawPoints.length > 1 && (
          <polyline
            points={str}
            fill="none"
            stroke="#52b788"
            strokeWidth={2 * inv}
            strokeDasharray={`${6 * inv},${3 * inv}`}
          />
        )}
        {wp.map((p, i) => (
          <g key={i} style={{ pointerEvents: 'none' }}>
            <circle
              cx={p.cx}
              cy={p.cy}
              r={rVis}
              fill="rgba(26,71,49,0.2)"
              stroke="rgba(26,71,49,0.9)"
              strokeWidth={1.5 * inv}
            />
            <line
              x1={p.cx - crossHalf}
              y1={p.cy}
              x2={p.cx + crossHalf}
              y2={p.cy}
              stroke="rgba(26,71,49,0.85)"
              strokeWidth={crossStroke}
              strokeLinecap="round"
            />
            <line
              x1={p.cx}
              y1={p.cy - crossHalf}
              x2={p.cx}
              y2={p.cy + crossHalf}
              stroke="rgba(26,71,49,0.85)"
              strokeWidth={crossStroke}
              strokeLinecap="round"
            />
            <circle cx={p.cx} cy={p.cy} r={centerR} fill="rgba(26,71,49,0.88)" />
          </g>
        ))}
      </g>
    );
  };

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
          onDuplicate={isTeacher ? duplicateZone : undefined}
          onLinkTask={async (taskId) => linkTaskToZone(taskId, selectedZone.id)}
          onUnlinkTask={(t) => unlinkTaskFromZone(t, selectedZone.id)}
          onAssignTasks={assignTasksToStudent}
          onLinkTutorial={async (tutorialId) => linkTutorialToZone(tutorialId, selectedZone.id)}
          onUnlinkTutorial={(tu) => unlinkTutorialFromZone(tu, selectedZone.id)}
          onEditPoints={isTeacher ? (z) => startEditPoints(z) : null}
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
          onSave={saveMarker}
          onUpdate={updateMarker}
          onDelete={deleteMarker}
          onDuplicate={isTeacher ? duplicateMarker : undefined}
          onLinkTask={async (taskId) => linkTaskToMarker(taskId, selectedMarker.id)}
          onUnlinkTask={(t) => unlinkTaskFromMarker(t, selectedMarker.id)}
          onLinkTutorial={async (tutorialId) => linkTutorialToMarker(tutorialId, selectedMarker.id)}
          onUnlinkTutorial={(tu) => unlinkTutorialFromMarker(tu, selectedMarker.id)}
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
          onSave={async (data) => {
            await api('/api/map/markers', 'POST', { ...data, map_id: activeMapId });
            setPendingMarker(null);
            await onRefresh();
          }}
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
              setDrawPoints([]);
              discardEditPointsSession();
            }
          }}
          onFinishZone={finishZone}
          onUndoPoint={undoPoint}
          onCancelDraw={cancelDraw}
          editZoneName={editZone?.name}
          editCanUndo={editCanUndo}
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
          <div className="map-view-canvas-slot">
            <div
              ref={containerRef}
              className="map-view-canvas"
              style={{
                cursor,
                touchAction,
                userSelect: 'none',
                WebkitUserSelect: 'none',
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
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: iw,
                    height: ih,
                    overflow: 'visible',
                    pointerEvents: 'none',
                  }}
                >
                  <g style={{ pointerEvents: 'all' }}>
                    {zones.map((z) => renderZonePoly(z))}
                    {renderDrawing()}
                    {renderEditPts()}
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
                  const openMarker = (e) => {
                    e.stopPropagation();
                    if (!moved.current) {
                      if (mode === 'view' && showMapMascot)
                        onMapMascotMarkerClick(m, setSelectedMarker);
                      else setSelectedMarker(m);
                    }
                  };
                  return (
                    <MapViewMarkerBubble
                      key={m.id}
                      marker={m}
                      ariaLabel={markerAriaLabel}
                      showLabels={showLabels}
                      isCoarsePointer={isCoarsePointer}
                      draggable={markerDraggable}
                      emojiFontSize={`${mapEmojiFontPx}px`}
                      labelFontSize={`${mapLabelFontPx}px`}
                      labelMarginTop={markerLabelMarginTop}
                      taskVisual={markerTaskVisual}
                      taskLabel={markerTaskLabel}
                      tutorialCount={markerTutorialCount}
                      tutorialLabel={markerTutorialLabel}
                      onOpen={openMarker}
                      onPointerDown={
                        markerDraggable
                          ? (e) => {
                              e.stopPropagation();
                              beginMarkerDrag(m.id, e.currentTarget, e.pointerId);
                            }
                          : undefined
                      }
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
