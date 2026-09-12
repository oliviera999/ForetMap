import React, {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import { resolveMapOverlayLabelLayout } from '../utils/mapOverlayZoneLabels.js';
import {
  resolveMapOverlayTypography,
  resolveMapOverlayCssVariables,
} from '../utils/mapOverlayTypography';
import { useMapOverlayTextSizePreference } from '../hooks/useMapOverlayTextSizePreference.js';
import { MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX } from '../shared/mapOverlayScale.js';
import { fetchTutorialReadIds } from './TutorialReadAcknowledge';
import {
  TutorialPreviewModal,
  tutorialPreviewPayload,
  tutorialPreviewCanEmbed,
} from './TutorialPreviewModal';
import { useOverlayHistoryBack } from '../shared/platform/useOverlayHistoryBack';
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
import { MapRoutePicker } from '../shared/map-routes/MapRoutePicker.jsx';
import { MapRouteBar } from '../shared/map-routes/MapRouteBar.jsx';
import { useMapRouteMode } from '../shared/map-routes/useMapRouteMode.js';
import { placesFromZonesAndMarkers } from '../shared/map-routes/mapRouteSteps.js';
import {
  shouldShowVisitMapMascot as computeShowVisitMapMascot,
  getVisitMascotVisibilityReason,
} from '../utils/visitMascotVisibility.js';
import { usePctMapViewport } from '../shared/pct-map/usePctMapViewport.js';
import { useMapPosition } from '../shared/pct-map/useMapPosition.js';
import { useHeadingUpPreference } from '../shared/pct-map/useHeadingUpPreference.js';
import { headingUpOrientationDeg } from '../shared/pct-map/pctMapOrientation.js';
import { PctPositionLayer } from '../shared/pct-map/PctPositionLayer.jsx';
import { accuracyHaloDiameterPx } from '../shared/pct-map/positionGeometry.js';
import { useMapFullscreen } from '../shared/hooks/useMapFullscreen.js';
import { usePrefersReducedMotion } from '../shared/hooks/usePrefersReducedMotion.js';
import { MapFullscreenShell } from '../shared/components/MapFullscreenShell.jsx';
import { VisitMapMascot } from './VisitMapMascot.jsx';
import { usePublicSettings } from '../contexts/PublicSettingsContext.jsx';
import { useSession } from '../contexts/SessionContext.jsx';
import { DataProvider, useData } from '../contexts/DataContext.jsx';
import { useGlossaryLinkIndex } from '../hooks/useGlossaryLinkIndex.js';
import { useVisitPlantCatalog } from '../hooks/useVisitPlantCatalog.js';

import { VISIT_MASCOT_INTERACTION_EVENT } from '../utils/visitMascotInteractionEvents.js';
import {
  computeVisitCartographyProgress,
  buildVisitNetworkStatusLabel,
} from '../utils/visitViewStatus.js';
import { useVisitContent } from '../hooks/useVisitContent.js';
import { useVisitSeenSync } from '../hooks/useVisitSeenSync.js';
import { useVisitMapMascotController } from '../hooks/useVisitMapMascotController.js';
// Import direct (même défaut useOverlayHistory=false que l'ancien wrapper Lightbox
// de map-views) : évite de tirer tout le graphe carte dans le chunk visite.
import { ImageLightbox } from '../shared/components/ImageLightbox.jsx';
import {
  safeLocalStorageGetItem,
  safeLocalStorageSetItem,
} from '../shared/platform/browserStorage.js';
import { useAppDialogs } from '../shared/components/AppDialogsProvider.jsx';
import { IconVisit } from '../shared/icons.jsx';

/**
 * Fiche rapide d'un terme du glossaire et fiche espèce : chargées à la demande.
 *
 * En visite **connectée**, l'application monte déjà ces deux surfaces à sa racine
 * (`App.jsx`) et la visite ne fait que remonter l'intention (`onOpenGlossaryTerm`,
 * `onOpenPlantCatalogPreview`). En visite **invitée**, cette racine n'existe pas : la vue
 * les monte elle-même, sans alourdir le chunk visite de ceux qui n'ouvrent aucune fiche.
 */
const GlossaryPopoverLazy = lazy(() =>
  import('./pedago/GlossaryPopover.jsx').then((m) => ({ default: m.GlossaryPopover })),
);
const PlantCatalogPreviewModalLazy = lazy(() =>
  import('./biodiv/PlantCatalogPreview.jsx').then((m) => ({
    default: m.PlantCatalogPreviewModal,
  })),
);

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
  /** Fiche rapide du glossaire montée par l'app (absente en visite invitée). */
  onOpenGlossaryTerm = null,
  profileVisitMascotId = null,
  onPersistVisitMascotId = null,
  requireGuestMascotChoice = false,
  onGuestMascotChoiceDone = null,
}) {
  const publicSettings = usePublicSettings();
  const { prompt, notify } = useAppDialogs();
  const { isN3Affiliated = false, canParticipateContextComments = true } = useSession();
  const { tasks = [], plants: contextPlants = [] } = useData();
  /** Catalogue biodiversité : contexte de données, ou route publique en visite invitée. */
  const { plants, ensurePlantCatalog } = useVisitPlantCatalog(contextPlants);
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
  const {
    maps,
    content,
    loading,
    initialLoading,
    loadData,
    selected,
    setSelected,
    selectedType,
    setSelectedType,
  } = useVisitContent({
    mapId,
    setMapId,
    onForceLogout,
    onProgressLoaded: onVisitProgressLoaded,
  });
  /** Fiche glossaire / fiche espèce ouvertes par la visite elle-même (mode invité). */
  const [guestGlossaryCode, setGuestGlossaryCode] = useState(null);
  const [guestPlantPreview, setGuestPlantPreview] = useState(null);

  /**
   * Termes du glossaire hyperliés dans les textes du lieu ouvert. L'index n'est demandé
   * qu'à la première ouverture d'un lieu (une requête par session, mémoïsée) : une carte
   * seulement survolée ne le charge pas.
   */
  const glossaryItems = useGlossaryLinkIndex({ enabled: !!selected });

  /** Ouverture d'un terme : remontée à l'app si elle porte la fiche, sinon fiche locale. */
  const openGlossaryTermFromVisit = useCallback(
    (code) => {
      const next = String(code || '').trim();
      if (!next) return;
      if (onOpenGlossaryTerm) onOpenGlossaryTerm(next);
      else setGuestGlossaryCode(next);
    },
    [onOpenGlossaryTerm],
  );

  /** Ouverture d'une fiche espèce : idem — modale de l'app, ou modale locale en invité. */
  const openPlantFromVisit = useCallback(
    (plantId) => {
      if (onOpenPlantCatalogPreview) {
        onOpenPlantCatalogPreview(plantId);
        return;
      }
      const id = Number(plantId);
      if (!Number.isFinite(id) || id <= 0) return;
      const plant = (plants || []).find((p) => Number(p.id) === id);
      if (plant) setGuestPlantPreview(plant);
    },
    [onOpenPlantCatalogPreview, plants],
  );

  /** Le lieu ouvert porte des espèces : le catalogue devient nécessaire (invité). */
  const selectedHasSpecies = !!(
    selected &&
    ((Array.isArray(selected.species) && selected.species.length > 0) ||
      (Array.isArray(selected.living_beings_list) && selected.living_beings_list.length > 0))
  );
  useEffect(() => {
    if (selectedHasSpecies) ensurePlantCatalog();
  }, [selectedHasSpecies, ensurePlantCatalog]);

  /**
   * Données lues par la fiche espèce locale : zones et repères **du contenu de visite**
   * (ils portent `living_beings_list` et leur géométrie), pour que le bloc « Sur la carte »
   * de la fiche fonctionne aussi sans session.
   */
  const guestPlantPreviewData = useMemo(
    () => ({ zones: content.zones || [], markers: content.markers || [], plants }),
    [content.zones, content.markers, plants],
  );

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
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const {
    percent: mapTextSizePercent,
    label: mapTextSizeLabel,
    cycle: cycleMapTextSize,
  } = useMapOverlayTextSizePreference();
  useEffect(() => {
    const media = window.matchMedia('(pointer: coarse)');
    const update = () => setIsCoarsePointer(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const prefersReducedMotion = usePrefersReducedMotion();
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
  const canPanAndZoom = mode === 'view';
  /**
   * Moteur de carte partagé (lot 2) en mode « scène » : le calque monde mesure la scène, l'image
   * est en `object-fit: contain` dans le calque « fit » (`visitMapFit`). Le moteur porte pan,
   * molette, pinch + déplacement, double-tap, inertie et bornes : à l'échelle ≥ 1 les bornes sont
   * celles de l'ancien `visitMapTransform.js` (jamais de bord visible) ; le dézoom est désormais
   * possible jusqu'à 0,5× (plan centré dans le cadre). Pendant un geste la valeur vit dans
   * `mapTransformLiveRef` (aucun re-render) ; `mapTransform` (état) n'est resynchronisé qu'en
   * fin de geste.
   */
  const isVisitGestureTarget = useCallback(
    (target) => Boolean(target?.closest?.('.visit-map-controls')),
    [],
  );
  const visitPositionNotifyRef = useRef(null);
  const {
    containerRef: stageRef,
    worldRef: visitWorldRef,
    imgRef,
    committed: mapTransform,
    imgSize: visitImgNatural,
    fitRect: visitMapFit,
    consumeSkipClick,
    fitMap,
    fitMapAnimated,
    zoomBy,
    toImagePct,
    touchAction: visitStageTouchAction,
    focusOnPct,
    setMapOrientation,
    orientStyle,
  } = usePctMapViewport({
    imageSrc: visitMapImageSrc,
    contentMode: 'stage',
    enabled: canPanAndZoom,
    onResize: 'clamp',
    resetKey: mapId,
    isGestureTarget: isVisitGestureTarget,
    onGestureStart: () => visitPositionNotifyRef.current?.(),
  });

  const routePlaces = useMemo(
    () => placesFromZonesAndMarkers(content.zones || [], content.markers || []),
    [content.zones, content.markers],
  );
  const onRouteStepPlace = useCallback(
    (entry) => {
      if (!entry?.place) return;
      const place = entry.place;
      if (place.kind === 'zone') {
        setSelected(place);
        setSelectedType('zone');
        const c = visitZoneCentroidPct(place);
        if (c) focusOnPct({ xp: c.xp, yp: c.yp });
      } else {
        setSelected(place);
        setSelectedType('marker');
        if (Number.isFinite(Number(place.x_pct)) && Number.isFinite(Number(place.y_pct))) {
          focusOnPct({ xp: Number(place.x_pct), yp: Number(place.y_pct) });
        }
      }
    },
    [setSelected, setSelectedType, focusOnPct],
  );
  const onRouteExitExtra = useCallback(() => {
    setSelected(null);
    setSelectedType(null);
  }, [setSelected, setSelectedType]);
  const {
    activeRoute,
    routeSteps,
    routeIndex,
    routePickerOpen,
    setRoutePickerOpen,
    resumableRouteSlug,
    startRoute,
    exitRoute,
    resumeRoute,
    goToRouteIndex,
    resetForMapChange,
  } = useMapRouteMode({
    routes: content.routes || [],
    places: routePlaces,
    onStepPlace: onRouteStepPlace,
    onExitExtra: onRouteExitExtra,
  });
  useEffect(() => {
    resetForMapChange();
  }, [mapId, resetForMapChange]);

  const visitPosition = useMapPosition({
    georef: currentMap?.georef ?? null,
    gpsEnabled: !!currentMap?.gps_enabled && mode === 'view',
  });
  visitPositionNotifyRef.current = visitPosition.notifyManualPan;
  const visitHeadingUpAllowed =
    !!publicSettings?.visit?.heading_up_enabled &&
    !!currentMap?.heading_up_enabled &&
    !!visitPosition.available &&
    mode === 'view';
  const visitHeadingUpPref = useHeadingUpPreference({
    storageKey: 'visit:heading-up',
    allowed: visitHeadingUpAllowed,
  });
  const visitHeadingUpEffective = visitHeadingUpPref.effective && visitPosition.active;

  useEffect(() => {
    if (!visitHeadingUpEffective) {
      setMapOrientation({ deg: 0, originPct: null });
      return;
    }
    const heading =
      visitPosition.smoothedScreenHeadingDeg ?? visitPosition.screenHeadingDeg ?? null;
    setMapOrientation({
      deg: headingUpOrientationDeg(heading),
      originPct: visitPosition.displayPct || null,
    });
  }, [
    visitHeadingUpEffective,
    visitPosition.displayPct?.xp,
    visitPosition.displayPct?.yp,
    visitPosition.smoothedScreenHeadingDeg,
    visitPosition.screenHeadingDeg,
    setMapOrientation,
  ]);

  const visitFollowPct = visitPosition.following ? visitPosition.displayPct : null;
  useEffect(() => {
    if (!visitFollowPct) return;
    focusOnPct({ xp: visitFollowPct.xp, yp: visitFollowPct.yp });
  }, [visitFollowPct, focusOnPct]);
  const visitMapImageReady = visitImgNatural.w > 1 && visitImgNatural.h > 1;
  /** Rect « contain » courant en lecture impérative (contrôleur de la mascotte). */
  const visitMapFitRef = useRef(visitMapFit);
  visitMapFitRef.current = visitMapFit;

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
    onPersistVisitMascotId,
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
    const typoOpts = {
      worldScale,
      fitWidthPx: fw,
      isCoarsePointer,
      userTextSizePercent: mapTextSizePercent,
      // Les repères Visite vivent dans le calque zoomé : même compensation que les zones.
      compensateWorldScale: true,
    };
    const t = resolveMapOverlayTypography(mapSettings, fitH, typoOpts);
    const inv = 1 / worldScale;
    const labelLayout = resolveMapOverlayLabelLayout(mapSettings, { inv, isCoarsePointer });
    const overlayCssVars = resolveMapOverlayCssVariables(mapSettings, fitH, typoOpts);
    return {
      emojiU: t.mapEmojiFontPx * uPerPx,
      labelU: t.mapLabelFontPx * uPerPx,
      gapU: t.mapEmojiLabelCenterGap * uPerPx,
      strokeU: Math.max(0.06, (3 / worldScale) * uPerPx),
      labelFontPx: t.mapLabelFontPx,
      emojiFontPx: t.mapEmojiFontPx,
      minSideFactor: labelLayout.minSideFactor,
      labelMaxWorldLength: labelLayout.maxWorldLength,
      labelMaxTextLengthU: labelLayout.maxWorldLength * uPerPx,
      inv,
      overlayCssVars,
    };
  }, [
    publicSettings,
    visitMapFit.width,
    visitMapFit.height,
    mapTransform.s,
    isCoarsePointer,
    mapTextSizePercent,
  ]);

  /** Clic zone (calque SVG mémoïsé) : identité stable hors changement de `mode`. */
  const onVisitZoneClick = useCallback(
    (z, event) => {
      event.stopPropagation();
      if (activeRoute) return;
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
      activeRoute,
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
      if (activeRoute) return;
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
      activeRoute,
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

  // Changement de carte : le moteur réajuste la vue (`resetKey`), la vue repasse en consultation.
  useEffect(() => {
    setDrawPoints([]);
    setMode('view');
  }, [mapId]);

  // Immersion (plein écran) : réajustement une fois le portail posé (double rAF, comme avant).
  useLayoutEffect(() => {
    if (!visitImmersion) return undefined;
    fitMap();
    let innerRaf = null;
    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(() => fitMap());
    });
    return () => {
      cancelAnimationFrame(outerRaf);
      if (innerRaf != null) cancelAnimationFrame(innerRaf);
    };
  }, [visitImmersion, fitMap]);

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
    const name = await prompt({ message: 'Titre de la zone de visite ?', required: true });
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
      else notify(err.message || 'Erreur création zone');
    } finally {
      setCreating(false);
    }
  };

  const onMapClick = async (event) => {
    if (consumeSkipClick()) return;
    if (!visitMapImageReady) return;
    const p = toImagePct(event.clientX, event.clientY, { clamp: true, decimals: 2 });
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
      const label = await prompt({ message: 'Titre du repère de visite ?', required: true });
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
        else notify(err.message || 'Erreur création repère');
      } finally {
        setCreating(false);
      }
    }
  };

  /**
   * Échap sur le panneau détail : géré par `useDialogA11y` côté `VisitDetailPanel` (avec le
   * piège de focus). La garde reste ici — une lightbox ou un aperçu de tutoriel ouvert
   * par-dessus doit se fermer seul, sans emporter le panneau.
   */
  const onRequestCloseVisitSelection = useCallback(() => {
    if (visitMediaLightbox || visitTutorialPreview) return;
    closeVisitSelection();
  }, [visitMediaLightbox, visitTutorialPreview, closeVisitSelection]);

  // Loader plein écran réservé au **premier** chargement : les rechargements (changement de
  // carte, sauvegarde prof via `onSaved`) gardent la carte à l'écran et n'affichent qu'un
  // indicateur discret — auparavant la vue entière disparaissait à chaque enregistrement.
  if (initialLoading) {
    return (
      <div className="loader">
        <div className="loader-leaf">
          <IconVisit size={48} />
        </div>
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
        {guestGlossaryCode ? (
          <Suspense fallback={null}>
            <GlossaryPopoverLazy
              open
              glossaryCode={guestGlossaryCode}
              onClose={() => setGuestGlossaryCode(null)}
              showFullGlossaryLink={false}
            />
          </Suspense>
        ) : null}
        {guestPlantPreview ? (
          <Suspense fallback={null}>
            <DataProvider value={guestPlantPreviewData}>
              <PlantCatalogPreviewModalLazy
                plant={guestPlantPreview}
                maps={maps}
                onClose={() => setGuestPlantPreview(null)}
                onForceLogout={onForceLogout}
                onOpenPlant={openPlantFromVisit}
                onOpenGlossaryTerm={openGlossaryTermFromVisit}
              />
            </DataProvider>
          </Suspense>
        ) : null}
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
                onOpenPresentation={() =>
                  setVisitTutorialPreview(tutorialPreviewPayload(visitPresentationTutorial))
                }
                refreshing={loading}
                networkStatusLabel={mode === 'view' ? visitNetworkStatusLabel : null}
                isOnline={isOnline}
                syncStatus={syncStatus}
                pendingSyncCount={pendingSyncCount}
                visitImmersion={visitImmersion}
                onToggleImmersion={toggleVisitImmersion}
                mapTextSizeLabel={mapTextSizeLabel}
                onCycleMapTextSize={cycleMapTextSize}
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
                routesSlot={
                  <MapRoutePicker
                    routes={content.routes || []}
                    open={routePickerOpen}
                    onToggle={setRoutePickerOpen}
                    onStart={startRoute}
                  />
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
                  touchAction: visitStageTouchAction,
                }}
              >
                <div ref={visitWorldRef} className="visit-map-world">
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
                      ...visitZoneSvgTypography.overlayCssVars,
                      ...(orientStyle || {}),
                    }}
                  >
                    <img
                      ref={imgRef}
                      src={visitMapImageSrc}
                      alt={`Plan ${currentMap?.label || 'Forêt'}`}
                      className="visit-map-img"
                      draggable={false}
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
                      selectedZoneId={selected && selectedType === 'zone' ? selected.id : null}
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
                    {visitPosition.displayPct ? (
                      <PctPositionLayer
                        position={visitPosition.displayPct}
                        haloPx={accuracyHaloDiameterPx(visitPosition.haloPct, visitMapFit.width)}
                        headingDeg={visitHeadingUpEffective ? null : visitPosition.screenHeadingDeg}
                        accuracyM={visitPosition.accuracyM}
                      />
                    ) : null}
                  </div>
                </div>
                <VisitMapZoomControls
                  onZoomIn={() => zoomBy(1.2)}
                  onZoomOut={() => zoomBy(0.84)}
                  onReset={fitMapAnimated}
                  position={visitPosition}
                  headingUpAllowed={visitHeadingUpAllowed}
                  headingUpEffective={visitHeadingUpEffective}
                  headingUpUserEnabled={visitHeadingUpPref.userEnabled}
                  onHeadingUpToggle={() =>
                    visitHeadingUpPref.setEnabled(!visitHeadingUpPref.userEnabled)
                  }
                />
                {!activeRoute && resumableRouteSlug ? (
                  <div className="map-route-resume">
                    <button
                      type="button"
                      className="btn btn-sm btn-primary map-route-resume__btn"
                      onClick={resumeRoute}
                    >
                      Reprendre le parcours
                    </button>
                  </div>
                ) : null}
                {activeRoute ? (
                  <MapRouteBar
                    route={activeRoute}
                    steps={routeSteps}
                    index={routeIndex}
                    onGoToIndex={goToRouteIndex}
                    onExit={exitRoute}
                    canLocate={!!visitPosition.available}
                    hintManual="Le lieu est mis en avant sur la carte. Avance puis Suivant."
                  />
                ) : null}
              </div>
              {!selected && !activeRoute ? (
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
            onRequestClose={onRequestCloseVisitSelection}
            comfortableReading={comfortableReading}
            onToggleComfortableReading={() => setComfortableReading((v) => !v)}
            onOpenLightbox={setVisitMediaLightbox}
            onOpenTutorialPreview={setVisitTutorialPreview}
            seen={seen}
            savingSeen={savingSeen}
            onToggleSeen={onToggleSeen}
            plants={plants}
            onOpenPlantCatalogPreview={openPlantFromVisit}
            glossaryItems={glossaryItems}
            onOpenGlossaryTerm={openGlossaryTermFromVisit}
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
