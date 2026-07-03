import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api, AccountDeletedError } from '../services/api';
import { MARKER_EMOJIS, parseEmojiListSetting } from '../constants/emojis';
import { getRoleTerms } from '../utils/n3-terminology';
import { useHelp } from '../hooks/useHelp';
import { HelpPanel } from './HelpPanel';
import {
  resolveHelpChrome,
  resolveHelpPanelSection,
  resolveHelpQuickTip,
} from '../utils/helpResolve';
import { getContentText } from '../utils/content';
import { resolveMapOverlayTypography } from '../utils/mapOverlayTypography';
import {
  MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX,
  readPlateauMarkerSizePercent,
  resolveMapOverlayScaleCssValue,
} from '../shared/mapOverlayScale.js';
import { fetchTutorialReadIds } from './TutorialReadAcknowledge';
import {
  TutorialPreviewModal,
  tutorialPreviewPayload,
  tutorialPreviewCanEmbed,
} from './TutorialPreviewModal';
import { useOverlayHistoryBack } from '../hooks/useOverlayHistoryBack';
import { computeMapImageContainRect, resolveMapStageClientBox } from '../utils/mapImageFit';
import { buildMapImageCandidates } from '../utils/mapImageCandidates';
import { visitZoneCentroidPct } from '../utils/visitMapGeometry.js';
import { VisitDetailPanel } from './visit/VisitDetailPanel.jsx';
import { VisitTutorialsSection } from './visit/VisitTutorialsSection.jsx';
import { VisitMapChrome } from './visit/VisitMapChrome.jsx';
import { VisitProfToolsPanel } from './visit/VisitProfToolsPanel.jsx';
import { VisitGuestMascotOnboarding } from './visit/VisitGuestMascotOnboarding.jsx';
import { VisitZonesSvgLayer } from './visit/VisitZonesSvgLayer.jsx';
import { VisitMarkersLayer } from './visit/VisitMarkersLayer.jsx';
import { VisitMapZoomControls } from './visit/VisitMapZoomControls.jsx';
import {
  shouldShowVisitMapMascot as computeShowVisitMapMascot,
  getVisitMascotVisibilityReason,
} from '../utils/visitMascotVisibility.js';
import { wheelZoomScaleFactor } from '../utils/mapWheelZoom';
import { clampVisitMapTransform, zoomVisitTransformToScale } from '../utils/visitMapTransform.js';
import { pointToContainedRectPct } from '../shared/pct-map/pctMapPointer.js';
import { useMapFullscreen } from '../shared/hooks/useMapFullscreen.js';
import { MapFullscreenShell } from '../shared/components/MapFullscreenShell.jsx';
import { VisitMapMascot } from './VisitMapMascot.jsx';
import { usePublicSettings } from '../contexts/PublicSettingsContext.jsx';
import { useSession } from '../contexts/SessionContext.jsx';
import { useData } from '../contexts/DataContext.jsx';

import { VISIT_MASCOT_INTERACTION_EVENT } from '../utils/visitMascotInteractionEvents.js';
import {
  computeVisitCartographyProgress,
  buildVisitNetworkStatusLabel,
} from '../utils/visitViewStatus.js';
import { useVisitMapTransform } from '../hooks/useVisitMapTransform.js';
import { useVisitContent } from '../hooks/useVisitContent.js';
import { useVisitSeenSync } from '../hooks/useVisitSeenSync.js';
import { useVisitMapMascotController } from '../hooks/useVisitMapMascotController.js';
// Import direct (même défaut useOverlayHistory=false que l'ancien wrapper Lightbox
// de map-views) : évite de tirer tout le graphe carte dans le chunk visite.
import { ImageLightbox } from '../shared/components/ImageLightbox.jsx';
import { safeLocalStorageGetItem, safeLocalStorageSetItem } from '../utils/browserStorage.js';

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
  const visitTitle = getContentText(publicSettings, 'visit.title', '🧭 Visite de la carte');
  const helpChrome = resolveHelpChrome(publicSettings);
  const helpHintPrefix = helpChrome.hintPrefix;
  const helpPanelTitlePrefix = helpChrome.panelTitlePrefix;
  const helpPanelCloseCta = helpChrome.panelCloseCta;
  const helpPanelDismissCta = helpChrome.panelDismissCta;
  const visitQuickTip = resolveHelpQuickTip('visit', publicSettings);
  const helpVisit = resolveHelpPanelSection('visit', publicSettings);
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
  /** Pont vers useVisitSeenSync (appelé plus bas) : loadData transmet la progression brute via cette ref. */
  const applyServerProgressRef = useRef(null);
  const onVisitProgressLoaded = useCallback((progressBody) => {
    applyServerProgressRef.current?.(progressBody);
  }, []);
  const { maps, content, loading, loadData, selected, setSelected, selectedType, setSelectedType } =
    useVisitContent({
      mapId,
      setMapId,
      onForceLogout,
      onProgressLoaded: onVisitProgressLoaded,
    });
  /** Premier tutoriel « visite » ouvrable en modale (ordre API / sélection prof). */
  const visitPresentationTutorial = useMemo(() => {
    const list = content.tutorials || [];
    for (const t of list) {
      if (tutorialPreviewCanEmbed(t)) return t;
    }
    return null;
  }, [content.tutorials]);
  const [tutorialReadIds, setTutorialReadIds] = useState(() => new Set());
  const [visitTutorialPreview, setVisitTutorialPreview] = useState(null);
  const [visitMediaLightbox, setVisitMediaLightbox] = useState(null);
  const [mode, setMode] = useState('view');
  const [drawPoints, setDrawPoints] = useState([]);
  const [creating, setCreating] = useState(false);
  const stageRef = useRef(null);
  // Calque monde + minuterie de retombée : `will-change: transform` actif pendant les
  // gestes (fluidité), retiré au repos pour que le contenu se re-pixellise net à l'échelle
  // affichée (sinon texte/emojis flous en zoomant, cf. MapView).
  const visitWorldRef = useRef(null);
  const visitWillChangeTimerRef = useRef(null);
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
  // Pan/zoom : pendant un geste, la valeur vit dans `mapTransformLiveRef` et est appliquée
  // impérativement sur `visitWorldRef` (aucun re-render par frame) ; l'état React
  // `mapTransform` (lu par le rendu et la typographie des zones) n'est resynchronisé
  // qu'en fin de geste — cf. useVisitMapTransform (pattern useMapGestures).
  const {
    transform: mapTransform,
    liveRef: mapTransformLiveRef,
    applyLive: applyLiveMapTransform,
    setLive: setLiveMapTransform,
    commit: commitMapTransform,
    scheduleCommit: scheduleMapTransformCommit,
  } = useVisitMapTransform(visitWorldRef);
  const visitZoomAnimRafRef = useRef(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
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
      setVisitMapFit(computeMapImageContainRect(visitImgNatural.w, visitImgNatural.h, cw, ch));
    },
    [visitImgNatural.w, visitImgNatural.h],
  );
  const visitMapFitRef = useRef(visitMapFit);
  visitMapFitRef.current = visitMapFit;
  const visitMapImageReady = visitImgNatural.w > 0 && visitImgNatural.h > 0;
  const canPanAndZoom = mode === 'view';

  // Mascotte du plan : états, minuteries, placement par carte, dialogues et
  // interactions data-driven regroupés dans le contrôleur dédié (timings identiques).
  const {
    visitMascotId,
    visitMascotOptions,
    visitMascotAnimationState,
    onChangeVisitMascotId,
    visitMascotCatalogExtras,
    visitMapMascotRenderPct,
    visitMapMascotFaceRight,
    visitMapMascotWalking,
    visitMapMascotHappy,
    visitMascotDialog,
    visitMascotDialogVisible,
    visitMapMascotPctRef,
    moveVisitMapMascotTo,
    scheduleVisitDetailPanelOpen,
    cancelScheduledDetailPanelOpen,
    emitMascotEvent,
    showMascotDialog,
    onMascotSeenCelebration,
    onMascotTap,
  } = useVisitMapMascotController({
    mapId,
    loading,
    content,
    prefersReducedMotion,
    profileVisitMascotId,
    visitMapFitRef,
    viewportFitHeight: visitMapFit.height,
    setSelected,
    setSelectedType,
  });

  const closeVisitSelection = useCallback(() => {
    cancelScheduledDetailPanelOpen();
    setSelected(null);
    setSelectedType(null);
  }, [cancelScheduledDetailPanelOpen, setSelected, setSelectedType]);
  useOverlayHistoryBack(isGuestPublicVisit && !!selected, closeVisitSelection);
  useOverlayHistoryBack(!!visitMediaLightbox, () => setVisitMediaLightbox(null));

  /** Tailles emoji / libellé zone en unités SVG (viewBox 0–100), ratio constant repère/plateau. */
  const visitZoneSvgTypography = useMemo(() => {
    const mapSettings =
      publicSettings?.map && typeof publicSettings.map === 'object' ? publicSettings.map : null;
    const fitH =
      visitMapFit.height > 0 ? visitMapFit.height : MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX;
    const fw = visitMapFit.width > 0 ? visitMapFit.width : 360;
    const uPerPx = 100 / Math.max(1, fw);
    const worldScale = Math.max(Number(mapTransform.s) || 1, 0.001);
    const t = resolveMapOverlayTypography(mapSettings, fitH, { worldScale });
    const overlayScale = resolveMapOverlayScaleCssValue({
      fitHeightPx: fitH,
      sizePercent: readPlateauMarkerSizePercent(mapSettings),
    });
    return {
      emojiU: t.mapEmojiFontPx * uPerPx,
      labelU: t.mapLabelFontPx * uPerPx,
      gapU: t.mapEmojiLabelCenterGap * uPerPx,
      strokeU: Math.max(0.06, (3 / worldScale) * uPerPx),
      overlayScale,
    };
  }, [publicSettings, visitMapFit.width, visitMapFit.height, mapTransform.s]);

  const clampTransform = useCallback((next, rectLike = null) => {
    const stage = stageRef.current;
    const rect = rectLike || (stage ? stage.getBoundingClientRect() : null);
    return clampVisitMapTransform(next, rect);
  }, []);

  /** @returns {boolean} true si une animation de zoom était en cours (annulée). */
  const cancelVisitZoomAnim = useCallback(() => {
    if (visitZoomAnimRafRef.current != null) {
      cancelAnimationFrame(visitZoomAnimRafRef.current);
      visitZoomAnimRafRef.current = null;
      return true;
    }
    return false;
  }, []);

  /**
   * Marque une interaction (pan/zoom) en cours : pose `will-change: transform` pour la fluidité,
   * puis programme son retrait après une courte inactivité pour que le calque se re-pixellise net.
   */
  const markVisitInteracting = useCallback(() => {
    const el = visitWorldRef.current;
    if (el) el.style.willChange = 'transform';
    if (visitWillChangeTimerRef.current) clearTimeout(visitWillChangeTimerRef.current);
    visitWillChangeTimerRef.current = setTimeout(() => {
      visitWillChangeTimerRef.current = null;
      const node = visitWorldRef.current;
      if (node) node.style.willChange = 'auto';
    }, 180);
  }, []);

  const zoomAroundClientPoint = useCallback(
    (clientX, clientY, factor) => {
      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const prev = mapTransformLiveRef.current;
      setLiveMapTransform(
        zoomVisitTransformToScale(
          prev,
          clientX - rect.left,
          clientY - rect.top,
          prev.s * factor,
          rect,
        ),
      );
    },
    [mapTransformLiveRef, setLiveMapTransform],
  );

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
      const start = { ...mapTransformLiveRef.current };
      const target = zoomVisitTransformToScale(start, px, py, start.s * factor, rect);

      if (prefersReducedMotion) {
        commitMapTransform(target);
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
        markVisitInteracting();
        // Frame d'animation : application impérative directe (déjà sous rAF), sans re-render.
        mapTransformLiveRef.current = zoomVisitTransformToScale(start, px, py, curS, rect);
        applyLiveMapTransform();
        if (t < 1) {
          visitZoomAnimRafRef.current = requestAnimationFrame(step);
        } else {
          visitZoomAnimRafRef.current = null;
          commitMapTransform(target);
        }
      };
      visitZoomAnimRafRef.current = requestAnimationFrame(step);
    },
    [
      prefersReducedMotion,
      cancelVisitZoomAnim,
      markVisitInteracting,
      mapTransformLiveRef,
      applyLiveMapTransform,
      commitMapTransform,
    ],
  );

  const resetMapTransform = useCallback(() => {
    cancelVisitZoomAnim();
    commitMapTransform({ x: 0, y: 0, s: 1 });
  }, [cancelVisitZoomAnim, commitMapTransform]);

  const consumeSkipClick = useCallback(() => {
    if (!skipClickRef.current) return false;
    skipClickRef.current = false;
    return true;
  }, []);

  /** Clic zone (calque SVG mémoïsé) : identité stable hors changement de `mode`. */
  const onVisitZoneClick = useCallback(
    (z, event) => {
      event.stopPropagation();
      if (consumeSkipClick()) return;
      if (mode === 'view') {
        const c = visitZoneCentroidPct(z);
        const fromPct = { ...visitMapMascotPctRef.current };
        if (c) moveVisitMapMascotTo(c.xp, c.yp);
        emitMascotEvent(VISIT_MASCOT_INTERACTION_EVENT.MAP_READ_OPEN);
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
    },
    [
      mode,
      consumeSkipClick,
      moveVisitMapMascotTo,
      emitMascotEvent,
      showMascotDialog,
      scheduleVisitDetailPanelOpen,
      setSelected,
      setSelectedType,
      visitMapMascotPctRef,
    ],
  );

  /** Clic repère (calque mémoïsé) : identité stable hors changement de `mode`. */
  const onVisitMarkerClick = useCallback(
    (m, event) => {
      event.stopPropagation();
      if (consumeSkipClick()) return;
      if (mode === 'view') {
        const fromPct = { ...visitMapMascotPctRef.current };
        moveVisitMapMascotTo(Number(m.x_pct), Number(m.y_pct));
        emitMascotEvent(VISIT_MASCOT_INTERACTION_EVENT.MARKER_INSPECT_OPEN);
        showMascotDialog('inspect');
        scheduleVisitDetailPanelOpen(m, 'marker', Number(m.x_pct), Number(m.y_pct), fromPct);
      } else {
        setSelected(m);
        setSelectedType('marker');
      }
    },
    [
      mode,
      consumeSkipClick,
      moveVisitMapMascotTo,
      emitMascotEvent,
      showMascotDialog,
      scheduleVisitDetailPanelOpen,
      setSelected,
      setSelectedType,
      visitMapMascotPctRef,
    ],
  );

  useEffect(() => {
    resetMapTransform();
    skipClickRef.current = false;
    dragRef.current.active = false;
    dragRef.current.moved = false;
    setDrawPoints([]);
    setMode('view');
  }, [mapId, resetMapTransform]);

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
    },
    [cancelVisitZoomAnim],
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
      commitMapTransform({ x: 0, y: 0, s: 1 });
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
  }, [visitImmersion, applyVisitMapFit, commitMapTransform]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onResize = () => {
      commitMapTransform(clampTransform(mapTransformLiveRef.current));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampTransform, commitMapTransform, mapTransformLiveRef]);

  // Progression « vu » (online/offline) : états + effets orchestrés par le hook dédié ;
  // loadData (useVisitContent) lui transmet la progression serveur via applyServerProgressRef.
  const {
    seen,
    savingSeen,
    isOnline,
    pendingSyncCount,
    syncStatus,
    onToggleSeen,
    applyServerProgress,
  } = useVisitSeenSync({
    onForceLogout,
    loading,
    selected,
    selectedType,
    closeVisitSelection,
    onMascotSeenCelebration,
  });
  applyServerProgressRef.current = applyServerProgress;

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
    const p = pointToPct(event, stage, mapTransformLiveRef.current, visitMapFit);
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
    // Zoom animé interrompu : fige l'état sur la valeur vive, sinon un re-render ultérieur
    // ramènerait visuellement la carte à l'état commité d'avant l'animation.
    if (cancelVisitZoomAnim()) commitMapTransform();
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
      baseX: mapTransformLiveRef.current.x,
      baseY: mapTransformLiveRef.current.y,
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
      markVisitInteracting();
    }
    const next = clampTransform(
      { x: drag.baseX + dx, y: drag.baseY + dy, s: mapTransformLiveRef.current.s },
      rect,
    );
    // Frame de drag : ref + style impératif sous rAF, sans re-render (commit au pointerup).
    setLiveMapTransform(next);
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
    // Fin de drag : fige la valeur vive dans l'état React (un seul re-render par geste ;
    // aucun re-render si rien n'a bougé, cf. garde d'égalité du commit).
    commitMapTransform();
    if (event && drag.moved) event.preventDefault();
  };

  const onStageWheel = (event) => {
    if (!canPanAndZoom) return;
    event.preventDefault();
    cancelVisitZoomAnim();
    markVisitInteracting();
    const stage = stageRef.current;
    const factor = wheelZoomScaleFactor(event, { containerClientHeight: stage?.clientHeight });
    zoomAroundClientPoint(event.clientX, event.clientY, factor);
    // Molette : commit débouncé (80 ms) en fin de rafale, comme useMapGestures.
    scheduleMapTransformCommit();
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
      startScale: mapTransformLiveRef.current.s,
      startX: mapTransformLiveRef.current.x,
      startY: mapTransformLiveRef.current.y,
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
    markVisitInteracting();
    const next = zoomVisitTransformToScale(
      { x: pinch.startX, y: pinch.startY, s: pinch.startScale },
      pinch.midX,
      pinch.midY,
      pinch.startScale * (dist / Math.max(1, pinch.dist)),
      rect,
    );
    // Frame de pinch : ref + style impératif sous rAF, sans re-render (commit en fin de pinch).
    setLiveMapTransform(next);
    event.preventDefault();
  };

  const onStageTouchEnd = () => {
    if (pinchRef.current.active) {
      pinchRef.current.active = false;
      // Fin de pinch : le rendu React se resynchronise sur la valeur vive.
      commitMapTransform();
    }
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
          <ImageLightbox
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
                      title={helpVisit.title}
                      entries={helpVisit.items}
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
                  ref={visitWorldRef}
                  className="visit-map-world"
                  style={{
                    transform: `translate(${mapTransform.x}px, ${mapTransform.y}px) scale(${mapTransform.s})`,
                  }}
                >
                  <div
                    className="visit-map-fit-layer"
                    style={{
                      // Toujours aligner le calque (image + SVG zones + repères + mascotte) sur le
                      // rectangle réel de l'image « object-fit:contain » — y compris en plein écran,
                      // sinon le SVG (preserveAspectRatio="none") et les % s'étirent sur toute la
                      // scène letterboxée et ne suivent plus la taille du fond de carte.
                      ...(visitMapFit.width > 0 && visitMapFit.height > 0
                        ? {
                            left: visitMapFit.offsetX,
                            top: visitMapFit.offsetY,
                            width: visitMapFit.width,
                            height: visitMapFit.height,
                          }
                        : { left: 0, top: 0, width: '100%', height: '100%' }),
                      '--map-overlay-scale': visitZoneSvgTypography.overlayScale,
                    }}
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

                    <VisitZonesSvgLayer
                      zones={content.zones}
                      seen={seen}
                      markerEmojis={markerEmojis}
                      typography={visitZoneSvgTypography}
                      fitWidth={visitMapFit.width}
                      fitHeight={visitMapFit.height}
                      mode={mode}
                      drawPoints={drawPoints}
                      onZoneClick={onVisitZoneClick}
                    />

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
                        onMascotTap={onMascotTap}
                      />
                    ) : null}

                    <VisitMarkersLayer
                      markers={content.markers}
                      seen={seen}
                      onMarkerClick={onVisitMarkerClick}
                    />
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
