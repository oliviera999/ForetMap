import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api, AccountDeletedError, isLikelyNetworkTransportFailure } from '../services/api';
import {
  MARKER_EMOJIS,
  parseEmojiListSetting,
  detectLeadingMarkerEmoji,
  stripLeadingMarkerEmoji,
} from '../constants/emojis';
import { getRoleTerms } from '../utils/n3-terminology';
import { useHelp } from '../hooks/useHelp';
import { HelpPanel } from './HelpPanel';
import { HELP_PANELS } from '../constants/help';
import { getContentText } from '../utils/content';
import { resolveMapOverlayTypography } from '../utils/mapOverlayTypography';
import { fetchTutorialReadIds } from './TutorialReadAcknowledge';
import {
  TutorialPreviewModal,
  tutorialPreviewPayload,
  tutorialPreviewCanEmbed,
} from './TutorialPreviewModal';
import { useOverlayHistoryBack } from '../hooks/useOverlayHistoryBack';
import { computeMapImageContainRect, resolveMapStageClientBox } from '../utils/mapImageFit';
import { buildMapImageCandidates } from '../utils/mapImageCandidates';
import {
  parseVisitZonePoints as parsePctPoints,
  visitZoneCentroidPct,
} from '../utils/visitMapGeometry.js';
import { VisitDetailPanel } from './visit/VisitDetailPanel.jsx';
import { VisitTutorialsSection } from './visit/VisitTutorialsSection.jsx';
import { VisitMapChrome } from './visit/VisitMapChrome.jsx';
import { VisitProfToolsPanel } from './visit/VisitProfToolsPanel.jsx';
import { VisitGuestMascotOnboarding } from './visit/VisitGuestMascotOnboarding.jsx';
import { VisitMapZoomControls } from './visit/VisitMapZoomControls.jsx';
import { computeVisitMascotStartPct } from '../utils/visitMascotPlacement.js';
import {
  shouldShowVisitMapMascot as computeShowVisitMapMascot,
  getVisitMascotVisibilityReason,
} from '../utils/visitMascotVisibility.js';
import {
  applyVisitSeenQueueToSet,
  enqueueVisitSeenAction,
  flushVisitSeenQueue,
  isBrowserOnline,
  loadVisitSeenQueue,
  replaceQueuedVisitSeenAction,
  safeVisitProgressPayload,
} from '../utils/visitProgressClient.js';
import { wheelZoomScaleFactor } from '../utils/mapWheelZoom';
import { clampVisitMapTransform, zoomVisitTransformToScale } from '../utils/visitMapTransform.js';
import { pointToContainedRectPct } from '../shared/pct-map/pctMapPointer.js';
import { useMapFullscreen } from '../shared/hooks/useMapFullscreen.js';
import { MapFullscreenShell } from '../shared/components/MapFullscreenShell.jsx';
import { VisitMapMarkerButton } from './VisitMapMarkerButton.jsx';
import { VisitDrawZonePreview } from './VisitDrawZonePreview.jsx';
import { VisitMapMascot } from './VisitMapMascot.jsx';
import { usePublicSettings } from '../contexts/PublicSettingsContext.jsx';
import { useSession } from '../contexts/SessionContext.jsx';
import { useData } from '../contexts/DataContext.jsx';

import { buildVisitMascotCatalogExtrasFromContent } from '../utils/visitMascotPackExtras.js';
import { resolveMascotDialogLine } from '../utils/visitMascotDialogApply.js';
import { VISIT_MASCOT_STATE } from '../utils/visitMascotState.js';
import {
  loadVisitMascotPositionPct,
  saveVisitMascotPositionPct,
} from '../utils/visitMascotPositionPersistence.js';
import { itemSeenKey } from '../utils/visitMediaGallery.js';
import {
  parseVisitMascotAllowedIds,
  computeVisitCartographyProgress,
  buildVisitNetworkStatusLabel,
} from '../utils/visitViewStatus.js';
import {
  visitZoneSvgTextUniformYTransform,
  clampVisitMascotPctForViewport,
} from '../utils/visitMascotGeometry.js';
import useVisitMascotStateMachine from '../hooks/useVisitMascotStateMachine.js';
import { Lightbox } from './map-views';
import { safeLocalStorageGetItem, safeLocalStorageSetItem } from '../utils/browserStorage.js';

const VISIT_MAP_MASCOT_MOVE_MS = 560;
const VISIT_MAP_MASCOT_HAPPY_MS = 1800;
const VISIT_MASCOT_DIALOG_MS = 2600;
const VISIT_MASCOT_DIALOG_MOVE_COOLDOWN_MS = 4200;

function pointToPct(event, stageEl, transform = { x: 0, y: 0, s: 1 }, fit = null) {
  return pointToContainedRectPct(event, stageEl, transform, fit, { clamp: true, decimals: 2 });
}

function VisitViewImpl({
  student = null,
  isTeacher = false,
  onForceLogout,
  initialMapId = 'foret',
  availableTutorials = [],
  onBackToAuth,
  /** Prof : ouvre l’onglet dédié « Packs mascotte » dans l’app principale. */
  onOpenMascotPackStudioTab,
  /** Carte source : mêmes IDs que la visite — pour biodiversité / tutos comme en mode carte. */
  mapZones = [],
  mapMarkers = [],
  /** Catalogue tutoriels (liens lieu + missions), distinct de la sélection `visit_tutorials`. */
  catalogTutorials = [],
  onOpenPlantCatalogPreview = null,
  profileVisitMascotId = null,
  requireGuestMascotChoice = false,
  onGuestMascotChoiceDone = null,
}) {
  const publicSettings = usePublicSettings();
  const { isN3Affiliated = false, canParticipateContextComments = true } = useSession();
  const { tasks = [], plants = [] } = useData();
  const contextCommentsEnabled = publicSettings?.modules?.context_comments_enabled !== false;
  const configuredLocationEmojis = String(
    publicSettings?.ui?.map?.location_emojis || publicSettings?.map?.location_emojis || '',
  );
  const markerEmojis = useMemo(
    () => parseEmojiListSetting(configuredLocationEmojis, MARKER_EMOJIS),
    [configuredLocationEmojis],
  );
  const roleTerms = getRoleTerms(isN3Affiliated);
  const visitMascotAllowedIds = useMemo(
    () => parseVisitMascotAllowedIds(publicSettings?.visit?.mascot?.allowed_ids),
    [publicSettings?.visit?.mascot?.allowed_ids],
  );
  const visitMascotDefaultId =
    String(publicSettings?.visit?.mascot?.default_id || '').trim() || 'renard2-cut-spritesheet';
  const visitTitle = getContentText(publicSettings, 'visit.title', '🧭 Visite de la carte');
  const helpHintPrefix = getContentText(publicSettings, 'help.hint_prefix', 'Astuce :');
  const helpPanelTitlePrefix = getContentText(publicSettings, 'help.panel_title_prefix', '💡');
  const helpPanelCloseCta = getContentText(publicSettings, 'help.panel_close_cta', 'Fermer');
  const helpPanelDismissCta = getContentText(
    publicSettings,
    'help.panel_dismiss_cta',
    'Ne plus afficher',
  );
  const visitQuickTip = getContentText(
    publicSettings,
    'help.visit_quick_tip',
    'Coche ce que tu vois déjà pour suivre ta progression sur la carte.',
  );
  const visitEmptySelection = getContentText(
    publicSettings,
    'visit.empty_selection',
    'Sélectionne une zone ou un repère pour afficher les détails.',
  );
  const visitTutorialsTitle = getContentText(
    publicSettings,
    'visit.tutorials_title',
    '📘 Tutoriels de la visite',
  );
  const visitTutorialsEmpty = getContentText(
    publicSettings,
    'visit.tutorials_empty',
    'Aucun tutoriel sélectionné pour le moment.',
  );
  const [mapId, setMapId] = useState(() => String(initialMapId || '').trim());
  /** Dernière carte affichée : évite d’appliquer une réponse `/api/visit/content` obsolète après changement de `map_id`. */
  const visitLoadMapIdLiveRef = useRef(mapId);
  visitLoadMapIdLiveRef.current = mapId;
  const [maps, setMaps] = useState([]);
  const [content, setContent] = useState({
    zones: [],
    markers: [],
    tutorials: [],
    mascot_packs: [],
  });
  /** Premier tutoriel « visite » ouvrable en modale (ordre API / sélection prof). */
  const visitPresentationTutorial = useMemo(() => {
    const list = content.tutorials || [];
    for (const t of list) {
      if (tutorialPreviewCanEmbed(t)) return t;
    }
    return null;
  }, [content.tutorials]);
  const [selected, setSelected] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [seen, setSeen] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [savingSeen, setSavingSeen] = useState(false);
  const [isOnline, setIsOnline] = useState(() => isBrowserOnline());
  const [pendingSyncCount, setPendingSyncCount] = useState(() => loadVisitSeenQueue().length);
  /** idle | pending | syncing | synced | error */
  const [syncStatus, setSyncStatus] = useState(() =>
    loadVisitSeenQueue().length > 0 ? 'pending' : 'idle',
  );
  const visitSeenFlushInFlightRef = useRef(false);
  const [tutorialReadIds, setTutorialReadIds] = useState(() => new Set());
  const [visitTutorialPreview, setVisitTutorialPreview] = useState(null);
  const [visitMediaLightbox, setVisitMediaLightbox] = useState(null);
  const [mode, setMode] = useState('view');
  const [drawPoints, setDrawPoints] = useState([]);
  const [creating, setCreating] = useState(false);
  const stageRef = useRef(null);
  const dragRef = useRef({
    active: false,
    moved: false,
    pointerId: null,
    startClientX: 0,
    startClientY: 0,
    baseX: 0,
    baseY: 0,
  });
  const skipClickRef = useRef(false);
  const pinchRef = useRef({
    active: false,
    dist: 0,
    startScale: 1,
    startX: 0,
    startY: 0,
    midX: 0,
    midY: 0,
  });
  const [mapTransform, setMapTransform] = useState({ x: 0, y: 0, s: 1 });
  const mapTransformRef = useRef(mapTransform);
  mapTransformRef.current = mapTransform;
  const visitZoomAnimRafRef = useRef(null);
  const [visitMapMascotPct, setVisitMapMascotPct] = useState({ xp: 50, yp: 50 });
  const [visitMapMascotFaceRight, setVisitMapMascotFaceRight] = useState(true);
  const [visitMapMascotWalking, setVisitMapMascotWalking] = useState(false);
  const [visitMapMascotHappy, setVisitMapMascotHappy] = useState(false);
  const [visitMascotDialog, setVisitMascotDialog] = useState('');
  const [visitMascotDialogVisible, setVisitMascotDialogVisible] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const visitMapMascotPctRef = useRef({ xp: 50, yp: 50 });
  const visitMapMascotMoveTimeoutRef = useRef(null);
  /** Ouverture du panneau lieu après la fin du déplacement mascotte (mode vue). */
  const visitDetailPanelAfterMoveTimeoutRef = useRef(null);
  const visitMapMascotHappyTimeoutRef = useRef(null);
  const visitMascotDialogTimeoutRef = useRef(null);
  const visitMascotMoveDialogCooldownUntilRef = useRef(0);
  const visitMascotStartPlacedForMapRef = useRef(null);
  const {
    isHelpEnabled,
    showContextHints,
    pulseUnseenPanels,
    hasSeenSection,
    markSectionSeen,
    trackPanelOpen,
    trackPanelDismiss,
  } = useHelp({ publicSettings, isTeacher });
  const isGuestPublicVisit = !student && typeof onBackToAuth === 'function';
  const closeVisitSelection = useCallback(() => {
    if (visitDetailPanelAfterMoveTimeoutRef.current) {
      clearTimeout(visitDetailPanelAfterMoveTimeoutRef.current);
      visitDetailPanelAfterMoveTimeoutRef.current = null;
    }
    setSelected(null);
    setSelectedType(null);
  }, []);
  useOverlayHistoryBack(isGuestPublicVisit && !!selected, closeVisitSelection);
  useOverlayHistoryBack(!!visitMediaLightbox, () => setVisitMediaLightbox(null));
  const visitMascotCatalogExtras = useMemo(
    () => buildVisitMascotCatalogExtrasFromContent(content.mascot_packs),
    [content.mascot_packs],
  );

  const {
    visitMascotId,
    visitMascotOptions,
    visitMascotAnimationState,
    onChangeVisitMascotId,
    triggerMascotTransientState,
    resetMascotTransientState,
  } = useVisitMascotStateMachine({
    walking: visitMapMascotWalking,
    happy: visitMapMascotHappy,
    extraCatalogEntries: visitMascotCatalogExtras,
    preferredMascotId: profileVisitMascotId,
    allowedMascotIds: visitMascotAllowedIds,
    defaultMascotId: visitMascotDefaultId,
  });

  const VISIT_IMMERSION_LS_KEY = 'foretmap_visit_immersion';
  const VISIT_TEACHER_PREVIEW_LS_KEY = 'foretmap_visit_teacher_preview_student';
  const VISIT_COMFORTABLE_READING_LS_KEY = 'foretmap_visit_comfortable_reading';

  const {
    mapFullscreen: visitImmersion,
    setMapFullscreen: setVisitImmersion,
    toggleMapFullscreen: toggleVisitImmersion,
  } = useMapFullscreen({
    persistKey: VISIT_IMMERSION_LS_KEY,
    escapeBlocked: Boolean(selected || visitMediaLightbox || visitTutorialPreview),
  });
  const [teacherPreviewAsStudent, setTeacherPreviewAsStudent] = useState(() => {
    if (!isTeacher) return false;
    return safeLocalStorageGetItem(VISIT_TEACHER_PREVIEW_LS_KEY, null) === '1';
  });
  const [comfortableReading, setComfortableReading] = useState(() => {
    return safeLocalStorageGetItem(VISIT_COMFORTABLE_READING_LS_KEY, null) === '1';
  });

  useEffect(() => {
    if (!isTeacher) setTeacherPreviewAsStudent(false);
  }, [isTeacher]);

  useEffect(() => {
    if (!isTeacher) return;
    safeLocalStorageSetItem(VISIT_TEACHER_PREVIEW_LS_KEY, teacherPreviewAsStudent ? '1' : '0');
  }, [isTeacher, teacherPreviewAsStudent]);

  useEffect(() => {
    safeLocalStorageSetItem(VISIT_COMFORTABLE_READING_LS_KEY, comfortableReading ? '1' : '0');
  }, [comfortableReading]);

  /** Tutoriels sous la carte : réservés au prof en édition (pas invité, pas élève, pas aperçu élève). */
  const showVisitMapTutorialsSection = isTeacher && !teacherPreviewAsStudent;

  /** Zones affichées sur le plan (polygone valide) + repères : aligné sur ce que l’utilisateur peut parcourir sur la carte courante. */
  const visitCartographyProgress = useMemo(
    () => computeVisitCartographyProgress(content.zones, content.markers, seen),
    [content.zones, content.markers, seen],
  );

  /** Bandeau carte : ouverture du premier tutoriel « présentation » (tous les profils en navigation). */
  const showVisitPresentationButton = mode === 'view' && !!visitPresentationTutorial;
  /** Incitation visuelle tant qu’aucune zone ni repère n’a été marqué·e comme vu·e sur la carte courante. */
  const visitPresentationInvitePulse =
    showVisitPresentationButton &&
    visitCartographyProgress.total > 0 &&
    visitCartographyProgress.seenCount === 0 &&
    !prefersReducedMotion;

  const visitNetworkStatusLabel = useMemo(
    () => buildVisitNetworkStatusLabel(isOnline, syncStatus, pendingSyncCount),
    [isOnline, syncStatus, pendingSyncCount],
  );

  /** Mascotte : zones/repères visibles, total parcourable, ou tutoriels du plan (évite plan « vide » côté API alors que la visite est animée). */
  const showVisitMapMascot = computeShowVisitMapMascot(
    mode,
    visitCartographyProgress.total,
    content.zones,
    content.markers,
    (content.tutorials || []).length,
  );
  const visitMascotVisibilityReason = getVisitMascotVisibilityReason(
    mode,
    visitCartographyProgress.total,
    content.zones,
    content.markers,
    (content.tutorials || []).length,
  );

  useEffect(() => {
    const next = String(initialMapId || '').trim();
    if (!next) return;
    setMapId((prev) => (prev === next ? prev : next));
  }, [initialMapId]);

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
  }, [content.tutorials]);

  const currentMap = useMemo(() => maps.find((m) => m.id === mapId), [maps, mapId]);
  const visitMapImageCandidates = useMemo(() => buildMapImageCandidates(currentMap), [currentMap]);
  const [visitMapImageIdx, setVisitMapImageIdx] = useState(0);
  useEffect(() => {
    setVisitMapImageIdx(0);
  }, [mapId, currentMap?.map_image_url]);
  const visitMapImageSrc =
    visitMapImageCandidates[Math.min(visitMapImageIdx, visitMapImageCandidates.length - 1)];
  const imgRef = useRef(null);
  const [visitImgNatural, setVisitImgNatural] = useState({ w: 0, h: 0 });
  const [visitMapFit, setVisitMapFit] = useState({ offsetX: 0, offsetY: 0, width: 0, height: 0 });
  const visitImmersionRef = useRef(visitImmersion);
  visitImmersionRef.current = visitImmersion;

  const applyVisitMapFit = useCallback(
    (stageEl, { fullscreen = visitImmersionRef.current } = {}) => {
      if (!stageEl) return;
      const { cw, ch } = resolveMapStageClientBox(stageEl, { fullscreen });
      setVisitMapFit(
        computeMapImageContainRect(visitImgNatural.w, visitImgNatural.h, cw, ch),
      );
    },
    [visitImgNatural.w, visitImgNatural.h],
  );
  const visitMapFitRef = useRef(visitMapFit);
  visitMapFitRef.current = visitMapFit;
  const visitMapImageReady = visitImgNatural.w > 0 && visitImgNatural.h > 0;
  const canPanAndZoom = mode === 'view';

  /** Tailles emoji / libellé zone en unités SVG (viewBox 0–100), alignées sur `resolveMapOverlayTypography` + largeur calque carte. */
  const visitZoneSvgTypography = useMemo(() => {
    const mapSettings =
      publicSettings?.map && typeof publicSettings.map === 'object' ? publicSettings.map : null;
    const fw = visitMapFit.width > 0 ? visitMapFit.width : 360;
    const uPerPx = 100 / Math.max(1, fw);
    const inv = 1 / Math.max(mapTransform.s, 0.12);
    const t = resolveMapOverlayTypography(mapSettings, inv);
    return {
      emojiU: t.mapEmojiFontPx * uPerPx,
      labelU: t.mapLabelFontPx * uPerPx,
      gapU: t.mapEmojiLabelCenterGap * uPerPx,
      strokeU: Math.max(0.06, 3 * inv * uPerPx),
    };
  }, [publicSettings, visitMapFit.width, mapTransform.s]);

  const clampTransform = useCallback((next, rectLike = null) => {
    const stage = stageRef.current;
    const rect = rectLike || (stage ? stage.getBoundingClientRect() : null);
    return clampVisitMapTransform(next, rect);
  }, []);

  const cancelVisitZoomAnim = useCallback(() => {
    if (visitZoomAnimRafRef.current != null) {
      cancelAnimationFrame(visitZoomAnimRafRef.current);
      visitZoomAnimRafRef.current = null;
    }
  }, []);

  const zoomAroundClientPoint = useCallback((clientX, clientY, factor) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    setMapTransform((prev) =>
      zoomVisitTransformToScale(
        prev,
        clientX - rect.left,
        clientY - rect.top,
        prev.s * factor,
        rect,
      ),
    );
  }, []);

  /** Boutons +/− : interpolation courte ; molette : `wheelZoomScaleFactor`. */
  const zoomFromCenterAnimated = useCallback(
    (factor) => {
      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      cancelVisitZoomAnim();
      const px = rect.width / 2;
      const py = rect.height / 2;
      const start = { ...mapTransformRef.current };
      const target = zoomVisitTransformToScale(start, px, py, start.s * factor, rect);

      if (prefersReducedMotion) {
        setMapTransform(target);
        return;
      }

      const duration = 200;
      const fromS = start.s;
      const toS = target.s;
      const t0 = performance.now();
      const easeOutCubic = (u) => 1 - (1 - u) ** 3;
      const step = (now) => {
        const t = Math.min(1, (now - t0) / duration);
        const u = easeOutCubic(t);
        const curS = fromS + (toS - fromS) * u;
        setMapTransform(zoomVisitTransformToScale(start, px, py, curS, rect));
        if (t < 1) {
          visitZoomAnimRafRef.current = requestAnimationFrame(step);
        } else {
          visitZoomAnimRafRef.current = null;
          setMapTransform(target);
        }
      };
      visitZoomAnimRafRef.current = requestAnimationFrame(step);
    },
    [prefersReducedMotion, cancelVisitZoomAnim],
  );

  const resetMapTransform = useCallback(() => {
    cancelVisitZoomAnim();
    setMapTransform({ x: 0, y: 0, s: 1 });
  }, [cancelVisitZoomAnim]);

  const consumeSkipClick = useCallback(() => {
    if (!skipClickRef.current) return false;
    skipClickRef.current = false;
    return true;
  }, []);

  const loadData = useCallback(async () => {
    const requestedMapId = String(mapId).trim();
    const visitContentPath = requestedMapId
      ? `/api/visit/content?map_id=${encodeURIComponent(requestedMapId)}`
      : '/api/visit/content';
    setLoading(true);
    try {
      const [mapsRes, visitRes] = await Promise.all([
        api('/api/maps').catch(() => []),
        api(visitContentPath),
      ]);
      if (requestedMapId !== String(visitLoadMapIdLiveRef.current).trim()) return;

      let progressBody = null;
      try {
        progressBody = await api('/api/visit/progress');
      } catch (_) {
        progressBody = null;
      }

      const fetchedMaps = Array.isArray(mapsRes) ? mapsRes : [];
      const activeMaps = fetchedMaps.filter((m) => m?.is_active !== false);
      const visibleMaps = activeMaps.length > 0 ? activeMaps : fetchedMaps;
      setMaps(visibleMaps);
      if (visibleMaps.length > 0 && !visibleMaps.some((m) => m.id === requestedMapId)) {
        setMapId(visibleMaps[0].id);
      }
      const visitPayload =
        visitRes && typeof visitRes === 'object' && !Array.isArray(visitRes)
          ? {
              ...visitRes,
              map_id: visitRes.map_id ?? requestedMapId,
              mascot_packs: Array.isArray(visitRes.mascot_packs) ? visitRes.mascot_packs : [],
            }
          : { zones: [], markers: [], tutorials: [], mascot_packs: [], map_id: requestedMapId };
      setContent(visitPayload);
      const { seen: progressSeen } = safeVisitProgressPayload(progressBody);
      const nextSeen = applyVisitSeenQueueToSet(
        new Set(progressSeen.map((r) => itemSeenKey(r.target_type, r.target_id))),
      );
      setSeen(nextSeen);
      const queueLen = loadVisitSeenQueue().length;
      setPendingSyncCount(queueLen);
      if (queueLen > 0) setSyncStatus((prev) => (prev === 'syncing' ? prev : 'pending'));
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      else alert(err.message || 'Erreur chargement visite');
    } finally {
      setLoading(false);
    }
  }, [mapId, onForceLogout]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const flushVisitSeenQueueNow = useCallback(async () => {
    if (!isBrowserOnline() || visitSeenFlushInFlightRef.current) return;
    const queue = loadVisitSeenQueue();
    if (queue.length === 0) {
      setPendingSyncCount(0);
      setSyncStatus('idle');
      return;
    }
    visitSeenFlushInFlightRef.current = true;
    setSyncStatus('syncing');
    try {
      const result = await flushVisitSeenQueue(async (action) => {
        await api('/api/visit/seen', 'POST', action);
      });
      setPendingSyncCount(result.remaining);
      if (result.remaining > 0) {
        setSyncStatus('error');
      } else if (result.synced > 0) {
        setSyncStatus('synced');
      } else {
        setSyncStatus('idle');
      }
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      setSyncStatus('error');
    } finally {
      visitSeenFlushInFlightRef.current = false;
    }
  }, [onForceLogout]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onOnline = () => {
      setIsOnline(true);
      void flushVisitSeenQueueNow();
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [flushVisitSeenQueueNow]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && isBrowserOnline()) {
        void flushVisitSeenQueueNow();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [flushVisitSeenQueueNow]);

  useEffect(() => {
    if (loading || !isOnline) return;
    if (loadVisitSeenQueue().length > 0) void flushVisitSeenQueueNow();
  }, [loading, isOnline, flushVisitSeenQueueNow]);

  useEffect(() => {
    if (loading) return;
    const sid = selected?.id;
    const st = selectedType;
    if (!sid || !st) return;
    const list = st === 'zone' ? content.zones || [] : content.markers || [];
    const next = list.find((x) => x.id === sid);
    if (next) setSelected(next);
    else {
      setSelected(null);
      setSelectedType(null);
    }
  }, [content, loading, selected?.id, selectedType]);

  useEffect(() => {
    resetMapTransform();
    skipClickRef.current = false;
    dragRef.current.active = false;
    dragRef.current.moved = false;
    setDrawPoints([]);
    setMode('view');
    if (visitMapMascotMoveTimeoutRef.current) {
      clearTimeout(visitMapMascotMoveTimeoutRef.current);
      visitMapMascotMoveTimeoutRef.current = null;
    }
    if (visitDetailPanelAfterMoveTimeoutRef.current) {
      clearTimeout(visitDetailPanelAfterMoveTimeoutRef.current);
      visitDetailPanelAfterMoveTimeoutRef.current = null;
    }
    if (visitMapMascotHappyTimeoutRef.current) {
      clearTimeout(visitMapMascotHappyTimeoutRef.current);
      visitMapMascotHappyTimeoutRef.current = null;
    }
    if (visitMascotDialogTimeoutRef.current) {
      clearTimeout(visitMascotDialogTimeoutRef.current);
      visitMascotDialogTimeoutRef.current = null;
    }
    setVisitMapMascotWalking(false);
    setVisitMapMascotHappy(false);
    resetMascotTransientState();
    setVisitMascotDialogVisible(false);
  }, [mapId, resetMapTransform, resetMascotTransientState]);

  useLayoutEffect(() => {
    visitMascotStartPlacedForMapRef.current = null;
  }, [mapId]);

  useLayoutEffect(() => {
    if (loading) return;
    if (content.map_id != null && String(content.map_id) !== String(mapId)) return;
    if (visitMascotStartPlacedForMapRef.current === mapId) return;
    visitMascotStartPlacedForMapRef.current = mapId;
    if (visitMapMascotMoveTimeoutRef.current) {
      clearTimeout(visitMapMascotMoveTimeoutRef.current);
      visitMapMascotMoveTimeoutRef.current = null;
    }
    setVisitMapMascotWalking(false);
    setVisitMapMascotHappy(false);
    const stored = loadVisitMascotPositionPct(mapId);
    const fallback = computeVisitMascotStartPct(mapId, content.markers || []);
    const start = stored ?? fallback;
    visitMapMascotPctRef.current = start;
    setVisitMapMascotPct(start);
    saveVisitMascotPositionPct(mapId, start);
  }, [mapId, loading, content.map_id, content.markers]);

  useEffect(() => {
    visitMapMascotPctRef.current = visitMapMascotPct;
  }, [visitMapMascotPct]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setPrefersReducedMotion(!!mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(
    () => () => {
      cancelVisitZoomAnim();
      if (visitMapMascotMoveTimeoutRef.current) clearTimeout(visitMapMascotMoveTimeoutRef.current);
      if (visitDetailPanelAfterMoveTimeoutRef.current)
        clearTimeout(visitDetailPanelAfterMoveTimeoutRef.current);
      if (visitMapMascotHappyTimeoutRef.current)
        clearTimeout(visitMapMascotHappyTimeoutRef.current);
      if (visitMascotDialogTimeoutRef.current) clearTimeout(visitMascotDialogTimeoutRef.current);
    },
    [cancelVisitZoomAnim],
  );

  const mascotDialogSettings = useMemo(
    () => publicSettings?.visit?.mascot?.dialog || null,
    [publicSettings?.visit?.mascot?.dialog],
  );

  const showMascotDialog = useCallback(
    (eventKey, { force = false } = {}) => {
      const now = Date.now();
      if (!force && eventKey === 'move' && now < visitMascotMoveDialogCooldownUntilRef.current)
        return;
      const text = resolveMascotDialogLine(eventKey, {
        mascotId: visitMascotId,
        extraCatalogEntries: visitMascotCatalogExtras,
        globalDefaults: mascotDialogSettings?.defaults || null,
        catalogOverrides: mascotDialogSettings?.catalogOverrides || null,
      });
      if (!text) return;
      if (eventKey === 'move') {
        visitMascotMoveDialogCooldownUntilRef.current = now + VISIT_MASCOT_DIALOG_MOVE_COOLDOWN_MS;
      }
      if (visitMascotDialogTimeoutRef.current) clearTimeout(visitMascotDialogTimeoutRef.current);
      setVisitMascotDialog(text);
      setVisitMascotDialogVisible(true);
      visitMascotDialogTimeoutRef.current = window.setTimeout(() => {
        setVisitMascotDialogVisible(false);
        visitMascotDialogTimeoutRef.current = null;
      }, VISIT_MASCOT_DIALOG_MS);
    },
    [visitMascotId, visitMascotCatalogExtras, mascotDialogSettings],
  );

  const triggerMascotHappy = useCallback(() => {
    if (visitMapMascotHappyTimeoutRef.current) {
      clearTimeout(visitMapMascotHappyTimeoutRef.current);
      visitMapMascotHappyTimeoutRef.current = null;
    }
    setVisitMapMascotHappy(true);
    visitMapMascotHappyTimeoutRef.current = window.setTimeout(() => {
      setVisitMapMascotHappy(false);
      visitMapMascotHappyTimeoutRef.current = null;
    }, VISIT_MAP_MASCOT_HAPPY_MS);
  }, []);

  const moveVisitMapMascotTo = useCallback(
    (xp, yp) => {
      if (!Number.isFinite(xp) || !Number.isFinite(yp)) return;
      const target = clampVisitMascotPctForViewport(xp, yp, visitMapFitRef.current?.height || 0);
      const nx = target.xp;
      const ny = target.yp;
      const prev = visitMapMascotPctRef.current;
      const dist = Math.hypot(nx - prev.xp, ny - prev.yp);
      if (dist < 0.08) return;

      const dx = nx - prev.xp;
      if (Math.abs(dx) > 0.12) setVisitMapMascotFaceRight(dx > 0);

      if (visitMapMascotMoveTimeoutRef.current) {
        clearTimeout(visitMapMascotMoveTimeoutRef.current);
        visitMapMascotMoveTimeoutRef.current = null;
      }

      if (prefersReducedMotion) {
        setVisitMapMascotWalking(false);
      } else {
        setVisitMapMascotWalking(true);
        if (dist > 15) {
          triggerMascotTransientState(VISIT_MASCOT_STATE.RUNNING, 1000);
          showMascotDialog('running');
        } else if (dist > 9) {
          triggerMascotTransientState(VISIT_MASCOT_STATE.SURPRISE, 900);
          showMascotDialog('surprise');
        }
        if (dist > 4) showMascotDialog('move');
        visitMapMascotMoveTimeoutRef.current = window.setTimeout(() => {
          setVisitMapMascotWalking(false);
          visitMapMascotMoveTimeoutRef.current = null;
        }, VISIT_MAP_MASCOT_MOVE_MS);
      }

      visitMapMascotPctRef.current = { xp: nx, yp: ny };
      setVisitMapMascotPct({ xp: nx, yp: ny });
      saveVisitMascotPositionPct(mapId, { xp: nx, yp: ny });
    },
    [mapId, prefersReducedMotion, showMascotDialog, triggerMascotTransientState],
  );

  /**
   * Ouvre le panneau lieu une fois le déplacement mascotte terminé (même durée que `VISIT_MAP_MASCOT_MOVE_MS`).
   * @param {{ xp: number, yp: number }} moveFromPct position mascotte **avant** `moveVisitMapMascotTo` (snapshot ref).
   */
  const scheduleVisitDetailPanelOpen = useCallback(
    (item, itemType, targetXp, targetYp, moveFromPct) => {
      if (visitDetailPanelAfterMoveTimeoutRef.current) {
        clearTimeout(visitDetailPanelAfterMoveTimeoutRef.current);
        visitDetailPanelAfterMoveTimeoutRef.current = null;
      }
      const prev =
        moveFromPct && Number.isFinite(moveFromPct.xp) && Number.isFinite(moveFromPct.yp)
          ? moveFromPct
          : visitMapMascotPctRef.current;
      const target = clampVisitMascotPctForViewport(
        targetXp,
        targetYp,
        visitMapFitRef.current?.height || 0,
      );
      const dist = Math.hypot(target.xp - prev.xp, target.yp - prev.yp);
      const delay = dist < 0.08 || prefersReducedMotion ? 0 : VISIT_MAP_MASCOT_MOVE_MS;

      const applySelection = () => {
        visitDetailPanelAfterMoveTimeoutRef.current = null;
        setSelected(item);
        setSelectedType(itemType);
      };

      if (delay === 0) {
        applySelection();
      } else {
        visitDetailPanelAfterMoveTimeoutRef.current = window.setTimeout(applySelection, delay);
      }
    },
    [prefersReducedMotion],
  );

  const visitMapMascotRenderPct = useMemo(
    () =>
      clampVisitMascotPctForViewport(
        visitMapMascotPct.xp,
        visitMapMascotPct.yp,
        visitMapFit.height,
      ),
    [visitMapMascotPct.xp, visitMapMascotPct.yp, visitMapFit.height],
  );

  /** Dimensions naturelles : synchro cache (complete) + reset si pas encore décodé (évite % faux avant onLoad). */
  useLayoutEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    if (el.complete && el.naturalWidth > 0 && el.naturalHeight > 0) {
      setVisitImgNatural({ w: el.naturalWidth, h: el.naturalHeight });
    } else {
      setVisitImgNatural({ w: 0, h: 0 });
    }
  }, [visitMapImageSrc]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return undefined;
    const run = () => applyVisitMapFit(stage, { fullscreen: visitImmersionRef.current });
    run();
    const ro = new ResizeObserver(() => run());
    ro.observe(stage);
    return () => ro.disconnect();
  }, [applyVisitMapFit, mapId, visitImmersion]);

  useLayoutEffect(() => {
    if (!visitImmersion) return undefined;
    const stage = stageRef.current;
    if (!stage) return undefined;
    const measure = () => {
      applyVisitMapFit(stage, { fullscreen: true });
      setMapTransform({ x: 0, y: 0, s: 1 });
    };
    measure();
    let innerRaf = null;
    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(measure);
    });
    return () => {
      cancelAnimationFrame(outerRaf);
      if (innerRaf != null) cancelAnimationFrame(innerRaf);
    };
  }, [visitImmersion, applyVisitMapFit]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onResize = () => {
      setMapTransform((prev) => clampTransform(prev));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampTransform]);

  const onMascotSeenCelebration = useCallback(() => {
    triggerMascotHappy();
    triggerMascotTransientState(VISIT_MASCOT_STATE.CELEBRATE, 1450);
    showMascotDialog('mark_seen', { force: true });
  }, [triggerMascotHappy, triggerMascotTransientState, showMascotDialog]);

  const queueSeenChangeLocally = useCallback((payloadType, payloadId, nextSeen) => {
    const compact = enqueueVisitSeenAction({
      target_type: payloadType,
      target_id: payloadId,
      seen: nextSeen,
    });
    setPendingSyncCount(compact.length);
    setSyncStatus('pending');
  }, []);

  const onToggleSeen = async () => {
    if (!selected || !selectedType) return;
    const key = itemSeenKey(selectedType, selected.id);
    const wasSeen = seen.has(key);
    const payloadType = selectedType;
    const payloadId = selected.id;
    const nextSeen = !wasSeen;

    if (!wasSeen) {
      closeVisitSelection();
      await new Promise((resolve) => {
        if (typeof requestAnimationFrame !== 'function') {
          setTimeout(resolve, 0);
          return;
        }
        requestAnimationFrame(() => {
          requestAnimationFrame(resolve);
        });
      });
    }

    setSeen((prev) => {
      const optimistic = new Set(prev);
      if (wasSeen) optimistic.delete(key);
      else optimistic.add(key);
      return optimistic;
    });

    if (!isBrowserOnline()) {
      queueSeenChangeLocally(payloadType, payloadId, nextSeen);
      if (nextSeen) onMascotSeenCelebration();
      return;
    }

    setSavingSeen(true);
    try {
      await api('/api/visit/seen', 'POST', {
        target_type: payloadType,
        target_id: payloadId,
        seen: nextSeen,
      });
      const compact = replaceQueuedVisitSeenAction({
        target_type: payloadType,
        target_id: payloadId,
        seen: nextSeen,
      });
      setPendingSyncCount(compact.length);
      if (compact.length === 0) setSyncStatus((prev) => (prev === 'syncing' ? prev : 'idle'));
      else setSyncStatus((prev) => (prev === 'syncing' ? prev : 'pending'));
      if (nextSeen) onMascotSeenCelebration();
    } catch (err) {
      if (err instanceof AccountDeletedError) {
        onForceLogout?.();
        return;
      }
      if (isLikelyNetworkTransportFailure(err)) {
        queueSeenChangeLocally(payloadType, payloadId, nextSeen);
        if (nextSeen) onMascotSeenCelebration();
        return;
      }
      alert(err.message || 'Erreur mise à jour');
      setSeen((prev) => {
        const revert = new Set(prev);
        if (wasSeen) revert.add(key);
        else revert.delete(key);
        return revert;
      });
    } finally {
      setSavingSeen(false);
    }
  };

  const createZoneFromPoints = async () => {
    if (!visitMapImageReady || drawPoints.length < 3) return;
    const name = prompt('Titre de la zone de visite ?');
    if (!name || !name.trim()) return;
    setCreating(true);
    try {
      await api('/api/visit/zones', 'POST', {
        map_id: mapId,
        name: name.trim(),
        points: drawPoints,
      });
      setDrawPoints([]);
      setMode('view');
      await loadData();
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      else alert(err.message || 'Erreur création zone');
    } finally {
      setCreating(false);
    }
  };

  const onMapClick = async (event) => {
    if (consumeSkipClick()) return;
    if (!visitMapImageReady) return;
    const stage = event.currentTarget;
    const p = pointToPct(event, stage, mapTransform, visitMapFit);
    if (!p) return;

    /* Clic sur le fond du plan (hors zone/repère : stopPropagation côté SVG/boutons) : déplace la mascotte — élève et prof en mode vue. */
    if (mode === 'view') {
      moveVisitMapMascotTo(p.xp, p.yp);
      return;
    }

    if (!isTeacher) return;

    if (mode === 'draw-zone') {
      setDrawPoints((prev) => [...prev, p]);
      return;
    }

    if (mode === 'add-marker') {
      const label = prompt('Titre du repère de visite ?');
      if (!label || !label.trim()) return;
      setCreating(true);
      try {
        await api('/api/visit/markers', 'POST', {
          map_id: mapId,
          x_pct: p.xp,
          y_pct: p.yp,
          label: label.trim(),
          emoji: '',
        });
        setMode('view');
        await loadData();
      } catch (err) {
        if (err instanceof AccountDeletedError) onForceLogout?.();
        else alert(err.message || 'Erreur création repère');
      } finally {
        setCreating(false);
      }
    }
  };

  const onStagePointerDown = (event) => {
    if (!canPanAndZoom) return;
    cancelVisitZoomAnim();
    if (
      event.target.closest('.visit-map-controls') ||
      event.target.closest('.visit-zone-hit') ||
      event.target.closest('.visit-marker-btn')
    )
      return;
    const stage = stageRef.current;
    if (!stage) return;
    dragRef.current = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      baseX: mapTransform.x,
      baseY: mapTransform.y,
    };
    try {
      stage.setPointerCapture(event.pointerId);
    } catch (_) {}
  };

  const onStagePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag.active || !canPanAndZoom) return;
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const dx = event.clientX - drag.startClientX;
    const dy = event.clientY - drag.startClientY;
    const hasMoved = Math.hypot(dx, dy) > 4;
    if (hasMoved) {
      drag.moved = true;
      skipClickRef.current = true;
    }
    const next = clampTransform(
      { x: drag.baseX + dx, y: drag.baseY + dy, s: mapTransform.s },
      rect,
    );
    setMapTransform(next);
    if (drag.moved) event.preventDefault();
  };

  const onStagePointerUp = (event) => {
    const drag = dragRef.current;
    if (!drag.active) return;
    const stage = stageRef.current;
    if (stage && drag.pointerId != null) {
      try {
        stage.releasePointerCapture(drag.pointerId);
      } catch (_) {}
    }
    dragRef.current = {
      active: false,
      moved: drag.moved,
      pointerId: null,
      startClientX: 0,
      startClientY: 0,
      baseX: 0,
      baseY: 0,
    };
    if (drag.moved) {
      setTimeout(() => {
        skipClickRef.current = false;
      }, 0);
    }
    if (pinchRef.current.active) {
      pinchRef.current.active = false;
    }
    if (event && drag.moved) event.preventDefault();
  };

  const onStageWheel = (event) => {
    if (!canPanAndZoom) return;
    event.preventDefault();
    cancelVisitZoomAnim();
    const stage = stageRef.current;
    const factor = wheelZoomScaleFactor(event, { containerClientHeight: stage?.clientHeight });
    zoomAroundClientPoint(event.clientX, event.clientY, factor);
  };

  const onStageTouchStart = (event) => {
    if (!canPanAndZoom) return;
    cancelVisitZoomAnim();
    if (event.touches.length !== 2) return;
    const stage = stageRef.current;
    if (!stage) return;
    const t0 = event.touches[0];
    const t1 = event.touches[1];
    const rect = stage.getBoundingClientRect();
    pinchRef.current = {
      active: true,
      dist: Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY),
      startScale: mapTransform.s,
      startX: mapTransform.x,
      startY: mapTransform.y,
      midX: (t0.clientX + t1.clientX) / 2 - rect.left,
      midY: (t0.clientY + t1.clientY) / 2 - rect.top,
    };
    dragRef.current.active = false;
    skipClickRef.current = true;
    event.preventDefault();
  };

  const onStageTouchMove = (event) => {
    if (!canPanAndZoom) return;
    if (!pinchRef.current.active || event.touches.length !== 2) return;
    const stage = stageRef.current;
    if (!stage) return;
    const t0 = event.touches[0];
    const t1 = event.touches[1];
    const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
    const rect = stage.getBoundingClientRect();
    const pinch = pinchRef.current;
    const next = zoomVisitTransformToScale(
      { x: pinch.startX, y: pinch.startY, s: pinch.startScale },
      pinch.midX,
      pinch.midY,
      pinch.startScale * (dist / Math.max(1, pinch.dist)),
      rect,
    );
    setMapTransform(next);
    event.preventDefault();
  };

  const onStageTouchEnd = () => {
    if (pinchRef.current.active) pinchRef.current.active = false;
  };

  /** React enregistre wheel / touch / pointermove comme passifs : `preventDefault` échoue sans `{ passive: false }` (cf. `map-views.jsx`). */
  const visitStageInteractionRef = useRef({});
  visitStageInteractionRef.current = {
    onStagePointerDown,
    onStagePointerMove,
    onStagePointerUp,
    onStageWheel,
    onStageTouchStart,
    onStageTouchMove,
    onStageTouchEnd,
  };

  useLayoutEffect(() => {
    if (loading) return undefined;
    const el = stageRef.current;
    if (!el) return undefined;

    const r = visitStageInteractionRef;
    const pd = (e) => r.current.onStagePointerDown(e);
    const pm = (e) => r.current.onStagePointerMove(e);
    const pu = (e) => r.current.onStagePointerUp(e);
    const wh = (e) => r.current.onStageWheel(e);
    const ts = (e) => r.current.onStageTouchStart(e);
    const tm = (e) => r.current.onStageTouchMove(e);
    const te = () => r.current.onStageTouchEnd();

    el.addEventListener('pointerdown', pd, { passive: true });
    el.addEventListener('pointermove', pm, { passive: false });
    el.addEventListener('pointerup', pu, { passive: false });
    el.addEventListener('pointercancel', pu, { passive: false });
    el.addEventListener('pointerleave', pu, { passive: false });
    el.addEventListener('wheel', wh, { passive: false });
    el.addEventListener('touchstart', ts, { passive: false });
    el.addEventListener('touchmove', tm, { passive: false });
    el.addEventListener('touchend', te, { passive: true });
    el.addEventListener('touchcancel', te, { passive: true });

    return () => {
      el.removeEventListener('pointerdown', pd);
      el.removeEventListener('pointermove', pm);
      el.removeEventListener('pointerup', pu);
      el.removeEventListener('pointercancel', pu);
      el.removeEventListener('pointerleave', pu);
      el.removeEventListener('wheel', wh);
      el.removeEventListener('touchstart', ts);
      el.removeEventListener('touchmove', tm);
      el.removeEventListener('touchend', te);
      el.removeEventListener('touchcancel', te);
    };
  }, [loading]);

  useEffect(() => {
    if (!selected || visitMediaLightbox || visitTutorialPreview) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeVisitSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, visitMediaLightbox, visitTutorialPreview, closeVisitSelection]);

  if (loading) {
    return (
      <div className="loader">
        <div className="loader-leaf">🧭</div>
        <p>Préparation de la visite...</p>
      </div>
    );
  }

  return (
    <>
      <div
        className={`visit-view fade-in${isGuestPublicVisit ? ' visit-view--guest-public' : ''} visit-view--map-forward${visitImmersion ? ' visit-view--immersion' : ''}${teacherPreviewAsStudent ? ' visit-view--teacher-preview-student' : ''}`}
      >
        {visitTutorialPreview && (
          <TutorialPreviewModal
            tutorial={visitTutorialPreview}
            onClose={() => setVisitTutorialPreview(null)}
            readAcknowledge={{
              isRead: tutorialReadIds.has(Number(visitTutorialPreview.id)),
              onAcknowledged: (id) => setTutorialReadIds((prev) => new Set([...prev, id])),
              onForceLogout,
            }}
          />
        )}
        {visitMediaLightbox && (
          <Lightbox
            src={visitMediaLightbox.src}
            caption={visitMediaLightbox.caption}
            onClose={() => setVisitMediaLightbox(null)}
          />
        )}
        <VisitGuestMascotOnboarding
          requested={isGuestPublicVisit && requireGuestMascotChoice}
          mascotId={visitMascotId}
          mascotOptions={visitMascotOptions}
          onChangeMascotId={onChangeVisitMascotId}
          extraCatalogEntries={visitMascotCatalogExtras}
          onDone={onGuestMascotChoiceDone}
        />
        <div className="visit-grid visit-grid--map-forward">
          <div className="visit-map-card">
            {!visitImmersion ? (
              <VisitMapChrome
                title={visitTitle}
                showPresentationButton={showVisitPresentationButton}
                presentationInvitePulse={visitPresentationInvitePulse}
                onOpenPresentation={() =>
                  setVisitTutorialPreview(tutorialPreviewPayload(visitPresentationTutorial))
                }
                networkStatusLabel={mode === 'view' ? visitNetworkStatusLabel : null}
                isOnline={isOnline}
                syncStatus={syncStatus}
                pendingSyncCount={pendingSyncCount}
                visitImmersion={visitImmersion}
                onToggleImmersion={toggleVisitImmersion}
                isTeacher={isTeacher}
                teacherPreviewAsStudent={teacherPreviewAsStudent}
                onToggleTeacherPreview={() => setTeacherPreviewAsStudent((v) => !v)}
                visitMascotId={visitMascotId}
                visitMascotOptions={visitMascotOptions}
                onChangeVisitMascotId={onChangeVisitMascotId}
                cartographyProgress={visitCartographyProgress}
                helpPanelSlot={
                  isHelpEnabled ? (
                    <HelpPanel
                      sectionId="visit"
                      title={HELP_PANELS.visit.title}
                      entries={HELP_PANELS.visit.items}
                      isTeacher={isTeacher}
                      isPulsing={pulseUnseenPanels && !hasSeenSection('visit')}
                      panelTitlePrefix={helpPanelTitlePrefix}
                      closeButtonText={helpPanelCloseCta}
                      dismissButtonText={helpPanelDismissCta}
                      onMarkSeen={markSectionSeen}
                      onOpen={trackPanelOpen}
                      onDismiss={trackPanelDismiss}
                    />
                  ) : null
                }
                onBackToAuth={!student && onBackToAuth ? onBackToAuth : null}
                maps={maps}
                mapId={mapId}
                onSelectMapId={setMapId}
                quickTipPrefix={helpHintPrefix}
                quickTipText={
                  isHelpEnabled && showContextHints && visitQuickTip ? visitQuickTip : null
                }
              />
            ) : null}
            <MapFullscreenShell
              active={visitImmersion}
              onClose={() => setVisitImmersion(false)}
              layerClassName="visit-map-fullscreen-shell"
            >
              <div
                ref={stageRef}
                className={`visit-map-stage${visitImmersion ? ' visit-map-stage--fullscreen' : ''}`}
                onClick={onMapClick}
                data-visit-mascot-visibility={showVisitMapMascot ? 'visible' : 'hidden'}
                data-visit-mascot-reason={visitMascotVisibilityReason}
                style={{
                  cursor:
                    isTeacher && mode !== 'view' && !visitMapImageReady
                      ? 'wait'
                      : isTeacher && mode !== 'view'
                        ? 'crosshair'
                        : canPanAndZoom
                          ? 'grab'
                          : 'default',
                  touchAction: canPanAndZoom ? 'none' : 'auto',
                }}
              >
              <div
                className="visit-map-world"
                style={{
                  transform: `translate(${mapTransform.x}px, ${mapTransform.y}px) scale(${mapTransform.s})`,
                  /* Repères HTML : contre-échelle pour composer les emojis en px écran (évite le flou sous transform). */
                  '--visit-map-scale': String(Math.max(Number(mapTransform.s) || 1, 0.001)),
                }}
              >
                <div
                  className="visit-map-fit-layer"
                  style={
                    visitImmersion
                      ? { left: 0, top: 0, width: '100%', height: '100%' }
                      : visitMapFit.width > 0 && visitMapFit.height > 0
                        ? {
                            left: visitMapFit.offsetX,
                            top: visitMapFit.offsetY,
                            width: visitMapFit.width,
                            height: visitMapFit.height,
                          }
                        : { left: 0, top: 0, width: '100%', height: '100%' }
                  }
                >
                  <img
                    ref={imgRef}
                    src={visitMapImageSrc}
                    alt={`Plan ${currentMap?.label || 'Forêt'}`}
                    className="visit-map-img"
                    onLoad={(e) => {
                      const el = e.currentTarget;
                      setVisitImgNatural({ w: el.naturalWidth || 0, h: el.naturalHeight || 0 });
                    }}
                    onError={() =>
                      setVisitMapImageIdx((idx) =>
                        idx < visitMapImageCandidates.length - 1 ? idx + 1 : idx,
                      )
                    }
                  />

                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="visit-map-zones">
                    {(content.zones || []).map((z) => {
                      const points = parsePctPoints(z.points);
                      if (points.length < 3) return null;
                      const p = points.map((pt) => `${pt.xp},${pt.yp}`).join(' ');
                      const isSeen = seen.has(itemSeenKey('zone', z.id));
                      const mx = points.reduce((s, pt) => s + pt.xp, 0) / points.length;
                      const my = points.reduce((s, pt) => s + pt.yp, 0) / points.length;
                      const zoneEmoji = detectLeadingMarkerEmoji(z.name || '', markerEmojis);
                      const zoneLabel = stripLeadingMarkerEmoji(z.name || '', markerEmojis);
                      const { emojiU, labelU, gapU, strokeU } = visitZoneSvgTypography;
                      const fw = visitMapFit.width;
                      const fh = visitMapFit.height;
                      const titleY = my;
                      const titleUniform = visitZoneSvgTextUniformYTransform(mx, titleY, fw, fh);
                      const showZoneLabel = Boolean(String(zoneLabel || '').trim() || z.name);
                      return (
                        <g
                          key={z.id}
                          className="visit-zone-hit"
                          style={{ cursor: 'pointer' }}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (consumeSkipClick()) return;
                            if (mode === 'view') {
                              const c = visitZoneCentroidPct(z);
                              const fromPct = { ...visitMapMascotPctRef.current };
                              if (c) moveVisitMapMascotTo(c.xp, c.yp);
                              triggerMascotTransientState(VISIT_MASCOT_STATE.MAP_READ, 1200);
                              showMascotDialog('map_read');
                              if (c) scheduleVisitDetailPanelOpen(z, 'zone', c.xp, c.yp, fromPct);
                              else {
                                setSelected(z);
                                setSelectedType('zone');
                              }
                            } else {
                              setSelected(z);
                              setSelectedType('zone');
                            }
                          }}
                        >
                          <polygon
                            points={p}
                            className={`visit-zone-poly ${isSeen ? 'is-seen' : 'is-unseen'}`}
                          />
                          {zoneEmoji || showZoneLabel ? (
                            <g transform={titleUniform}>
                              {zoneEmoji ? (
                                <text
                                  x={mx}
                                  y={titleY}
                                  textAnchor="middle"
                                  dominantBaseline="middle"
                                  fontSize={emojiU}
                                  className="visit-zone-label visit-zone-label--emoji"
                                >
                                  {zoneEmoji}
                                </text>
                              ) : null}
                              {showZoneLabel ? (
                                <text
                                  x={mx}
                                  y={titleY + (zoneEmoji ? gapU : 0)}
                                  textAnchor="middle"
                                  dominantBaseline="middle"
                                  fontSize={labelU}
                                  fontWeight="700"
                                  fontFamily="DM Sans, sans-serif"
                                  fill="#1a4731"
                                  stroke="rgba(255,255,255,0.88)"
                                  strokeWidth={strokeU}
                                  paintOrder="stroke"
                                  className="visit-zone-label visit-zone-label--title"
                                >
                                  {zoneLabel || z.name}
                                </text>
                              ) : null}
                            </g>
                          ) : null}
                        </g>
                      );
                    })}
                    {mode === 'draw-zone' && drawPoints.length >= 1 && (
                      <VisitDrawZonePreview points={drawPoints} />
                    )}
                  </svg>

                  {showVisitMapMascot ? (
                    <VisitMapMascot
                      renderPct={visitMapMascotRenderPct}
                      walking={visitMapMascotWalking}
                      happy={visitMapMascotHappy}
                      prefersReducedMotion={prefersReducedMotion}
                      faceRight={visitMapMascotFaceRight}
                      mascotState={visitMascotAnimationState}
                      mascotId={visitMascotId}
                      extraCatalogEntries={visitMascotCatalogExtras}
                      dialogVisible={visitMascotDialogVisible}
                      dialog={visitMascotDialog}
                    />
                  ) : null}

                  {(content.markers || []).map((m) => {
                    const isSeen = seen.has(itemSeenKey('marker', m.id));
                    return (
                      <VisitMapMarkerButton
                        key={m.id}
                        marker={m}
                        isSeen={isSeen}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (consumeSkipClick()) return;
                          if (mode === 'view') {
                            const fromPct = { ...visitMapMascotPctRef.current };
                            moveVisitMapMascotTo(Number(m.x_pct), Number(m.y_pct));
                            triggerMascotTransientState(VISIT_MASCOT_STATE.INSPECT, 1200);
                            showMascotDialog('inspect');
                            scheduleVisitDetailPanelOpen(
                              m,
                              'marker',
                              Number(m.x_pct),
                              Number(m.y_pct),
                              fromPct,
                            );
                          } else {
                            setSelected(m);
                            setSelectedType('marker');
                          }
                        }}
                      />
                    );
                  })}
                </div>
              </div>
              <VisitMapZoomControls
                onZoomIn={() => zoomFromCenterAnimated(1.2)}
                onZoomOut={() => zoomFromCenterAnimated(0.84)}
                onReset={resetMapTransform}
              />
            </div>
            {!selected ? (
              <p className="visit-map-empty-hint section-sub">{visitEmptySelection}</p>
            ) : null}
            </MapFullscreenShell>
          </div>
        </div>

        {selected ? (
          <VisitDetailPanel
            selected={selected}
            selectedType={selectedType}
            onClose={closeVisitSelection}
            comfortableReading={comfortableReading}
            onToggleComfortableReading={() => setComfortableReading((v) => !v)}
            onOpenLightbox={setVisitMediaLightbox}
            onOpenTutorialPreview={setVisitTutorialPreview}
            seen={seen}
            savingSeen={savingSeen}
            onToggleSeen={onToggleSeen}
            plants={plants}
            onOpenPlantCatalogPreview={onOpenPlantCatalogPreview}
            mapId={mapId}
            mapZones={mapZones}
            mapMarkers={mapMarkers}
            tasks={tasks}
            catalogTutorials={catalogTutorials}
            isTeacher={isTeacher}
            canEditVisit={isTeacher && !teacherPreviewAsStudent}
            onSaved={loadData}
            onForceLogout={onForceLogout}
            roleTerms={roleTerms}
            markerEmojis={markerEmojis}
          />
        ) : null}

        {showVisitMapTutorialsSection ? (
          <VisitTutorialsSection
            visitImmersion={visitImmersion}
            title={visitTutorialsTitle}
            emptyText={visitTutorialsEmpty}
            isTeacher={isTeacher}
            availableTutorials={availableTutorials}
            tutorials={content.tutorials || []}
            mapId={mapId}
            onSaved={loadData}
            onForceLogout={onForceLogout}
            tutorialReadIds={tutorialReadIds}
            onTutorialAcknowledged={(id) => setTutorialReadIds((prev) => new Set([...prev, id]))}
            onOpenTutorialPreview={setVisitTutorialPreview}
            contextCommentsEnabled={contextCommentsEnabled}
            studentId={student?.id}
            canParticipateContextComments={canParticipateContextComments}
          />
        ) : null}

        {isTeacher && !teacherPreviewAsStudent && (
          <VisitProfToolsPanel
            isTeacher={isTeacher}
            loading={loading}
            visitMapImageReady={visitMapImageReady}
            mode={mode}
            onSetMode={(nextMode) => {
              setMode(nextMode);
              if (nextMode === 'view') setDrawPoints([]);
            }}
            drawPointsCount={drawPoints.length}
            creating={creating}
            onCreateZone={createZoneFromPoints}
            onUndoDrawPoint={() => setDrawPoints((prev) => prev.slice(0, -1))}
            onClearDrawPoints={() => setDrawPoints([])}
            mapId={mapId}
            onSynced={loadData}
            onForceLogout={onForceLogout}
            onOpenMascotPackStudioTab={onOpenMascotPackStudioTab}
          />
        )}
      </div>
    </>
  );
}

/** Mémoïsation (comparaison shallow par défaut) : évite le re-render de cette vue lourde
 *  à chaque tick du polling global d'App.jsx quand ses props ne changent pas. */
const VisitView = React.memo(VisitViewImpl);
VisitView.displayName = 'VisitView';

export { VisitView };
