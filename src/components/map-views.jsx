import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

import { api } from '../services/api';

import {
  MARKER_EMOJIS,
  parseEmojiListSetting,
  detectLeadingMarkerEmoji,
  stripLeadingMarkerEmoji,
} from '../constants/emojis';

import { useHelp } from '../hooks/useHelp';
import { HelpPanel } from './HelpPanel';
import { Tooltip } from './Tooltip';

import { HELP_PANELS, HELP_TOOLTIPS, resolveRoleText } from '../constants/help';

import { resolveMapOverlayTypography } from '../utils/mapOverlayTypography';

import { taskEffectiveStatus } from '../utils/taskListHelpers.js';
import {
  taskVisualStatus,
  mergeTaskVisualStatus,
  TASK_VISUAL_LABEL,
} from '../utils/taskEnrollment.js';
import {
  clampEditZonePct,
  clampEditPts,
  cloneEditPts,
  editPtsSnapshotEqual,
  offsetDuplicateZonePoints,
} from '../utils/zoneEditGeometry.js';
import { orderedLivingBeingsForForm } from '../utils/livingBeings';
import { getContentText } from '../utils/content';
import { buildMapImageCandidates } from '../utils/mapImageCandidates';

import {
  taskLocationIds,
  tutorialLocationIds,
  isTaskDetachedFromLocation,
  taskLinkedTutorialRefs,
} from '../utils/mapLocationContext';
import { TutorialPreviewModal } from './TutorialPreviewModal';
import { fetchTutorialReadIds } from './TutorialReadAcknowledge';

import VisitMapMascotRenderer from './VisitMapMascotRenderer.jsx';
import useMapViewMascot from '../hooks/useMapViewMascot.js';
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
import { usePublicSettings } from '../contexts/PublicSettingsContext.jsx';
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

function MapView({ maps = [], onMapChange, isTeacher, student, canSelfAssignTasks = true, canEnrollOnTasks, onZoneUpdate, onRefresh, embedded = false, onLocationTasksFocus = null, onNavigateToTasksForLocation = null, onOpenPlantCatalogPreview = null, onForceLogout }) {
  const publicSettings = usePublicSettings();
  const { canParticipateContextComments = true } = useSession();
  const { zones = [], markers = [], tasks = [], tutorials = [], plants = [], activeMapId = '' } = useData();
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
  const configuredLocationEmojis = String(
    publicSettings?.ui?.map?.location_emojis
    || publicSettings?.map?.location_emojis
    || ''
  );
  const markerEmojis = useMemo(
    () => parseEmojiListSetting(configuredLocationEmojis, MARKER_EMOJIS),
    [configuredLocationEmojis]
  );
  const visitMascotAllowedIds = useMemo(() => {
    const raw = publicSettings?.visit?.mascot?.allowed_ids;
    if (Array.isArray(raw)) {
      return raw
        .map((id) => String(id || '').trim())
        .filter(Boolean);
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
  const mapMarkersOnActiveMap = useMemo(
    () => (markers || []).filter((m) => m.map_id === activeMapId),
    [markers, activeMapId],
  );
  const contextCommentsEnabled = publicSettings?.modules?.context_comments_enabled !== false;
  const emojiParsingList = useMemo(
    () => [...new Set([...markerEmojis, ...MARKER_EMOJIS])],
    [markerEmojis]
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
    imgSize,
    moved,
    applyTransform,
    commit,
    fitMap,
    toImagePct,
    beginMarkerDrag,
    isCoarsePointer,
    mapInteractionEnabled,
    toggleMapInteraction,
    prefersPageScroll,
    touchAction,
    animateZoomTowardScale,
  } = useMapGestures({ mapImageSrc, activeMapId, mode, onRefresh, embedded, mapLayoutOuterRef });
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
    preferredMascotId: student?.visit_mascot_catalog_id,
    allowedMascotIds: visitMascotAllowedIds,
    defaultMascotId: visitMascotDefaultId,
    mascotDialogSettings: publicSettings?.visit?.mascot?.dialog,
  });
  const { zoneTaskVisualById, markerTaskVisualById } = useMemo(() => {
    const zoneMap = new Map();
    const markerMap = new Map();
    for (const t of tasks || []) {
      if (isTaskDetachedFromLocation(t)) continue;
      const visual = taskVisualStatus(taskEffectiveStatus(t));
      if (!visual) continue;
      const { zoneIds, markerIds } = taskLocationIds(t);
      zoneIds.forEach((id) => {
        zoneMap.set(id, mergeTaskVisualStatus(zoneMap.get(id), visual));
      });
      markerIds.forEach((id) => {
        markerMap.set(id, mergeTaskVisualStatus(markerMap.get(id), visual));
      });
    }
    return { zoneTaskVisualById: zoneMap, markerTaskVisualById: markerMap };
  }, [tasks]);

  const { zoneTutorialCountById, markerTutorialCountById } = useMemo(() => {
    const zoneMap = new Map();
    const markerMap = new Map();
    const bumpZone = (zidRaw, delta = 1) => {
      const z = zones.find((zz) => String(zz.id) === String(zidRaw));
      if (!z || z.map_id !== activeMapId) return;
      const key = z.id;
      zoneMap.set(key, (zoneMap.get(key) || 0) + delta);
    };
    const bumpMarker = (midRaw, delta = 1) => {
      const mk = markers.find((mm) => String(mm.id) === String(midRaw));
      if (!mk || mk.map_id !== activeMapId) return;
      const key = mk.id;
      markerMap.set(key, (markerMap.get(key) || 0) + delta);
    };
    for (const tu of tutorials || []) {
      if (tu.is_active === false) continue;
      const { zoneIds, markerIds } = tutorialLocationIds(tu);
      for (const zid of zoneIds) bumpZone(zid, 1);
      for (const mid of markerIds) bumpMarker(mid, 1);
    }
    const pairSeen = new Set();
    for (const t of tasks || []) {
      if (isTaskDetachedFromLocation(t)) continue;
      const tuRefs = taskLinkedTutorialRefs(t, tutorials || []);
      if (!tuRefs.length) continue;
      const { zoneIds: tZones, markerIds: tMarkers } = taskLocationIds(t);
      for (const tu of tuRefs) {
        if (tu.is_active === false) continue;
        const direct = tutorialLocationIds(tu);
        const directZoneStr = new Set(direct.zoneIds.map((x) => String(x)));
        const directMarkerStr = new Set(direct.markerIds.map((x) => String(x)));
        const tid = String(tu.id);
        for (const zid of tZones) {
          if (directZoneStr.has(String(zid))) continue;
          const k = `z:${String(zid)}:tu:${tid}`;
          if (pairSeen.has(k)) continue;
          pairSeen.add(k);
          bumpZone(zid, 1);
        }
        for (const mid of tMarkers) {
          if (directMarkerStr.has(String(mid))) continue;
          const k = `m:${String(mid)}:tu:${tid}`;
          if (pairSeen.has(k)) continue;
          pairSeen.add(k);
          bumpMarker(mid, 1);
        }
      }
    }
    return { zoneTutorialCountById: zoneMap, markerTutorialCountById: markerMap };
  }, [tutorials, zones, markers, activeMapId, tasks]);

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

  const onMapClick = e => {
    if (moved.current) return;
    if (e.target.closest('.map-zone-hit') || e.target.closest('.map-bubble')) return;
    const p = toImagePct(e.clientX, e.clientY);
    if (!p) return;
    if (mode === 'view' && showMapMascot) {
      moveMapMascotTo(p.xp, p.yp);
      return;
    }
    if (mode === 'draw-zone') setDrawPoints(pts => [...pts, p]);
    else if (mode === 'add-marker') { setPendingMarker(p); setMode('view'); }
  };

  const finishZone = () => { if (drawPoints.length >= 3) { setPendingZone(drawPoints); setDrawPoints([]); setMode('view'); } };
  const undoPoint = () => setDrawPoints(pts => pts.slice(0, -1));
  const cancelDraw = () => { setDrawPoints([]); setMode('view'); };

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
    window.setTimeout(() => { recordEditHistoryAfterGesture(); }, 0);
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
    let pts; try { pts = z.points ? JSON.parse(z.points) : []; } catch (e) { pts = []; }
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
  const deleteMarker = async id => { await api(`/api/map/markers/${id}`, 'DELETE'); await onRefresh(); };
  const deleteZone = async id => { await api(`/api/zones/${id}`, 'DELETE'); await onRefresh(); };
  const duplicateZone = async (z) => {
    let pts;
    try { pts = z.points ? JSON.parse(z.points) : []; } catch (e) { pts = []; }
    if (!pts || pts.length < 3) throw new Error('Contour invalide');
    const shifted = offsetDuplicateZonePoints(pts);
    if (!shifted) throw new Error('Contour invalide');
    const living = orderedLivingBeingsForForm(z.living_beings_list || z.living_beings, z.current_plant);
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
    const living = orderedLivingBeingsForForm(m.living_beings_list || m.living_beings, m.plant_name);
    const baseLabel = String(m.label || 'Repère').replace(/\s*\(copie\)\s*$/i, '').trim();
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
  const mapSettings =
    publicSettings?.map && typeof publicSettings.map === 'object' ? publicSettings.map : null;
  const {
    mapEmojiLabelCenterGap,
    mapEmojiFontPx,
    mapLabelFontPx,
    markerLabelMarginTop,
  } = resolveMapOverlayTypography(mapSettings, inv);

  const toWorld = p => ({ cx: (p.xp / 100) * iw, cy: (p.yp / 100) * ih });

  const renderZonePoly = z => {
    let pts; try { pts = z.points ? JSON.parse(z.points) : null; } catch (e) { pts = null; }
    if (!pts || pts.length < 3) return null;
    const wp = pts.map(toWorld);
    const str = wp.map(p => `${p.cx},${p.cy}`).join(' ');
    const mx = wp.reduce((s, p) => s + p.cx, 0) / wp.length;
    const my = wp.reduce((s, p) => s + p.cy, 0) / wp.length;
    const zoneEmoji = detectLeadingMarkerEmoji(z.name || '', emojiParsingList);
    const zoneName = stripLeadingMarkerEmoji(z.name || '', emojiParsingList);
    const isEd = mode === 'edit-points' && editZone?.id === z.id;
    const zoneTaskVisual = zoneTaskVisualById.get(z.id);
    const zoneTutorialCount = zoneTutorialCountById.get(z.id) || 0;
    return (
      <g key={z.id} className={mode === 'view' ? 'map-zone-hit' : ''} style={{ cursor: mode === 'view' ? 'pointer' : 'default' }}
        onClick={e => {
          if (mode === 'view' && !moved.current) {
            e.stopPropagation();
            if (showMapMascot) onMapMascotZoneClick(z, setSelectedZone);
            else setSelectedZone(z);
          }
        }}>
        <polygon points={str} fill={isEd ? 'rgba(82,183,136,0.35)' : (z.color || '#86efac90')}
          stroke={isEd ? '#52b788' : 'rgba(26,71,49,0.5)'}
          strokeWidth={(isEd ? 2.5 : 1.5) * inv} strokeDasharray={z.special ? `${5 * inv},${3 * inv}` : 'none'} />
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
          <text x={mx} y={my + (zoneEmoji ? mapEmojiLabelCenterGap : 0)} textAnchor="middle" dominantBaseline="middle"
            fontSize={mapLabelFontPx} fontWeight="700" fontFamily="DM Sans,sans-serif"
            fill="#1a4731" stroke="rgba(255,255,255,0.8)" strokeWidth={3 * inv} paintOrder="stroke"
            style={{ pointerEvents: 'none', userSelect: 'none' }}>{zoneName || z.name}</text>
        )}
        {zoneTaskVisual && (
          <circle
            className={`map-task-status map-task-status--${zoneTaskVisual}`}
            cx={mx + (16 * inv)}
            cy={my - (12 * inv)}
            r={Math.max(5, 7 * inv)}
            style={{ pointerEvents: 'none' }}>
            <title>{TASK_VISUAL_LABEL[zoneTaskVisual]}</title>
          </circle>
        )}
        {zoneTutorialCount > 0 && (
          <circle
            className="map-tutorial-zone-dot"
            cx={mx - (16 * inv)}
            cy={my - (12 * inv)}
            r={Math.max(4, 6 * inv)}
            style={{ pointerEvents: 'none' }}>
            <title>{zoneTutorialCount === 1 ? '1 tutoriel lié' : `${zoneTutorialCount} tutoriels liés`}</title>
          </circle>
        )}
      </g>
    );
  };

  const endEditZoneTranslate = (e) => {
    scheduleRecordEditHistory();
    editZoneTranslateLastRef.current = null;
    if (e?.currentTarget?.hasPointerCapture?.(e.pointerId)) {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
    }
  };

  const renderEditPts = () => {
    if (mode !== 'edit-points' || !editPoints.length) return null;
    const wp = editPoints.map(toWorld);
    const str = wp.map(p => `${p.cx},${p.cy}`).join(' ');
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
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
          }}
          onPointerMove={(e) => {
            const last = editZoneTranslateLastRef.current;
            if (!last) return;
            const p2 = toImagePct(e.clientX, e.clientY);
            if (!p2) return;
            const dx = p2.xp - last.xp;
            const dy = p2.yp - last.yp;
            editZoneTranslateLastRef.current = p2;
            setEditPoints((pts) => clampEditPts(pts.map((pt) => ({ xp: pt.xp + dx, yp: pt.yp + dy }))));
            e.preventDefault();
          }}
          onPointerUp={endEditZoneTranslate}
          onPointerCancel={endEditZoneTranslate}
          onLostPointerCapture={() => { editZoneTranslateLastRef.current = null; }}
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
                try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
              }}
              onPointerMove={(e) => {
                if (draggingPtIdx === i) {
                  const p2 = toImagePct(e.clientX, e.clientY);
                  if (p2) setEditPoints((pts) => pts.map((pt, j) => (j === i ? clampEditZonePct(p2) : pt)));
                }
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                scheduleRecordEditHistory();
                setDraggingPtIdx(-1);
                if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
                  try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
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
    const str = wp.map(p => `${p.cx},${p.cy}`).join(' ');
    const rVis = Math.max(3.5, 5 * inv);
    const crossHalf = Math.max(7, 9 * inv);
    const crossStroke = Math.max(1, 1.1 * inv);
    const centerR = Math.max(1.2, 1.5 * inv);
    return (
      <g>
        {drawPoints.length > 1 && <polyline points={str} fill="none" stroke="#52b788" strokeWidth={2 * inv} strokeDasharray={`${6 * inv},${3 * inv}`} />}
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

  const cursor = mode === 'view' ? 'grab' : mode === 'draw-zone' ? 'crosshair' : mode === 'edit-points' ? 'default' : 'cell';
  const mobileInteractionsActive = mapInteractionEnabled || committed.s > 1.05;
  const canManageMarkerPositions = !!isTeacher;
  const {
    isHelpEnabled,
    showContextHints,
    pulseUnseenPanels,
    hasSeenSection,
    markSectionSeen,
    trackPanelOpen,
    trackPanelDismiss,
  } = useHelp({ publicSettings, isTeacher });
  const helpMap = HELP_PANELS.map;
  const helpHintPrefix = getContentText(publicSettings, 'help.hint_prefix', 'Astuce :');
  const helpPanelTitlePrefix = getContentText(publicSettings, 'help.panel_title_prefix', '💡');
  const helpPanelCloseCta = getContentText(publicSettings, 'help.panel_close_cta', 'Fermer');
  const helpPanelDismissCta = getContentText(publicSettings, 'help.panel_dismiss_cta', 'Ne plus afficher');
  const mapQuickTip = getContentText(
    publicSettings,
    'help.map_quick_tip',
    'Clique une zone ou un repère puis ouvre ? pour les actions guidées.'
  );
  const tooltipText = (entry) => resolveRoleText(entry, isTeacher);

  return (
    <div className={`map-view-root ${embedded ? 'map-view-root--embedded' : 'map-view-root--solo'}`}>
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
        <ZoneInfoModal zone={selectedZone} plants={plants} tasks={tasks} tutorials={tutorials} isTeacher={isTeacher} student={student} canSelfAssignTasks={canSelfAssignTasks} canEnrollOnTasks={canEnrollNewTasks} markerEmojis={markerEmojis} emojiParsingList={emojiParsingList} contextCommentsEnabled={contextCommentsEnabled} canParticipateContextComments={canParticipateContextComments}
          onClose={() => { clearMapMascotDetailAfterMove(); setSelectedZone(null); }}
          onUpdate={async (id, data) => { await onZoneUpdate(id, data); setSelectedZone(null); await onRefresh(); }}
          onDelete={async id => { await deleteZone(id); setSelectedZone(null); }}
          onDuplicate={isTeacher ? duplicateZone : undefined}
          onLinkTask={async (taskId) => linkTaskToZone(taskId, selectedZone.id)}
          onUnlinkTask={(t) => unlinkTaskFromZone(t, selectedZone.id)}
          onAssignTasks={assignTasksToStudent}
          onLinkTutorial={async (tutorialId) => linkTutorialToZone(tutorialId, selectedZone.id)}
          onUnlinkTutorial={(tu) => unlinkTutorialFromZone(tu, selectedZone.id)}
          onEditPoints={isTeacher ? z => startEditPoints(z) : null}
          onNavigateToTasksForLocation={onNavigateToTasksForLocation}
          onOpenTutorialPreview={setMapTutorialPreview}
          onOpenPlantCatalogPreview={onOpenPlantCatalogPreview ? (id) => { onOpenPlantCatalogPreview(id); setSelectedZone(null); } : null}
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
          onClose={() => { clearMapMascotDetailAfterMove(); setSelectedMarker(null); }}
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
          onOpenPlantCatalogPreview={onOpenPlantCatalogPreview ? (id) => { onOpenPlantCatalogPreview(id); setSelectedMarker(null); } : null}
          onRequestAdjustMarkerPosition={isTeacher
            ? () => {
              setMarkerPositionUnlocked(true);
              setToast('Déplacement des repères activé : fais glisser le repère sur la carte, puis reverrouille dans la barre d’outils si besoin.');
            }
            : undefined}
        />
      )}
      {pendingZone && (
        <ZoneDrawModal points_pct={pendingZone} plants={plants} markerEmojis={markerEmojis} emojiParsingList={emojiParsingList}
          onClose={() => setPendingZone(null)}
          onSave={async data => { await api('/api/zones', 'POST', { ...data, map_id: activeMapId }); setPendingZone(null); await onRefresh(); }} />
      )}
      {pendingMarker && (
        <MarkerModal marker={{ x_pct: pendingMarker.xp, y_pct: pendingMarker.yp, label: '', note: '', emoji: markerEmojis[0] || '🌱', plant_name: '', map_id: activeMapId }}
          plants={plants} isTeacher={isTeacher} markerEmojis={markerEmojis}
          onClose={() => setPendingMarker(null)}
          onSave={async data => { await api('/api/map/markers', 'POST', { ...data, map_id: activeMapId }); setPendingMarker(null); await onRefresh(); }}
          onDelete={() => setPendingMarker(null)} />
      )}

      <div className="map-view-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
        background: 'white', borderBottom: '1.5px solid var(--mint)', flexShrink: 0, minHeight: 50 }}>
        {maps.length > 1 && (
          maps.length > 4 ? (
            <select
              className="map-switch-select"
              value={activeMapId}
              onChange={(event) => onMapChange?.(event.target.value)}
              aria-label="Sélection de carte active"
            >
              {maps.map((mp) => (
                <option key={mp.id} value={mp.id}>
                  {mp.label}
                </option>
              ))}
            </select>
          ) : (
            <div className="map-switch-inline" style={{ display: 'flex', gap: 3, background: 'var(--parchment)', borderRadius: 10, padding: 3 }}>
              {maps.map((mp) => (
                <button key={mp.id}
                  style={{ background: activeMapId === mp.id ? 'var(--forest)' : 'transparent', color: activeMapId === mp.id ? 'white' : 'var(--soil)',
                    border: 'none', borderRadius: 8, padding: '7px 11px', cursor: 'pointer',
                    fontFamily: 'DM Sans,sans-serif', fontSize: '.82rem', fontWeight: 700, whiteSpace: 'nowrap' }}
                  onClick={() => onMapChange?.(mp.id)}>
                  {mp.label}
                </button>
              ))}
            </div>
          )
        )}

        <div style={{ display: 'flex', gap: 3, background: 'var(--parchment)', borderRadius: 10, padding: 3 }}>
          {[['view', '🖐️ Nav'],
            ...(isTeacher && mode !== 'edit-points' ? [
              ['draw-zone', `🖊️ Zone${mode === 'draw-zone' && drawPoints.length > 0 ? ` (${drawPoints.length})` : ''}`],
              ['add-marker', '📍 Repère'],
            ] : [])
          ].map(([m, label]) => (
            <button key={m}
              style={{ background: mode === m ? 'var(--forest)' : 'transparent', color: mode === m ? 'white' : 'var(--soil)',
                border: 'none', borderRadius: 8, padding: '7px 11px', cursor: 'pointer',
                fontFamily: 'DM Sans,sans-serif', fontSize: '.82rem', fontWeight: 600,
                transition: 'all .15s', whiteSpace: 'nowrap' }}
              onClick={() => { setMode(p => p === m && m !== 'view' ? 'view' : m); if (m === 'view') { setDrawPoints([]); discardEditPointsSession(); } }}>
              {label}
            </button>
          ))}
        </div>

        {isTeacher && mode === 'draw-zone' && drawPoints.length > 0 && (
          <div style={{ display: 'flex', gap: 4 }}>
            {drawPoints.length >= 3 && <button className="btn btn-secondary btn-sm" onClick={finishZone}>✅ Terminer</button>}
            <button className="btn btn-ghost btn-sm" onClick={undoPoint}>↩ Undo</button>
            <button className="btn btn-danger btn-sm" onClick={cancelDraw}>✕</button>
          </div>
        )}
        {mode === 'edit-points' && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: '.8rem', color: 'var(--leaf)', fontWeight: 700,
              background: '#f0fdf4', padding: '5px 10px', borderRadius: 8, border: '1px solid var(--mint)' }}>
              ✏️ {editZone?.name}
            </span>
            <button type="button" className="btn btn-ghost btn-sm" disabled={!editCanUndo} onClick={undoEditPoints} title="Annuler la dernière modification (Ctrl+Z ou Cmd+Z)">↩ Annuler</button>
            <button className="btn btn-primary btn-sm" onClick={saveEditPoints}>💾 Sauver</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setMode('view'); discardEditPointsSession(); }}>✕</button>
          </div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
          {canManageMarkerPositions && (
            <button
              aria-label={markerPositionUnlocked ? 'Verrouiller la position des repères' : 'Déverrouiller la position des repères'}
              onClick={toggleMarkerPositionLock}
              style={{ background: markerPositionUnlocked ? '#ecfdf3' : 'transparent', border: '1.5px solid var(--mint)',
                color: markerPositionUnlocked ? '#166534' : 'var(--forest)', borderRadius: 8, padding: '6px 10px',
                cursor: 'pointer', fontSize: '.78rem', fontWeight: 700, minHeight: 36 }}>
              {markerPositionUnlocked ? '🔓 Repères' : '🔒 Repères'}
            </button>
          )}
          {isCoarsePointer && mode === 'view' && (
            <Tooltip text={tooltipText(HELP_TOOLTIPS.map.toggleGestures)}>
              <button
                className={`map-gesture-toggle ${mobileInteractionsActive ? 'is-on' : ''}`}
                onClick={toggleMapInteraction}
                aria-label={mobileInteractionsActive ? 'Désactiver les gestes carte' : 'Activer les gestes carte'}>
                {mobileInteractionsActive ? '🔓 Gestes' : '🔒 Gestes'}
              </button>
            </Tooltip>
          )}
          <Tooltip text={tooltipText(HELP_TOOLTIPS.map.toggleLabels)}>
            <button
              aria-label={showLabels ? 'Masquer les noms' : 'Afficher les noms'}
              onClick={() => setShowLabels(l => !l)}
              style={{ background: showLabels ? 'var(--mint)' : 'transparent', border: '1.5px solid var(--mint)',
                color: 'var(--forest)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: '.9rem' }}
            >
              🏷️
            </button>
          </Tooltip>
          <div style={{ display: 'flex', background: 'var(--parchment)', borderRadius: 10, padding: 3, gap: 2 }}>
            {[
              ['＋', 1.28, HELP_TOOLTIPS.map.zoomIn, 'Zoomer la carte'],
              ['－', 0.78, HELP_TOOLTIPS.map.zoomOut, 'Dézoomer la carte'],
              ['⊡', 0, HELP_TOOLTIPS.map.zoomReset, 'Recentrer la carte'],
            ].map(([label, factor, helpEntry, ariaLabel]) => (
              <Tooltip key={label} text={tooltipText(helpEntry)}>
                <button onClick={() => {
                  if (factor === 0) { fitMap(); return; }
                  const c = containerRef.current; if (!c) return;
                  const mx = c.clientWidth / 2;
                  const my = c.clientHeight / 2;
                  const ns = factor > 1 ? Math.min(tx.current.s * factor, 6) : Math.max(tx.current.s * factor, 0.15);
                  animateZoomTowardScale(ns, mx, my);
                }}
                aria-label={ariaLabel}
                style={{ background: 'transparent', border: 'none', color: 'var(--soil)',
                  padding: '6px 10px', cursor: 'pointer', fontSize: '1rem', borderRadius: 7 }}>{label}</button>
              </Tooltip>
            ))}
          </div>
          {isHelpEnabled && (
            <HelpPanel
              sectionId="map"
              title={helpMap.title}
              entries={helpMap.items}
              isTeacher={isTeacher}
              isPulsing={pulseUnseenPanels && !hasSeenSection('map')}
              panelTitlePrefix={helpPanelTitlePrefix}
              closeButtonText={helpPanelCloseCta}
              dismissButtonText={helpPanelDismissCta}
              onMarkSeen={markSectionSeen}
              onOpen={trackPanelOpen}
              onDismiss={trackPanelDismiss}
            />
          )}
        </div>
      </div>
      {isHelpEnabled && showContextHints && mapQuickTip ? (
        <p className="section-sub" style={{ margin: '8px 12px 0' }}>
          <strong>{helpHintPrefix}</strong> {mapQuickTip}
        </p>
      ) : null}

      <div
        ref={mapLayoutOuterRef}
        className="map-view-canvas-outer"
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

          <div ref={worldRef}
            style={{ position: 'absolute', left: 0, top: 0, width: iw, height: ih,
              transformOrigin: '0 0', willChange: 'transform' }}>

          <img ref={imgRef} src={mapImageSrc} draggable={false} alt={`Plan ${activeMap?.label || 'du jardin'}`}
            fetchPriority="high" decoding="async"
            onError={() => setMapImageIdx((idx) => (
              idx < mapImageCandidates.length - 1 ? idx + 1 : idx
            ))}
            style={{ position: 'absolute', left: 0, top: 0, width: iw, height: ih,
              userSelect: 'none', pointerEvents: 'none',
              boxShadow: '0 4px 24px rgba(0,0,0,.18)' }} />

          <svg style={{ position: 'absolute', left: 0, top: 0, width: iw, height: ih,
            overflow: 'visible', pointerEvents: 'none' }}>
            <g style={{ pointerEvents: 'all' }}>
              {zones.map(z => renderZonePoly(z))}
              {renderDrawing()}
              {renderEditPts()}
            </g>
          </svg>

          {showMapMascot ? (
            <div
              className={`${mapMascotClassName}${embedded ? ' map-view-forest-mascot--embedded' : ''}`}
              style={{ left: `${mapMascotRenderPct.xp}%`, top: `${mapMascotRenderPct.yp}%` }}
              aria-hidden="true"
            >
              <div
                className="visit-map-mascot-inner"
                style={{
                  transform: `translate(-50%, -100%) scale(${mapMascotFitScale}) scaleX(${mapMascotFaceRight ? 1 : -1})`,
                  '--visit-mascot-dialog-x': mapMascotFaceRight ? 1 : -1,
                }}
              >
                <VisitMapMascotRenderer
                  mascotState={mapMascotAnimationState}
                  mascotId={mapMascotId}
                />
                {mapMascotDialogVisible && mapMascotDialog ? (
                  <div className="visit-map-mascot-dialog" role="status" aria-live="polite">
                    {mapMascotDialog}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {markers.map((m) => {
            const markerTaskVisual = markerTaskVisualById.get(m.id);
            const markerTaskLabel = markerTaskVisual ? TASK_VISUAL_LABEL[markerTaskVisual] : '';
            const markerTutorialCount = markerTutorialCountById.get(m.id) || 0;
            const markerTutorialLabel = markerTutorialCount === 0
              ? ''
              : (markerTutorialCount === 1 ? '1 tutoriel lié' : `${markerTutorialCount} tutoriels liés`);
            const markerAriaLabel = [m.label || 'Repère', markerTaskLabel, markerTutorialLabel].filter(Boolean).join(' — ');
            const markerEmojiSize = `${mapEmojiFontPx}px`;
            const markerLabelFontSize = `${mapLabelFontPx}px`;
            const markerStatusDotSize = isCoarsePointer ? 17 : 12;
            const markerStatusDotBorder = isCoarsePointer ? 2 : 1.5;
            const markerStatusDotOffset = isCoarsePointer ? -2 : -1;
            const openMarker = (e) => {
              e.stopPropagation();
              if (!moved.current) {
                if (mode === 'view' && showMapMascot) onMapMascotMarkerClick(m, setSelectedMarker);
                else setSelectedMarker(m);
              }
            };
            return (
            <button key={m.id} className="map-bubble" type="button"
              style={{ position: 'absolute', left: m.x_pct + '%', top: m.y_pct + '%',
                transform: 'translate(-50%,-50%)', zIndex: 10, cursor: isTeacher && markerPositionUnlocked ? 'grab' : 'pointer',
                border: 'none', background: 'transparent',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: isCoarsePointer ? 'center' : 'flex-start',
                minWidth: isCoarsePointer ? 48 : undefined,
                minHeight: isCoarsePointer ? 48 : undefined,
                padding: isCoarsePointer ? 6 : 0,
                boxSizing: 'border-box' }}
              aria-label={markerAriaLabel}
              title={markerAriaLabel}
              onClick={openMarker}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openMarker(e);
                }
              }}
              onPointerDown={isTeacher && markerPositionUnlocked ? e => {
                e.stopPropagation();
                beginMarkerDrag(m.id, e.currentTarget, e.pointerId);
              } : undefined}
              onPointerUp={e => e.stopPropagation()}>
              <div className="map-bubble-pin" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                background: 'transparent', border: 'none', borderRadius: 0,
                fontSize: markerEmojiSize,
                lineHeight: 1,
                minWidth: m.emoji ? undefined : 10,
                minHeight: m.emoji ? undefined : 10,
              }}>
                {m.emoji ? (
                  m.emoji
                ) : (
                  <span
                    className="map-marker-no-emoji"
                    aria-hidden
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#1a4731',
                      opacity: 0.55,
                    }}
                  />
                )}
                {markerTaskVisual && (
                  <span
                    className={`map-task-status-dot map-task-status-dot--${markerTaskVisual}`}
                    role="img"
                    aria-label={markerTaskLabel}
                    title={markerTaskLabel}
                    style={{
                      width: markerStatusDotSize,
                      height: markerStatusDotSize,
                      borderWidth: markerStatusDotBorder,
                      top: markerStatusDotOffset,
                      right: markerStatusDotOffset,
                    }}
                  />
                )}
                {markerTutorialCount > 0 && (
                  <span
                    className="map-tutorial-marker-dot"
                    role="img"
                    aria-label={markerTutorialLabel}
                    title={markerTutorialLabel}
                    style={{
                      width: Math.max(8, markerStatusDotSize - 3),
                      height: Math.max(8, markerStatusDotSize - 3),
                      borderWidth: markerStatusDotBorder,
                      bottom: markerStatusDotOffset,
                      left: markerStatusDotOffset,
                      right: 'auto',
                      top: 'auto',
                    }}
                  />
                )}
              </div>
              {showLabels && (
                <div style={{
                  flexShrink: 0,
                  marginTop: markerLabelMarginTop,
                  background: 'transparent', color: '#1a4731', borderRadius: 0,
                  padding: 0, fontSize: markerLabelFontSize, fontWeight: 700,
                  fontFamily: 'DM Sans,sans-serif',
                  lineHeight: 1,
                  whiteSpace: 'nowrap', maxWidth: isCoarsePointer ? 128 : 96,
                  overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none',
                  textAlign: 'center',
                  textShadow: '0 0 2px rgba(255,255,255,.95), 0 0 6px rgba(255,255,255,.85), 0 1px 0 rgba(255,255,255,.92)' }}>
                  {m.label}
                </div>
              )}
            </button>
            );
          })}
          </div>

          {mode !== 'view' && mode !== 'edit-points' && (
            <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(26,71,49,.9)', color: 'white', borderRadius: 22,
              padding: '9px 20px', fontSize: '.82rem', fontWeight: 600,
              pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 20 }}>
              {mode === 'draw-zone' && drawPoints.length < 3 && '🖊️ Touche la carte (min. 3 pts)'}
              {mode === 'draw-zone' && drawPoints.length >= 3 && `✅ ${drawPoints.length} pts — Terminer`}
              {mode === 'add-marker' && '📍 Touche la carte pour placer'}
            </div>
          )}
          {mode === 'edit-points' && (
            <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(82,183,136,.92)', color: 'white', borderRadius: 22,
              padding: '9px 20px', fontSize: '.82rem', fontWeight: 600,
              pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 20 }}>
              ✋ Glisse un point ou l&apos;intérieur · limites carte · Ctrl+Z annule
            </div>
          )}
          {prefersPageScroll && (
            <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(26,71,49,.9)', color: 'white', borderRadius: 18,
              padding: '6px 12px', fontSize: '.72rem', fontWeight: 600,
              pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 20 }}>
              📱 1 doigt: page · 2 doigts: zoom carte
            </div>
          )}
          {isCoarsePointer && mode === 'view' && !prefersPageScroll && (
            <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(26,71,49,.82)', color: 'white', borderRadius: 18,
              padding: '6px 12px', fontSize: '.72rem', fontWeight: 600,
              pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 20 }}>
              ✋ Gestes carte actifs
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

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
