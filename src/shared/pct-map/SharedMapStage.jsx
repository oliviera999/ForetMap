import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { headingUpOrientationDeg, HEADING_UP_COVER_SCALE } from './pctMapOrientation.js';
import { MapScaleCompassOverlay } from './MapScaleCompassOverlay.jsx';

import { MapActionButton } from '../ui/MapActionButton.jsx';
import { PctClusterLayer } from './PctClusterLayer.jsx';
import { PctImageLayer } from './PctImageLayer.jsx';
import { PctMarkerButton, PctMarkersLayer } from './PctMarkersLayer.jsx';
import { PctZonesLayer } from './PctZonesLayer.jsx';
import { PctStatusDotsLayer, statusDotsLabel } from './PctStatusDotsLayer.jsx';
import { parsePctPolygonPoints } from './pctPolygon.js';
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
  contentAspect,
  labelKey,
  markerObstaclesFrom,
  resolveLabelLayout,
  resolveOverlayLabelSizesPx,
  zoneLabelAnchorPct,
  zoneLabelMaxWidthPx,
  zoneLabelSideExtraWidthPx,
} from './pctMapLabels.js';
import { PctPositionLayer } from './PctPositionLayer.jsx';
import { PctRouteBadges, PctRouteLines } from './PctRouteLayer.jsx';
import { accuracyHaloDiameterPx } from './positionGeometry.js';
import {
  hasWalkedFrom,
  routeCameraPlan,
  routeCameraView,
  routeStepPoints,
} from '../map-routes/routeGeometry.js';
import { ROUTE_SETTINGS_DEFAULTS } from '../map-routes/routeSettings.js';
import { shouldIgnorePctMapBackgroundClick } from './pctMapBackgroundClick.js';

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
 * @param {object|null} [props.route] parcours en cours : `{ slug, phase: 'overview'|'steps',
 *   steps, currentIndex, currentPlaceKey, settings }` (`settings` : `resolveRouteSettings`).
 *   Présent, il dessine le tracé fléché et ses pastilles, et pilote la caméra guidée.
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
 * @param {(zoneOrMarker: object) => boolean} [props.getDiscoverHalo]
 * @param {(zone: object) => Array<object>|null} [props.getZoneStatusDots] pastilles d'état d'une
 *   zone (voir `PctStatusDotsLayer`) — ForetMap y pose l'état des tâches du lieu.
 * @param {(marker: object) => Array<object>|null} [props.getMarkerStatusDots] idem, pour un repère.
 * @param {(markers: Array<object>) => Array<object>|null} [props.mergeStatusDots] pastilles d'un
 *   **groupe** de repères à partir de ses membres : c'est le produit qui sait agréger (pour
 *   ForetMap, l'état de tâche le plus actionnable du groupe). Omise, un groupe reste sans
 *   pastille.
 * @param {boolean} [props.clusteringEnabled]
 * @param {boolean} [props.applyZoomOnlyCategories]
 * @param {boolean} [props.showLabels=true] afficher les noms (sinon : emojis de zone seuls)
 * @param {string} [props.highlightBadge] texte de la pastille accolée aux lieux **mis en
 *   avant** (`map_highlight`, plan e-nov) ; vide = pas de pastille, le halo seul les signale.
 * @param {string} [props.highlightLabel] complément du nom accessible d'un lieu mis en avant
 *   (« Innovation e-nov ») : le halo ne se voit pas au lecteur d'écran.
 * @param {boolean} [props.labelsClickable=false] l'étiquette d'une zone est aussi une cible
 *   tactile pour cette zone (petits polygones : voir `PctLabelsLayer`)
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
  route = null,
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
  getDiscoverHalo = null,
  getZoneStatusDots = null,
  getMarkerStatusDots = null,
  mergeStatusDots = null,
  clusteringEnabled = true,
  applyZoomOnlyCategories = true,
  /** Afficher les noms (zones via `PctLabelsLayer`, repères via pastilles). */
  showLabels = true,
  /** L'étiquette d'une zone vaut cible tactile pour cette zone (audit navigation Plan, N12). */
  labelsClickable = false,
  /** Pastille des lieux mis en avant (`map_highlight`) ; vide = halo seul. */
  highlightBadge = '',
  /** Complément du nom accessible d'un lieu mis en avant. */
  highlightLabel = '',
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
  /** Vue restituée au montage (retour d'un mode d'édition) au lieu de la carte entière. */
  initialView = null,
}) {
  const imageSrc = String(map?.map_image_url || '');
  const headingUpEffectiveRef = useRef(headingUpEffective);
  headingUpEffectiveRef.current = headingUpEffective;
  const positionRef = useRef(position);
  positionRef.current = position;
  const stickCameraRef = useRef(() => {});

  /**
   * Caméra de parcours rendue à la main : un geste sur la carte (ou un bouton de zoom) l'arrête,
   * pour que la personne puisse regarder ailleurs sans que la vue la ramène aussitôt. Elle
   * reprend à l'étape suivante, au retour à la vue d'ensemble, ou sur « Me situer ».
   */
  const [routeCameraReleased, setRouteCameraReleased] = useState(false);
  const routeActiveRef = useRef(false);
  routeActiveRef.current = !!route;
  const releaseRouteCamera = useCallback(() => {
    if (routeActiveRef.current) setRouteCameraReleased(true);
  }, []);

  const viewport = usePctMapViewport({
    imageSrc,
    contentMode: 'stage',
    enabled: gesturesEnabled,
    onResize: 'clamp',
    resetKey: String(map?.id || ''),
    initialView,
    isGestureTarget: gestureIgnoreSelector,
    // Ce qui recouvre le bas de l'écran (feuille basse, barre d'étape) : la carte peut y
    // glisser, sinon un lieu du bas du plan ne peut jamais monter dans la bande visible
    // (`docs/AUDIT_PLAN_NAVIGATION_2026-09-16-bis.md` B2).
    viewportInsets: focusInsets,
    // Hors orientation : un pan manuel quitte le suivi. Avec orientation active, on
    // recolle le GPS au centre en fin de geste (évite le fond vide après rotation).
    onGestureStart: () => {
      if (!headingUpEffectiveRef.current) {
        positionRef.current?.notifyManualPan?.();
      }
      releaseRouteCamera();
    },
    onGestureEnd: () => {
      if (headingUpEffectiveRef.current) stickCameraRef.current();
    },
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
    followPct,
    consumeSkipClick,
    toImagePct,
    getViewSnapshot,
    touchAction,
    setMapOrientation,
    mapOrientation,
    orientStyle,
  } = viewport;

  const committedSRef = useRef(committed.s);
  committedSRef.current = committed.s;
  const fitScaleRef = useRef(fitScale);
  fitScaleRef.current = fitScale;

  stickCameraRef.current = () => {
    const pct = positionRef.current?.displayPct;
    if (!pct || !headingUpEffectiveRef.current) return;
    const minS = (fitScaleRef.current || 1) * HEADING_UP_COVER_SCALE;
    followPct({ xp: pct.xp, yp: pct.yp }, { targetScale: Math.max(committedSRef.current, minS) });
  };

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
      getViewSnapshot,
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
    getViewSnapshot,
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
      // Un lieu mis en avant se voit dès la vue d'ensemble : c'est tout son objet.
      if (place?.map_highlight === true) return true;
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

  const labelAspect = contentAspect(fitRect.width, fitRect.height);
  const zoneLabelSpecs = useMemo(
    () => buildZoneLabelSpecs(visibleZones, splitNameEmoji, { aspect: labelAspect }),
    [visibleZones, splitNameEmoji, labelAspect],
  );

  const zoneStatusLabelOf = useCallback(
    (zone) =>
      typeof getZoneStatusDots === 'function' ? statusDotsLabel(getZoneStatusDots(zone)) : '',
    [getZoneStatusDots],
  );

  const markerStatusDotsById = useMemo(() => {
    const byId = new Map();
    if (typeof getMarkerStatusDots !== 'function') return byId;
    for (const marker of visibleMarkers) {
      const dots = getMarkerStatusDots(marker);
      if (dots && dots.length) byId.set(String(marker.id), dots);
    }
    return byId;
  }, [visibleMarkers, getMarkerStatusDots]);

  const markerStatusDotsOf = useCallback(
    (marker) => markerStatusDotsById.get(String(marker?.id)) || null,
    [markerStatusDotsById],
  );

  /**
   * Pastilles d'un groupe : sans elles, l'état des repères regroupés disparaissait au dézoom,
   * donc dès l'arrivée sur la carte. L'agrégation appartient au produit (`mergeStatusDots`).
   */
  const clusterStatusDotsOf = useCallback(
    (cluster) =>
      typeof mergeStatusDots === 'function' ? mergeStatusDots(cluster?.markers || []) : null,
    [mergeStatusDots],
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
            // Le repère mis en avant reste visible individuellement (G3).
            keepApartId: selectedPlace?.kind === 'marker' ? String(selectedPlace.id) : '',
          })
        : [],
    [
      clusteringEnabled,
      visibleMarkers,
      fitRect.width,
      fitRect.height,
      committed.s,
      categoriesById,
      selectedPlace,
    ],
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
      // `.fm-pct-zone` (groupe), pas `.fm-pct-zones` (SVG plein cadre) — sinon le fond
      // libre ne déplace plus la mascotte.
      if (shouldIgnorePctMapBackgroundClick(event.target)) return;
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
  // Angle **continu** (`screenHeadingUnwrappedDeg`) : la transition CSS du calque doit prendre
  // le chemin le plus court, et non faire un tour complet au passage de 359° à 1°.
  const headingForMapDeg =
    position?.screenHeadingUnwrappedDeg ??
    position?.smoothedScreenHeadingDeg ??
    position?.screenHeadingDeg ??
    null;
  const targetOrientationDeg = headingUpEffective ? headingUpOrientationDeg(headingForMapDeg) : 0;
  /**
   * Angle **réellement appliqué** au calque. Tout ce qui doit rester aligné dessus (la
   * contre-rotation des habillages via `--pct-orient`, le placement des étiquettes, la rose des
   * vents) le lit ici, et non sur l'angle calculé au rendu : ce dernier est poussé dans le
   * moteur de vue par un effet, donc un rendu plus tôt. Tant que la rotation était instantanée,
   * cette avance d'une image ne se voyait pas ; depuis qu'elle est animée, elle faisait pencher
   * tout le texte pendant la rotation.
   */
  const mapOrientationDeg = mapOrientation?.deg || 0;
  useEffect(() => {
    if (!headingUpEffective) {
      setMapOrientation({ deg: 0, originPct: null });
      return;
    }
    setMapOrientation({ deg: targetOrientationDeg, originPct: orientPivot });
  }, [
    headingUpEffective,
    orientPivot?.xp,
    orientPivot?.yp,
    targetOrientationDeg,
    setMapOrientation,
  ]);

  /* ---- Parcours : tracé, étape courante, caméra guidée ------------------------------------ */
  const routeSettings = route?.settings || ROUTE_SETTINGS_DEFAULTS;
  const routePhase = route?.phase === 'overview' ? 'overview' : 'steps';
  const routeIndex = Number(route?.currentIndex) || 0;
  const routeSteps = route?.steps;
  const routePoints = useMemo(() => (routeSteps ? routeStepPoints(routeSteps) : []), [routeSteps]);
  const routeKey = route ? `${route.slug || ''}:${routePhase}:${routeIndex}` : '';
  const routeGuideTo = route && routePhase === 'steps' ? targetPct : null;
  useEffect(() => {
    setRouteCameraReleased(false);
  }, [routeKey]);
  /**
   * La caméra guidée mène la vue tant que personne ne l'a reprise en main. L'orientation selon
   * la boussole garde la priorité : elle colle déjà la carte à la personne. En étape, la caméra
   * se désactive par réglage (`ui.routes.camera_enabled`) ; la vue d'ensemble, elle, cadre
   * toujours le tracé — sans cela, elle ne montrerait rien de plus que la carte.
   */
  const routeCameraOn =
    !!route &&
    !routeCameraReleased &&
    !headingUpEffective &&
    (routePhase === 'overview' || routeSettings.cameraEnabled);

  /**
   * Marche détectée : la personne s'est éloignée de plus de `walkingTriggerM` de l'endroit où
   * elle se trouvait au début de l'étape. On passe alors du cadrage « position + étape » au
   * zoom de marche, centré sur elle et ouvert vers l'étape.
   */
  const routePositionPct = position?.displayPct || null;
  const walkStartRef = useRef({ key: '', pct: null });
  const [routeWalking, setRouteWalking] = useState(false);
  useEffect(() => {
    if (!route || routePhase !== 'steps') {
      walkStartRef.current = { key: '', pct: null };
      setRouteWalking(false);
      return;
    }
    if (walkStartRef.current.key !== routeKey) {
      walkStartRef.current = { key: routeKey, pct: routePositionPct };
      setRouteWalking(false);
      return;
    }
    if (!routePositionPct) return;
    if (!walkStartRef.current.pct) {
      walkStartRef.current.pct = routePositionPct;
      return;
    }
    if (
      hasWalkedFrom(
        walkStartRef.current.pct,
        routePositionPct,
        position?.planSize,
        routeSettings.walkingTriggerM,
      )
    ) {
      setRouteWalking(true);
    }
  }, [
    route,
    routePhase,
    routeKey,
    routePositionPct,
    position?.planSize,
    routeSettings.walkingTriggerM,
  ]);

  // Suivi de position : recentrage à chaque nouvelle position en mode « suivi ».
  // Orientation boussole : coller le GPS au centre + grossir assez pour couvrir le
  // viewport après rotation (√2), sinon le plan tourné laisse un fond vide.
  // Pendant un parcours, la caméra guidée fait déjà mieux que coller au point : elle suit en
  // gardant l'étape dans le champ.
  const stickPct = headingUpEffective
    ? position?.displayPct
    : position?.following && !routeCameraOn
      ? position.displayPct
      : null;
  useEffect(() => {
    if (!stickPct) return;
    if (headingUpEffective) {
      const minS = (fitScale || 1) * HEADING_UP_COVER_SCALE;
      followPct(
        { xp: stickPct.xp, yp: stickPct.yp },
        { targetScale: Math.max(committedSRef.current, minS) },
      );
      return;
    }
    followPct({ xp: stickPct.xp, yp: stickPct.yp });
  }, [stickPct?.xp, stickPct?.yp, headingUpEffective, fitScale, followPct]);

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
    // Le lieu de l'étape courante est cadré par la caméra de parcours, avec la position :
    // le centrer seul ici défairait ce cadrage.
    if (
      routeCameraOn &&
      route?.currentPlaceKey &&
      `${selectedPlace.kind}:${selectedPlace.id}` === route.currentPlaceKey
    ) {
      lastFocusedRef.current = key;
      return;
    }
    const pct = typeof focusPlacePct === 'function' ? focusPlacePct(selectedPlace) : null;
    if (!pct) return;
    lastFocusedRef.current = key;
    focusOnPct(pct, { insets: focusInsets });
  }, [
    selectedPlace,
    focusOnPct,
    focusInsets,
    focusInsetsKey,
    focusPlacePct,
    routeCameraOn,
    route?.currentPlaceKey,
  ]);

  /**
   * Caméra guidée : la décision (`routeCameraPlan`) devient une vue concrète pour cet écran
   * (`routeCameraView`), confiée au **suivi continu** du moteur de vue — qui la rejoint en
   * douceur et la borne aux limites du plan. Près d'un bord, la vue se cale donc sur le plan
   * plutôt que d'en montrer le vide, et la ligne à suivre reste dans le champ.
   */
  const routeCamera = useMemo(() => {
    if (!routeCameraOn) return null;
    const plan = routeCameraPlan({
      phase: routePhase,
      stepPoints: routePoints,
      currentIndex: routeIndex,
      positionPct: routePositionPct,
      targetPct: routeGuideTo,
      walking: routeWalking,
    });
    return routeCameraView(plan, {
      stage: stageSize,
      fitRect,
      insets: focusInsets,
      fitScale: fitScale || 1,
      walkingZoom: routeSettings.walkingZoom,
      lookahead: routeSettings.lookahead,
    });
  }, [
    routeCameraOn,
    routePhase,
    routePoints,
    routeIndex,
    routePositionPct,
    routeGuideTo,
    routeWalking,
    stageSize,
    fitRect,
    focusInsets,
    fitScale,
    routeSettings.walkingZoom,
    routeSettings.lookahead,
  ]);
  useEffect(() => {
    if (!routeCamera) return;
    followPct(routeCamera.centerPct, { targetScale: routeCamera.scale, insets: focusInsets });
    // `focusInsets` change d'identité à chaque rendu chez certains appelants : sa clé suffit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    routeCamera?.centerPct?.xp,
    routeCamera?.centerPct?.yp,
    routeCamera?.scale,
    followPct,
    focusInsetsKey,
  ]);

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
  /**
   * Des lieux sont-ils mis en avant (plan e-nov) ? La coquille le dit en CSS
   * (`has-highlight`) : les autres lieux s'estompent pour leur laisser le contraste.
   */
  const hasHighlight = useMemo(
    () =>
      (zones || []).some((zone) => zone?.map_highlight === true) ||
      (markers || []).some((marker) => marker?.map_highlight === true),
    [zones, markers],
  );
  const pinnedKey = selectedPlace ? labelKey(selectedPlace.kind, selectedPlace.id) : '';

  /**
   * Étiquettes : plus aucun seuil de zoom, plus aucun nom posé au hasard sur son voisin.
   * Tout nom est candidat à toute échelle, et le placement glouton par priorité décide de ce
   * qui tient (`pctMapLabels.js`). Comme les étiquettes gardent une taille constante à
   * l'écran (contre-échelle `--pct-inv` ci-dessous), zoomer écarte les ancres sans grossir
   * les boîtes : les noms masqués réapparaissent seuls.
   *
   * Les tailles mesurées sont celles **rendues** (variables CSS du produit : préférence « Aa »,
   * pointeur tactile), pas les valeurs par défaut du noyau.
   *
   * Les épingles et pastilles de groupe des repères sont des **obstacles** : une étiquette de
   * zone qui tomberait dessous essaie d'abord un autre point de sa zone ou un autre côté pour
   * son nom (`resolveLabelLayout`) — sans jamais disparaître à cause d'eux.
   */
  const {
    fontSizePx: labelFontPx,
    emojiSizePx: labelEmojiPx,
    nameGapPx: labelNameGapPx,
  } = useMemo(() => resolveOverlayLabelSizesPx(fitExtraStyle), [fitExtraStyle]);
  const markerObstacles = useMemo(
    () =>
      markerObstaclesFrom(clusteringEnabled ? clusters : visibleMarkers, {
        emojiSizePx: labelEmojiPx,
      }),
    [clusteringEnabled, clusters, visibleMarkers, labelEmojiPx],
  );
  const labelLayout = useMemo(
    () =>
      resolveLabelLayout({
        zoneSpecs: zoneLabelSpecs,
        markers: showLabels ? visibleMarkers : [],
        categoriesById,
        contentWidthPx: fitRect.width,
        contentHeightPx: fitRect.height,
        scale: committed.s,
        pinnedKey,
        fontSizePx: labelFontPx,
        emojiSizePx: labelEmojiPx,
        nameGapPx: labelNameGapPx,
        includeZoneNames: showLabels,
        // Étiquettes contre-tournées (N1) : leurs boîtes sont alignées sur l'écran, leurs
        // ancres non. Sans l'angle, deux noms qui ne se gênent pas au nord se recouvrent
        // dès que l'on pivote.
        orientationDeg: mapOrientationDeg,
        orientOriginPct: orientPivot,
        obstacles: markerObstacles,
      }),
    [
      zoneLabelSpecs,
      showLabels,
      visibleMarkers,
      categoriesById,
      fitRect.width,
      fitRect.height,
      committed.s,
      pinnedKey,
      labelFontPx,
      labelEmojiPx,
      labelNameGapPx,
      mapOrientationDeg,
      orientPivot?.xp,
      orientPivot?.yp,
      markerObstacles,
    ],
  );
  const visibleLabelKeys = labelLayout.visible;
  const labelPlacements = labelLayout.placements;

  /**
   * Pastilles d'état (ForetMap : tâches du lieu). Les zones portent les leurs dans un calque
   * HTML ancré au **même point que l'emoji** (point retenu par le placement), mais indépendant
   * de l'étiquette : une zone dont le nom est masqué garde sa pastille. Les pastilles
   * encadrent l'emoji (ou le nom, pour une zone sans emoji) sans le chevaucher (`variant`).
   */
  const zoneStatusAnchors = useMemo(() => {
    if (typeof getZoneStatusDots !== 'function') return [];
    const specById = new Map(zoneLabelSpecs.map((spec) => [spec.id, spec]));
    const anchors = [];
    for (const zone of visibleZones) {
      const dots = getZoneStatusDots(zone);
      if (!dots || !dots.length) continue;
      const spec = specById.get(String(zone.id));
      let anchor = labelPlacements.get(String(zone.id)) || spec?.anchor;
      if (!anchor) {
        const points = parsePctPolygonPoints(zone.points);
        if (points.length < 3) continue;
        anchor = zoneLabelAnchorPct(points, labelAspect);
      }
      anchors.push({
        id: labelKey('zone', zone.id),
        xp: anchor.xp,
        yp: anchor.yp,
        dots,
        variant: spec?.emoji ? 'emoji' : 'name',
      });
    }
    return anchors;
  }, [visibleZones, getZoneStatusDots, zoneLabelSpecs, labelPlacements, labelAspect]);
  /** Tap sur l'étiquette d'une zone → même effet qu'un tap sur son polygone (N12). */
  const onZoneLabelClick = useCallback(
    (zoneId) => {
      const zone = (visibleZones || []).find((z) => String(z.id) === String(zoneId));
      if (zone) onZoneClick(zone, null);
    },
    [visibleZones, onZoneClick],
  );

  /**
   * Emoji et nom sont résolus séparément (`zone-emoji:<id>` / `zone:<id>`) : dans deux petites
   * zones voisines, les emojis ne se superposent plus ; ils reviennent au zoom comme les noms.
   * Hors étiquettes (`showLabels=false`), seuls les emojis sont candidats.
   */
  const zoneLabels = useMemo(
    () =>
      zoneLabelSpecs
        .map((spec) => {
          const emoji = spec.emoji && visibleLabelKeys.has(spec.emojiKey) ? spec.emoji : '';
          const name = showLabels && visibleLabelKeys.has(spec.key) ? spec.name : '';
          if (!emoji && !name) return null;
          const placement = labelPlacements.get(spec.id);
          const nameSide = emoji && name ? placement?.nameSide || 'below' : '';
          return {
            id: spec.key,
            zoneId: spec.id,
            xp: placement ? placement.xp : spec.anchor.xp,
            yp: placement ? placement.yp : spec.anchor.yp,
            emoji,
            name,
            nameSide,
            maxWidthPx:
              zoneLabelMaxWidthPx(spec, fitRect.width, committed.s) +
              zoneLabelSideExtraWidthPx(nameSide, labelEmojiPx, labelNameGapPx),
            active: selectedZoneId != null && String(selectedZoneId) === spec.id,
            highlight: spec.zone?.map_highlight === true,
            badge: spec.zone?.map_highlight === true ? highlightBadge : '',
          };
        })
        .filter(Boolean),
    [
      showLabels,
      zoneLabelSpecs,
      visibleLabelKeys,
      labelPlacements,
      fitRect.width,
      committed.s,
      selectedZoneId,
      labelEmojiPx,
      labelNameGapPx,
      highlightBadge,
    ],
  );

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
        isDiscoverHalo={typeof getDiscoverHalo === 'function' ? !!getDiscoverHalo(marker) : false}
        statusDots={markerStatusDotsOf(marker)}
        onMarkerClick={onMarkerClick}
        labelOf={markerLabelOf}
        highlightBadge={highlightBadge}
        highlightLabel={highlightLabel}
      />
    ),
    [
      onMarkerClick,
      selectedMarkerId,
      markerLabelOf,
      getIsSeen,
      getDiscoverHalo,
      markerStatusDotsOf,
      highlightBadge,
      highlightLabel,
    ],
  );

  const tid = (suffix) => `${testIdPrefix}-${suffix}`;

  // Plan expose `geo_anchors` ; carte / Visite exposent `georef` (même charge utile).
  const mapGeoref = map?.geo_anchors || map?.georef || null;

  return (
    // Clic fond de carte (mascotte / édition Visite) : pas de rôle clavier dédié —
    // les lieux restent des boutons ; le fond n'est pas une commande primaire.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- canvas carte
    <div
      className={`${className}${hasHighlight ? ' has-highlight' : ''}`}
      ref={containerRef}
      style={{ touchAction }}
      onClick={handleBackgroundClick}
    >
      {/* Commandes avant le calque des lieux dans le DOM : posées en absolu avec leur propre
          `z-index`, elles restent au-dessus ; mais au clavier, elles venaient après les 44
          formes de la carte — il fallait traverser tout le plan pour atteindre « Voir tout le
          plan » (`docs/AUDIT_PLAN_NAVIGATION_UX_2026-09-16.md` N15). */}
      <div className={controlsClassName}>
        {position?.available ? (
          <MapActionButton
            tone={position.following ? 'primary' : 'display'}
            icon={POSITION_ICONS[position.mode] || POSITION_ICONS.off}
            label={positionLabels[position.mode] || positionLabels.off}
            testId={tid('locate')}
            active={position.active}
            ariaPressed={position.active}
            onClick={() => {
              // Pendant un parcours, « Me situer » rend aussi la main à la caméra guidée.
              setRouteCameraReleased(false);
              (onLocateToggle || position.toggle)();
            }}
          />
        ) : null}
        {headingUpAllowed && position?.available && position?.active ? (
          <MapActionButton
            tone={headingUpEffective ? 'primary' : 'display'}
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
            onClick={() => {
              // Activer l'orientation : passer en suivi pour coller le GPS au centre.
              if (!headingUpEffective) position?.ensureFollow?.();
              onHeadingUpToggle?.();
            }}
          />
        ) : null}
        {scaleCompassAllowed ? (
          <MapActionButton
            tone={scaleCompassEffective ? 'primary' : 'display'}
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
          tone="display"
          icon="＋"
          label="Zoomer"
          testId={tid('zoom-in')}
          onClick={() => {
            releaseRouteCamera();
            zoomBy(1.2);
          }}
        />
        <MapActionButton
          tone="display"
          icon="－"
          label="Dézoomer"
          testId={tid('zoom-out')}
          onClick={() => {
            releaseRouteCamera();
            zoomBy(0.84);
          }}
        />
        <MapActionButton
          tone="display"
          icon="⊡"
          label="Voir tout le plan"
          testId={tid('zoom-reset')}
          onClick={() => {
            releaseRouteCamera();
            fitMapAnimated();
          }}
        />
      </div>

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
            getIsSeen={getIsSeen}
            getDiscoverHalo={getDiscoverHalo}
            getStatusLabel={getZoneStatusDots ? zoneStatusLabelOf : null}
            highlightLabel={highlightLabel}
            className="fm-pct-zones plan-map__zones"
          />
          <PctLabelsLayer
            labels={zoneLabels}
            onLabelClick={labelsClickable ? onZoneLabelClick : null}
          />
          <PctStatusDotsLayer anchors={zoneStatusAnchors} />
          {route ? (
            <PctRouteLines
              points={routePoints}
              phase={routePhase}
              currentIndex={routeIndex}
              guideFrom={routeGuideTo ? position?.displayPct || null : null}
              guideTo={routeGuideTo}
              widthPx={fitRect.width}
              heightPx={fitRect.height}
              scale={committed.s}
              animated={routeSettings.lineAnimated}
            />
          ) : position?.displayPct && targetPct ? (
            // « Y aller » : même ligne fléchée, sans tracé de parcours.
            <PctRouteLines
              guideFrom={position.displayPct}
              guideTo={targetPct}
              widthPx={fitRect.width}
              heightPx={fitRect.height}
              scale={committed.s}
              className="fm-pct-direct-line"
            />
          ) : null}
          {clusteringEnabled ? (
            <PctClusterLayer
              clusters={clusters}
              onClusterClick={onClusterClick}
              renderMarker={renderMarker}
              colorOf={clusterColorOf}
              statusDotsOf={mergeStatusDots ? clusterStatusDotsOf : null}
            />
          ) : (
            <PctMarkersLayer
              markers={visibleMarkers}
              onMarkerClick={onMarkerClick}
              activeMarkerId={selectedMarkerId}
              getIsSeen={getIsSeen}
              getDiscoverHalo={getDiscoverHalo}
              getStatusDots={markerStatusDotsOf}
              labelOf={markerLabelOf}
              highlightBadge={highlightBadge}
              highlightLabel={highlightLabel}
            />
          )}
          {route ? (
            <PctRouteBadges
              points={routePoints}
              phase={routePhase}
              currentIndex={routeIndex}
              total={routeSteps?.length || 0}
            />
          ) : null}
          {position?.displayPct ? (
            <PctPositionLayer
              position={position.displayPct}
              haloPx={accuracyHaloDiameterPx(position.haloPct, fitRect.width)}
              headingDeg={position.screenHeadingUnwrappedDeg ?? position.screenHeadingDeg}
              headingSource={position.headingSource}
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

      {chromeSlot}
      {emptySlot}
    </div>
  );
}
