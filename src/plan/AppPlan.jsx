import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  safeLocalStorageReadJson,
  safeLocalStorageWriteJson,
} from '../shared/platform/browserStorage.js';
import { buildPlaceIndex, searchPlaces } from '../shared/search/placeSearch.js';
import { useMapPosition } from '../shared/pct-map/useMapPosition.js';
import { useHeadingUpPreference } from '../shared/pct-map/useHeadingUpPreference.js';
import { useScaleCompassPreference } from '../shared/pct-map/useScaleCompassPreference.js';
import { useBrandTheme } from '../shared/brand/useBrandTheme.js';
import { PLAN_BRAND_DEFAULTS, PLAN_SCHOOL_LOGO_URL } from './utils/planBrand.js';
import { distanceMetersBetweenPct, formatDistanceFr } from '../shared/pct-map/positionGeometry.js';
import { parsePctPolygonPoints } from '../shared/pct-map/pctPolygon.js';
import { FixedToast } from '../shared/components/FixedToast.jsx';
import { useTimedToastState } from '../shared/hooks/useTimedToastState.js';
import { useBottomSheetInset } from '../shared/ui/useBottomSheetInset.js';
import { PlanCategoryChips } from './components/PlanCategoryChips.jsx';
import { PlanFiltersSheet } from './components/PlanFiltersSheet.jsx';
import { PlanSettingsSheet } from './components/PlanSettingsSheet.jsx';
import { PlanHelp } from './components/PlanHelp.jsx';
import { PlanRoutePicker } from './components/PlanRoutePicker.jsx';
import { PLAN_ROUTE_BAR_FOCUS_INSET_PX, PlanRouteBar } from './components/PlanRouteBar.jsx';
import { PLAN_GUIDE_BAR_FOCUS_INSET_PX, PlanGuideBar } from './components/PlanGuideBar.jsx';
import { useMapGuidance } from '../shared/map-guide/useMapGuidance.js';
import { AccessCodeGate } from '../shared/components/AccessCodeGate.jsx';
import { PlanMapStage } from './components/PlanMapStage.jsx';
import { PlanPlaceSheet } from './components/PlanPlaceSheet.jsx';
import { PlanResultsSheet } from './components/PlanResultsSheet.jsx';
import { PlanTopBar } from './components/PlanTopBar.jsx';
import { usePlanContent } from './hooks/usePlanContent.js';
import {
  reportPlanUsage,
  submitPlanAccessCode,
  submitPlanLogout,
  submitPlaceSuggestion,
} from './planApi.js';
import { PLAN_VARIANT, planStorageKeys } from './utils/planVariants.js';
import { PlanAccountGate } from './components/PlanAccountGate.jsx';
import {
  buildPlaceUrl,
  countPlacesByCategory,
  filterPlacesByCategories,
  planPlaceFocusPct,
  readPlaceIdFromLocation,
} from './utils/planPlaces.js';
import { buildMapUrl, readMapIdFromLocation } from './utils/planMaps.js';
import { PLAN_POSITION_MESSAGES } from './utils/planPositionMessages.js';
import { buildRouteUrl, readRouteSlugFromLocation } from './utils/planRoutes.js';
import { useMapRouteMode } from '../shared/map-routes/useMapRouteMode.js';

/**
 * Préférences d'appareil : catégories retenues d'une visite à l'autre, message d'accueil déjà
 * vu, carte orientée à la boussole, échelle et rose des vents. Les clés sont préfixées par
 * variante (`planStorageKeys`) — les deux plans peuvent vivre sur le même téléphone.
 */
/** Nombre de résultats affichés (au-delà, affiner la recherche est plus rapide que défiler). */
const RESULTS_LIMIT = 40;

/** « Aucun filtre », d'identité stable : un `new Set()` par rendu relancerait tous les memos. */
const EMPTY_CATEGORY_IDS = new Set();

/** Idem pour « aucun signalement sur ce lieu ». */
const EMPTY_REPORTS = Object.freeze([]);

/**
 * Plan Lyautey (lot 4 du plan de convergence, `docs/AUDIT_PLAN_LYAUTEY_2026-09.md`).
 *
 * Un seul écran : la carte en plein écran, une barre de recherche en haut, des puces de
 * catégories, et deux feuilles basses (résultats, fiche du lieu). Aucun compte, aucune
 * validation de visite, aucune donnée personnelle — seul le compteur d'usage anonyme
 * (`POST /api/usage`) sait qu'un lieu a été ouvert.
 */
export function AppPlan({ variant = PLAN_VARIANT }) {
  /**
   * Clé du plan choisi : elle ne dépend que de la variante, et doit donc être lisible
   * **avant** de savoir quelle carte le serveur va servir — c'est elle qui le décide.
   */
  const MAP_ID_STORAGE_KEY = useMemo(() => planStorageKeys(variant).mapId, [variant]);
  /** Code d'accès porté par un lien profond (`?code=`, QR interne) — lot 8. */
  const [accessCode, setAccessCode] = useState(() =>
    typeof window === 'undefined'
      ? ''
      : String(new URLSearchParams(window.location.search).get('code') || '').trim(),
  );
  /**
   * Plan affiché quand l'établissement en publie plusieurs (« Réglages → Plan affiché »).
   * L'adresse (`?map_id=`, QR code d'annexe) l'emporte sur la mémoire de l'appareil : elle
   * est plus récente et plus explicite. Vide = le plan réglé côté serveur.
   */
  const [mapId, setMapId] = useState(() => {
    if (typeof window === 'undefined') return '';
    const fromUrl = readMapIdFromLocation(window.location.search);
    if (fromUrl) return fromUrl;
    return String(safeLocalStorageReadJson(MAP_ID_STORAGE_KEY, '') || '');
  });
  const {
    content,
    places,
    myReports,
    addMyReport,
    routes,
    categories,
    settings,
    maps,
    map,
    loading,
    error,
    accessRequired,
    authRequired,
    codeAvailable,
    viewer,
    reload,
  } = usePlanContent(mapId, accessCode, variant);
  /**
   * Clés de stockage **de la carte réellement servie**, et non de celle demandée : `mapId`
   * vaut `''` quand on laisse le serveur choisir, et deux plans partageraient alors la même
   * mémoire de filtres et de parcours.
   */
  const storageKeys = useMemo(() => planStorageKeys(variant, map?.id || ''), [variant, map]);
  const {
    categories: CATEGORIES_STORAGE_KEY,
    welcome: WELCOME_STORAGE_KEY,
    headingUp: HEADING_UP_STORAGE_KEY,
    scaleCompass: SCALE_COMPASS_STORAGE_KEY,
    route: ROUTE_RESUME_STORAGE_KEY,
  } = storageKeys;
  /** Liste complète des catégories (feuille basse) — la rangée de puces n'en montre que 3. */
  const [filtersOpen, setFiltersOpen] = useState(false);
  /** Réglages du lecteur : plan affiché, déconnexion. */
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Hauteur réellement occupée par la barre d'étape, mesurée par elle (voir `MapRouteBar`). */
  const [routeBarHeight, setRouteBarHeight] = useState(0);
  const [offline, setOffline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine === false,
  );
  const [query, setQuery] = useState('');
  const [resultsOpen, setResultsOpen] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);
  /**
   * Filtres de catégories : `null` tant que la personne n'a rien choisi dans cette session —
   * la sélection effective est alors **dérivée** des réglages (voir `defaultCategoryIds`).
   */
  const [chosenCategoryIds, setChosenCategoryIds] = useState(null);
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  /** Lieux d'un groupe de repères ouvert depuis la carte (désencombrement, lot 5). */
  const [groupPlaces, setGroupPlaces] = useState(null);
  const deepLinkAppliedRef = useRef(false);
  /** Parcours actif, lu par les gestionnaires stables (`openPlace`). */
  const activeRouteSlugRef = useRef('');
  const openedOnceRef = useRef(false);
  /**
   * Remise à zéro du guidage « Y aller », appelée à la sortie d'un parcours. Par référence :
   * `useMapGuidance` est déclaré plus bas — il a besoin des étapes que produit le mode
   * parcours — et une sortie de parcours doit malgré tout l'arrêter.
   */
  const resetGuidanceRef = useRef(null);

  const title = settings?.title || variant.defaultTitle;

  /**
   * Droits du lecteur, tels que le serveur les a calculés (`/api/staff-plan/content`). Le plan
   * public ne renvoie pas de `viewer` : tout ce qui suit reste donc éteint chez lui, sans
   * condition supplémentaire à écrire.
   */
  const consoleBaseUrl = String(viewer?.console_base_url || '').replace(/\/+$/, '');
  const canEditLocations = !!viewer?.can_edit_locations && !!consoleBaseUrl;
  const canSuggest = !!viewer?.can_report;

  /**
   * Y a-t-il une session à rendre ?
   *
   * Plan des personnels : toujours — on y entre par un compte ou par un laissez-passer de
   * code. Plan public : seulement quand l'établissement le ferme par un code de diffusion ;
   * ouvert à tous, il n'y a rien à quitter, et un bouton « Se déconnecter » n'y voudrait rien
   * dire.
   */
  const canLogout = Boolean(variant.requiresAccount || settings?.access_mode === 'code');
  /** Réglages ouvrables : une session à rendre, ou plusieurs plans proposés. */
  const hasSettings = canLogout || (maps || []).length > 1;

  /** Envoi d'un signalement attaché au lieu ouvert (commentaires de contexte). */
  const suggestForPlace = useCallback(
    (place) => {
      if (!canSuggest || !place) return null;
      return async (body) => {
        const sent = await submitPlaceSuggestion(
          {
            contextType: place.kind === 'zone' ? 'zone' : 'marker',
            contextId: String(place.id),
            body,
          },
          variant,
        );
        // Le message rejoint aussitôt « Mes signalements » sur la fiche : sans ce retour,
        // l'auteur n'avait aucune trace de ce qu'il venait d'envoyer.
        if (sent?.report) addMyReport(sent.report);
        reportPlanUsage('place_suggest', String(place.id), variant);
      };
    },
    [addMyReport, canSuggest, variant],
  );

  /** Mes signalements déjà déposés sur le lieu ouvert, avec leur état de traitement. */
  const reportsForPlace = useCallback(
    (place) => {
      if (!place) return EMPTY_REPORTS;
      const kind = place.kind === 'zone' ? 'zone' : 'marker';
      const id = String(place.id);
      return myReports.filter(
        (report) => report.context_type === kind && String(report.context_id) === id,
      );
    },
    [myReports],
  );

  /**
   * Identité visuelle de l'établissement (lot 7) : réglage `ui.plan.brand`, même mécanique
   * que G&L et ForetMap. Sans réglage, l'apparence par défaut du plan est conservée.
   */
  const { brand, style: brandStyle } = useBrandTheme(settings?.brand, {
    prefix: 'plan-brand',
    defaults: PLAN_BRAND_DEFAULTS,
    fontFallback: "'DM Sans', sans-serif",
  });

  /**
   * Les feuilles basses sont montées **en portail sous `body`**, donc hors de `.plan-shell` :
   * les variables de marque posées sur la coquille ne les atteignaient pas, et une identité
   * visuelle d'établissement s'arrêtait au bord de la carte
   * (`docs/AUDIT_PLAN_NAVIGATION_UX_2026-09-16.md` N14). On les repose sur la racine du
   * document, d'où tout descend — portail compris.
   */
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const root = document.documentElement;
    const entries = Object.entries(brandStyle || {});
    for (const [name, value] of entries) {
      if (name.startsWith('--')) root.style.setProperty(name, String(value));
    }
    return () => {
      for (const [name] of entries) {
        if (name.startsWith('--')) root.style.removeProperty(name);
      }
    };
  }, [brandStyle]);

  /**
   * Position de la personne sur le plan (lot 6) : le point bleu, son halo de précision et le
   * cap viennent du noyau partagé. Rien n'est envoyé au serveur.
   */
  const position = useMapPosition({
    georef: map?.geo_anchors || null,
    gpsEnabled: !!map?.gps_enabled,
  });
  const headingUpAllowed =
    !!settings?.heading_up_enabled && !!map?.heading_up_enabled && !!position.available;
  const headingUpPref = useHeadingUpPreference({
    storageKey: HEADING_UP_STORAGE_KEY,
    allowed: headingUpAllowed,
  });
  const scaleCompassAllowed = !!map?.geo_anchors && !!map?.scale_compass_enabled;
  const scaleCompassPref = useScaleCompassPreference({
    storageKey: SCALE_COMPASS_STORAGE_KEY,
    allowed: scaleCompassAllowed,
  });
  /**
   * Hauteur des feuilles basses ouvertes : elle sert à **recadrer la carte** sur la bande qui
   * reste visible. Sans elle, le lieu dont on venait d'ouvrir la fiche atterrissait dessous
   * trois fois sur quatre (`docs/AUDIT_PLAN_NAVIGATION_2026-09-16-bis.md` B2).
   */
  const sheetInsetPx = useBottomSheetInset();
  const [positionToast, setPositionToast] = useTimedToastState();
  /**
   * Ce que le mode parcours a à dire au visiteur — aujourd'hui : le QR code d'une affiche qui
   * annonce un parcours disparu. Sans lui, ce cas était silencieux
   * (`docs/AUDIT_PARCOURS_2026-09.md` §2.6).
   */
  const [routeToast, setRouteToast] = useTimedToastState();
  const categoriesById = useMemo(
    () => new Map((categories || []).map((c) => [String(c.id), c])),
    [categories],
  );

  /**
   * Catégories : choix mémorisé sur l'appareil, sinon défauts d'établissement — **dérivé au
   * rendu**, et non posé par un effet.
   *
   * Posé par un effet, il écrasait le choix que la personne venait de faire : l'effet se
   * rejouait à chaque nouvelle identité de `settings` / `categoriesById` (un rechargement du
   * contenu suffit), et, sur un appareil chargé, il pouvait même être exécuté **après** un
   * appui sur une puce. Les filtres se remettaient alors tout seuls au défaut, sans que rien
   * ne l'explique à l'écran (vu en intégration le 17/09/2026, job `quality`).
   */
  const defaultCategoryIds = useMemo(() => {
    if (!settings) return EMPTY_CATEGORY_IDS;
    const stored = safeLocalStorageReadJson(CATEGORIES_STORAGE_KEY, null);
    const initial = Array.isArray(stored) ? stored : settings.default_category_ids || [];
    return new Set(initial.map(String).filter((id) => categoriesById.has(id)));
  }, [settings, categoriesById, CATEGORIES_STORAGE_KEY]);
  const selectedCategoryIds = chosenCategoryIds ?? defaultCategoryIds;
  const selectedCategoryIdsRef = useRef(selectedCategoryIds);
  selectedCategoryIdsRef.current = selectedCategoryIds;

  useEffect(() => {
    if (!settings?.welcome_hint) return;
    if (safeLocalStorageReadJson(WELCOME_STORAGE_KEY, false)) return;
    setWelcomeVisible(true);
  }, [settings, WELCOME_STORAGE_KEY]);

  // Compteur d'usage : une ouverture par chargement de plan.
  useEffect(() => {
    if (!content || openedOnceRef.current) return;
    openedOnceRef.current = true;
    reportPlanUsage('open', String(map?.id || ''));
  }, [content, map]);

  /**
   * Lieux retenus par les puces de catégories. Les lieux **sans catégorie** restent affichés :
   * aucune case à cocher ne peut les ramener, et ce sont en production quatre entrées du lycée
   * et la loge des visiteurs (`docs/AUDIT_PLAN_NAVIGATION_UX_2026-09-16.md` N3).
   */
  const filteredPlaces = useMemo(
    () => filterPlacesByCategories(places, selectedCategoryIds, { keepUncategorized: true }),
    [places, selectedCategoryIds],
  );
  const filteredKeys = useMemo(
    () => new Set(filteredPlaces.map((place) => `${place.kind}:${place.id}`)),
    [filteredPlaces],
  );
  const counts = useMemo(() => countPlacesByCategory(places), [places]);
  /**
   * L'index de recherche porte sur **tous** les lieux, pas seulement sur ceux que le filtre
   * laisse passer : un filtre doit retirer des lieux de la carte, jamais les rendre
   * introuvables. Les résultats hors filtre sont signalés comme tels et restent ouvrables
   * (`docs/AUDIT_PLAN_NAVIGATION_UX_2026-09-16.md` N3).
   */
  const searchIndex = useMemo(
    () =>
      buildPlaceIndex(places, {
        getCategoryLabels: (place) =>
          (place.category_ids || [])
            .map((id) => categoriesById.get(String(id))?.label || '')
            .filter(Boolean),
      }),
    [places, categoriesById],
  );
  const searchMatches = useMemo(
    () => (query.trim() ? searchPlaces(searchIndex, query) : null),
    [query, searchIndex],
  );
  const results = useMemo(() => {
    if (groupPlaces) return groupPlaces.map((place) => ({ place }));
    if (!searchMatches) {
      return filteredPlaces.slice(0, RESULTS_LIMIT).map((place) => ({ place }));
    }
    return searchMatches.slice(0, RESULTS_LIMIT).map((match) => ({
      place: match.place,
      matchedFields: match.matchedFields,
      hiddenByFilter: !filteredKeys.has(`${match.place.kind}:${match.place.id}`),
    }));
  }, [groupPlaces, searchMatches, filteredPlaces, filteredKeys]);
  /** Nombre de lieux que la liste pourrait montrer, limite d'affichage mise à part (N9). */
  const resultsTotal = useMemo(() => {
    if (groupPlaces) return groupPlaces.length;
    return searchMatches ? searchMatches.length : filteredPlaces.length;
  }, [groupPlaces, searchMatches, filteredPlaces]);

  const categoriesOf = useCallback(
    (place) =>
      (place?.category_ids || []).map((id) => categoriesById.get(String(id))).filter(Boolean),
    [categoriesById],
  );

  // Les six états de position sont annoncés en toast discret, jamais en bandeau permanent.
  const positionFeedback = position.active ? position.feedback : null;
  useEffect(() => {
    if (!positionFeedback || positionFeedback === 'ok') return;
    const message = PLAN_POSITION_MESSAGES[positionFeedback];
    if (message) setPositionToast(message);
  }, [positionFeedback, setPositionToast]);

  /**
   * Mode parcours — le **noyau partagé** avec la Visite et la carte de travail
   * (`src/shared/map-routes/useMapRouteMode.js`). Le plan portait sa propre copie de cet
   * état ; les trois choses qu'il faisait en plus lui restent, passées en rappels : le toast
   * de rappel après « Quitter », la mesure d'usage, et la fermeture de la liste de résultats
   * au démarrage (`docs/AUDIT_PARCOURS_2026-09-17.md` §2.5). La reprise à l'étape quittée
   * (§2.2) vit désormais dans le noyau seul, et y gagne de survivre à un rechargement.
   *
   * `onStepPlace` : l'étape courante **est** le lieu sélectionné — la carte recadre dessus et
   * sa fiche suit.
   */
  const onRouteStepPlace = useCallback((entry) => {
    if (entry?.place) setSelectedPlace(entry.place);
  }, []);
  const onRouteStartExtra = useCallback(() => {
    setResultsOpen(false);
    setGroupPlaces(null);
  }, []);
  const onRouteExitExtra = useCallback(() => {
    setSelectedPlace(null);
    resetGuidanceRef.current?.();
  }, []);
  const onRouteExit = useCallback(() => {
    setRouteToast('Pour reprendre : puce Parcours, ou Reprendre.');
  }, [setRouteToast]);
  const onRouteUsage = useCallback(
    (event, detail) => reportPlanUsage(event, detail, variant),
    [variant],
  );
  const {
    activeRoute,
    activeRouteSlug,
    routeSteps,
    routeIndex,
    currentRouteEntry,
    routePickerOpen,
    setRoutePickerOpen,
    resumableRouteSlug,
    peekPlace: routePeekPlace,
    setPeekPlace: setRoutePeekPlace,
    startRoute,
    startRouteAt,
    exitRoute,
    resumeRoute,
    goToRouteIndex,
    resetForMapChange,
  } = useMapRouteMode({
    routes,
    places,
    onStepPlace: onRouteStepPlace,
    onStartExtra: onRouteStartExtra,
    onExitExtra: onRouteExitExtra,
    onExit: onRouteExit,
    onUsage: onRouteUsage,
    storageKey: ROUTE_RESUME_STORAGE_KEY,
  });

  activeRouteSlugRef.current = activeRouteSlug;

  const openPlace = useCallback(
    (place) => {
      // Pendant un parcours, l'étape courante garde la sélection : le lieu consulté passe par
      // `routePeekPlace`, sans quoi le tap restait sans effet visible (N5).
      if (activeRouteSlugRef.current) {
        setRoutePeekPlace(place);
        setResultsOpen(false);
        setGroupPlaces(null);
        reportPlanUsage('place_open', String(place?.id || ''));
        return;
      }
      setSelectedPlace(place);
      setResultsOpen(false);
      setGroupPlaces(null);
      reportPlanUsage('place_open', String(place?.id || ''));
      if (typeof window !== 'undefined' && window.history?.replaceState) {
        window.history.replaceState(null, '', buildPlaceUrl(window.location, String(place.id)));
      }
    },
    [setRoutePeekPlace],
  );

  /**
   * Fermer la fiche ne **coupe plus le guidage** : « Y aller » vivait dans la fiche, donc
   * refermer celle-ci arrêtait la direction en cours sans le dire — et la fiche, haute de
   * 55 % de l'écran, cachait justement le point bleu qu'on cherchait à suivre
   * (`docs/AUDIT_PLAN_NAVIGATION_2026-09-16-bis.md` B4 et B5). Le guidage s'arrête désormais
   * sur « Arrêter », et nulle part ailleurs.
   */
  const closePlace = useCallback(() => {
    setSelectedPlace(null);
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      window.history.replaceState(null, '', buildPlaceUrl(window.location, ''));
    }
  }, []);

  /**
   * Réaffirme `?lieu=` après un retour d'historique.
   *
   * Les feuilles basses empilent une entrée d'historique à l'ouverture et la dépilent à la
   * fermeture (`useOverlayHistoryBack`). Or `openPlace` écrit l'URL **sur l'entrée courante**,
   * qui est justement celle de la feuille de résultats : la fermer déclenche `history.back()`,
   * et l'adresse revient à celle d'avant — sans le lieu. Conséquence visible : après avoir
   * tapé un résultat de recherche, l'adresse ne portait plus le lieu, donc recharger la page
   * ou copier l'URL de la barre d'adresse perdait la sélection. (Le bouton « Partager », lui,
   * construit son lien depuis l'état : il n'était pas touché, ce qui explique que personne
   * ne l'ait vu.)
   *
   * L'écriture immédiate reste utile — elle suffit quand aucune surcouche n'est ouverte, par
   * exemple en cliquant directement sur la carte. Cet effet ne fait que la rétablir quand une
   * fermeture de feuille vient de l'emporter.
   */
  useEffect(() => {
    if (typeof window === 'undefined' || !window.history?.replaceState) return undefined;
    const syncPlaceParam = () => {
      const wanted = selectedPlace ? String(selectedPlace.id) : '';
      if (readPlaceIdFromLocation(window.location.search) === wanted) return;
      window.history.replaceState(null, '', buildPlaceUrl(window.location, wanted));
    };
    // Le listener de `overlayHistory` est posé avant celui-ci : la feuille a donc déjà traité
    // le retour quand nous réaffirmons l'adresse.
    window.addEventListener('popstate', syncPlaceParam);
    return () => window.removeEventListener('popstate', syncPlaceParam);
  }, [selectedPlace]);

  /**
   * Même traitement pour `?map_id=`, et pour la même raison : le changement de plan se fait
   * **depuis une feuille basse**, dont la fermeture dépile une entrée d'historique et emporte
   * l'adresse qu'on venait d'écrire. Sans cette réaffirmation, le plan choisi disparaissait
   * de la barre d'adresse aussitôt les réglages refermés — donc du lien qu'on y copie.
   */
  useEffect(() => {
    if (typeof window === 'undefined' || !window.history?.replaceState) return undefined;
    const syncMapParam = () => {
      if (readMapIdFromLocation(window.location.search) === mapId) return;
      window.history.replaceState(null, '', buildMapUrl(window.location, mapId));
    };
    syncMapParam();
    window.addEventListener('popstate', syncMapParam);
    return () => window.removeEventListener('popstate', syncMapParam);
  }, [mapId]);

  // Lien profond `?lieu=` : une seule fois, au premier contenu reçu.
  useEffect(() => {
    if (deepLinkAppliedRef.current || places.length === 0) return;
    deepLinkAppliedRef.current = true;
    const wanted = readPlaceIdFromLocation(
      typeof window === 'undefined' ? '' : window.location.search,
    );
    if (!wanted) return;
    const found = places.find((place) => String(place.id) === wanted);
    if (found) setSelectedPlace(found);
  }, [places]);

  // Recherche : compteur d'usage (mots tapés) + recherche vide (mots manquants au plan).
  const searchReportedRef = useRef('');
  const emptyReportedRef = useRef('');
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    if (searchReportedRef.current !== trimmed) {
      searchReportedRef.current = trimmed;
      reportPlanUsage('search', trimmed.slice(0, 60));
    }
    if (results.length > 0 || emptyReportedRef.current === trimmed) return;
    emptyReportedRef.current = trimmed;
    reportPlanUsage('search_empty', trimmed.slice(0, 60));
  }, [query, results]);

  const onQueryChange = useCallback((next) => {
    setQuery(next);
    setGroupPlaces(null);
    setResultsOpen(Boolean(next.trim()));
  }, []);

  /**
   * Tap sur un groupe de repères qui ne se sépare pas au zoom : ses lieux montent dans la
   * feuille basse. C'est l'option accessible de l'« éventail » des cartes web — au doigt,
   * une liste vaut mieux que des pastilles qui s'écartent en cercle.
   */
  const openGroup = useCallback(
    (groupMarkers) => {
      const ids = new Set((groupMarkers || []).map((m) => String(m.id)));
      const list = places.filter((place) => place.kind === 'marker' && ids.has(String(place.id)));
      if (list.length === 0) return;
      setGroupPlaces(list);
      setResultsOpen(true);
    },
    [places],
  );

  const toggleCategory = useCallback(
    (id) => {
      // Part de la sélection **effective** (choix explicite ou défaut dérivé), jamais d'un
      // état qui serait encore `null` : le premier appui doit ajouter une catégorie au défaut
      // affiché, pas à un ensemble vide invisible.
      const next = new Set(selectedCategoryIdsRef.current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      safeLocalStorageWriteJson(CATEGORIES_STORAGE_KEY, [...next]);
      setChosenCategoryIds(next);
    },
    [CATEGORIES_STORAGE_KEY],
  );

  const resetCategories = useCallback(() => {
    safeLocalStorageWriteJson(CATEGORIES_STORAGE_KEY, []);
    setChosenCategoryIds(EMPTY_CATEGORY_IDS);
  }, [CATEGORIES_STORAGE_KEY]);

  /**
   * « Y aller » : la carte trace une **ligne droite** entre la position et le lieu, avec la
   * distance. Ce n'est pas un itinéraire — le plan ne connaît pas encore les chemins, et
   * mieux vaut une direction honnête qu'un trajet inventé. L'état vit dans le hook partagé
   * `shared/map-guide/useMapGuidance` (la Visite ForetMap montre le même guidage).
   *
   * Viser un lieu **rend la carte** : la fiche se referme, la barre de guidage la remplace.
   * C'est tout l'objet du geste — voir où l'on est par rapport au lieu, ce qu'une feuille
   * couvrant 55 % de l'écran interdisait (B4).
   */
  const onGuidanceStart = useCallback(
    (place) => {
      reportPlanUsage('go', String(place.id));
      if (!position.active) position.toggle();
      if (!activeRouteSlugRef.current) closePlace();
    },
    [position, closePlace],
  );
  const onGuidanceStop = useCallback(() => {
    reportPlanUsage('go_stop', '');
  }, []);
  const {
    guidedPlace: guidanceTargetPlace,
    goTo: goToPlace,
    stop: stopGuidance,
    isTarget: isGuidanceTarget,
    reset: resetGuidance,
  } = useMapGuidance({ places, onGoTo: onGuidanceStart, onStop: onGuidanceStop });
  resetGuidanceRef.current = resetGuidance;

  // En mode parcours, la cible est l'étape courante : « Y aller » suit le parcours.
  const targetPlace = currentRouteEntry ? currentRouteEntry.place : guidanceTargetPlace;
  const targetPct = useMemo(
    () => (targetPlace ? planPlaceFocusPct(targetPlace, parsePctPolygonPoints) : null),
    [targetPlace],
  );
  /**
   * Lieux dessinés sur la carte : ceux du filtre, **plus** le lieu ouvert et le lieu visé s'ils
   * en sortent. Ouvrir un résultat hors filtre (ou un lien profond) montrait sinon une fiche
   * sans rien sur la carte (`docs/AUDIT_PLAN_NAVIGATION_UX_2026-09-16.md` N3).
   *
   * Identités stables : `filter` recrée un tableau à chaque rendu, ce qui relancerait le
   * regroupement et le rendu des repères pour rien.
   */
  const shownPlaces = useMemo(() => {
    const extra = [selectedPlace, routePeekPlace, targetPlace].filter(
      (place) => place && !filteredKeys.has(`${place.kind}:${place.id}`),
    );
    if (extra.length === 0) return filteredPlaces;
    const seen = new Set();
    return [...filteredPlaces, ...extra].filter((place) => {
      const key = `${place.kind}:${place.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [filteredPlaces, filteredKeys, selectedPlace, routePeekPlace, targetPlace]);
  const mapZones = useMemo(() => shownPlaces.filter((p) => p.kind === 'zone'), [shownPlaces]);
  const mapMarkers = useMemo(() => shownPlaces.filter((p) => p.kind === 'marker'), [shownPlaces]);

  const targetDistanceM = useMemo(
    () =>
      position.positionPct && targetPct
        ? distanceMetersBetweenPct(position.positionPct, targetPct, position.planSize)
        : null,
    [position.positionPct, position.planSize, targetPct],
  );

  /**
   * Lieu guidé hors parcours : c'est lui qui porte la barre de guidage. Pendant un parcours,
   * la barre d'étape fait déjà ce travail.
   */
  const guidedPlace = activeRoute ? null : targetPlace;

  /**
   * Marges de recadrage de la carte : tout ce qui mange le bas de l'écran (feuille basse
   * ouverte, barre d'étape, barre de guidage). Sans elles, la carte centrait le lieu
   * sélectionné au milieu de la **scène** — c'est-à-dire sous la feuille
   * (`docs/AUDIT_PLAN_NAVIGATION_2026-09-16-bis.md` B2).
   */
  /**
   * Feuille si haute qu'aucune commande de carte ne tient plus au-dessus (cran plein) : mieux
   * vaut les effacer que les laisser sous la feuille, visibles et intouchables (B1). Le seuil
   * passe au-dessus du cran `half` (55 %), qui reste le cran d'ouverture des deux feuilles.
   */
  const controlsHidden =
    sheetInsetPx > 0 &&
    typeof window !== 'undefined' &&
    sheetInsetPx > (window.innerHeight || 0) * 0.66;

  const mapFocusInsets = useMemo(() => {
    // Barre d'étape : sa hauteur **mesurée**, qui varie avec le texte de l'étape et son
    // dépliage. La constante ne sert que le premier rendu, avant la première mesure
    // (`docs/AUDIT_PARCOURS_2026-09-17.md` §2.7).
    const bars = activeRoute
      ? routeBarHeight || PLAN_ROUTE_BAR_FOCUS_INSET_PX
      : guidedPlace
        ? PLAN_GUIDE_BAR_FOCUS_INSET_PX
        : 0;
    const bottom = Math.max(bars, Math.round(sheetInsetPx) || 0);
    return bottom > 0 ? { bottom } : null;
  }, [activeRoute, guidedPlace, sheetInsetPx, routeBarHeight]);

  /**
   * Distance à vol d'oiseau d'un lieu quelconque, formatée — pour la liste de résultats
   * (`docs/AUDIT_PLAN_AFFICHAGE_2026-09-13.md` N4). Chaîne vide tant que la position n'est
   * pas active : mieux vaut ne rien dire qu'annoncer une distance depuis un point inconnu.
   */
  const distanceOfPlace = useCallback(
    (place) => {
      if (!position.positionPct || !place) return '';
      const pct = planPlaceFocusPct(place, parsePctPolygonPoints);
      if (!pct) return '';
      return formatDistanceFr(
        distanceMetersBetweenPct(position.positionPct, pct, position.planSize),
      );
    },
    [position.positionPct, position.planSize],
  );

  /**
   * Lien profond `?parcours=` : ouvre le parcours dès que le contenu est là — et **le dit**
   * quand le slug ne correspond à rien. Une affiche imprimée survit à la dépublication, à la
   * suppression et au changement de slug du parcours qu'elle annonce : le visiteur qui scanne
   * doit apprendre que le parcours n'existe plus, pas arriver sur un plan nu
   * (`docs/AUDIT_PARCOURS_2026-09.md` §2.6). La garde porte sur le contenu chargé, et non plus
   * sur `routes.length` : un plan sans aucun parcours publié restait muet.
   */
  const routeLinkAppliedRef = useRef(false);
  useEffect(() => {
    if (routeLinkAppliedRef.current || !content) return;
    routeLinkAppliedRef.current = true;
    const wanted = readRouteSlugFromLocation(
      typeof window === 'undefined' ? '' : window.location.search,
    );
    if (!wanted) return;
    const found = routes.find((route) => route.slug === wanted);
    if (found) {
      startRouteAt(found, 0);
      return;
    }
    setRouteToast('Ce parcours n’est plus disponible.');
  }, [content, routes, setRouteToast, startRouteAt]);

  /**
   * Aligne `?parcours=` après les history.back() des feuilles qui se ferment au démarrage.
   * Placé après l'effet lien profond pour ne pas effacer `?parcours=` avant lecture.
   */
  useEffect(() => {
    if (!routeLinkAppliedRef.current) return;
    if (typeof window === 'undefined' || !window.history?.replaceState) return;
    const wanted = activeRouteSlug || '';
    const current = readRouteSlugFromLocation(window.location.search);
    if (current === wanted) return;
    window.history.replaceState(null, '', buildRouteUrl(window.location, wanted));
  }, [activeRouteSlug, content]);

  // Bandeau « hors ligne » : le plan reste consultable grâce au service worker.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const goOnline = () => setOffline(false);
    const goOffline = () => {
      setOffline(true);
      reportPlanUsage('offline_view', String(map?.id || ''));
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [map]);

  const submitAccessCode = useCallback(
    async (code) => {
      await submitPlanAccessCode(code, variant);
      // Le laissez-passer est posé : on relance la charge avec le code, pour ne pas dépendre
      // de l'ordre d'écriture du cookie.
      setAccessCode(code);
    },
    [variant],
  );

  const dismissWelcome = useCallback(() => {
    setWelcomeVisible(false);
    safeLocalStorageWriteJson(WELCOME_STORAGE_KEY, true);
  }, [WELCOME_STORAGE_KEY]);

  /**
   * Changement de plan (« Réglages → Plan affiché »).
   *
   * Tout ce qui décrivait le plan quitté s'en va : recherche, sélection, groupe ouvert,
   * guidage, parcours en cours. Les identifiants de lieux et les slugs de parcours ne sont
   * uniques que sur leur carte — garder l'état reviendrait à viser un lieu qui n'existe plus
   * ici. Les filtres repartent des défauts de l'établissement (`setChosenCategoryIds(null)`),
   * la mémoire de chaque plan restant dans sa propre clé (`planStorageKeys`).
   *
   * L'adresse suit, débarrassée de `?lieu=` et `?parcours=` : un lien copié après changement
   * de plan doit rouvrir ce plan-là, et rien de l'ancien.
   */
  const selectMap = useCallback(
    (nextMapId) => {
      const id = String(nextMapId || '').trim();
      if (!id || id === String(map?.id || '')) return;
      safeLocalStorageWriteJson(MAP_ID_STORAGE_KEY, id);
      setMapId(id);
      setSettingsOpen(false);
      setFiltersOpen(false);
      setResultsOpen(false);
      setGroupPlaces(null);
      setQuery('');
      setSelectedPlace(null);
      setChosenCategoryIds(null);
      resetForMapChange();
      resetGuidanceRef.current?.();
      // Les liens profonds ont déjà été appliqués — et ils désignaient l'autre plan : ils ne
      // doivent pas se rejouer sur celui-ci.
      deepLinkAppliedRef.current = true;
      routeLinkAppliedRef.current = true;
      reportPlanUsage('map_switch', id, variant);
      // `?lieu=` et `?parcours=` s'en vont ici ; `?map_id=` est (ré)affirmé par son propre
      // effet, qui survit au `history.back()` de la feuille qui se referme.
      if (typeof window !== 'undefined' && window.history?.replaceState) {
        window.history.replaceState(null, '', buildRouteUrl(window.location, ''));
      }
    },
    [MAP_ID_STORAGE_KEY, map, resetForMapChange, variant],
  );

  /**
   * Déconnexion. Le serveur oublie le laissez-passer (cookie `HttpOnly`), l'appareil oublie
   * le jeton du compte, puis la charge est redemandée : le serveur répond alors « connexion
   * requise » et l'écran d'entrée revient de lui-même. Pas de `location.reload()` — le plan
   * doit aussi se déconnecter hors ligne, sans dépendre d'un chargement de page.
   *
   * Le code d'un lien profond (`?code=`) part avec la session, adresse comprise : conservé,
   * il reposerait le laissez-passer à la requête suivante et la déconnexion n'aurait rien
   * déconnecté. Effacer le code suffit à relancer la charge — d'où le `reload()` réservé au
   * cas contraire.
   */
  const logout = useCallback(async () => {
    await submitPlanLogout(variant);
    variant.clearToken?.();
    if (accessCode) {
      if (typeof window !== 'undefined' && window.history?.replaceState) {
        const params = new URLSearchParams(window.location.search);
        params.delete('code');
        const query = params.toString();
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}${query ? `?${query}` : ''}`,
        );
      }
      setAccessCode('');
      return;
    }
    reload();
  }, [accessCode, reload, variant]);

  /**
   * Un plan mémorisé qui n'est plus proposé (retiré des réglages, dépublié) répond `400`.
   * On retombe alors sur le plan réglé par l'établissement plutôt que de laisser l'écran
   * « Le plan n'a pas pu être chargé » à quelqu'un qui n'a rien fait de mal.
   */
  useEffect(() => {
    if (!mapId || error?.status !== 400) return;
    safeLocalStorageWriteJson(MAP_ID_STORAGE_KEY, '');
    // L'adresse suit toute seule (effet de synchronisation de `?map_id=`) : sinon le plan
    // disparu reviendrait au prochain chargement de la page.
    setMapId('');
  }, [error, mapId, MAP_ID_STORAGE_KEY]);

  // Plan des personnels : le serveur n'a reconnu ni compte ni laissez-passer. On propose la
  // connexion, et la saisie du code seulement si un administrateur l'a activée.
  if (authRequired) {
    return (
      <div className="plan-shell plan-shell--state">
        <PlanAccountGate
          title={title}
          intro={variant.accessIntro}
          codeAvailable={codeAvailable}
          onSubmitCode={submitAccessCode}
        />
      </div>
    );
  }

  if (accessRequired) {
    return (
      <div className="plan-shell plan-shell--state">
        <AccessCodeGate
          className="plan-access-gate"
          title={title}
          intro={variant.accessIntro}
          onSubmit={submitAccessCode}
        />
      </div>
    );
  }

  if (loading && !content) {
    return (
      <div className="plan-shell plan-shell--state">
        <p className="plan-state">Chargement du plan…</p>
      </div>
    );
  }

  if (error && !content) {
    return (
      <div className="plan-shell plan-shell--state">
        <p className="plan-state plan-state--error">Le plan n’a pas pu être chargé.</p>
        <button type="button" className="shared-btn shared-btn--primary" onClick={reload}>
          Réessayer
        </button>
      </div>
    );
  }

  const hasMapImage = Boolean(map?.map_image_url);
  /**
   * Lieu dont la fiche est ouverte : l'étape d'un parcours reste pilotée par sa barre, mais un
   * lieu consulté en cours de parcours a droit à sa fiche (N5).
   */
  const sheetPlace = activeRoute ? routePeekPlace : selectedPlace;
  // Lien direct du lieu ouvert : c'est l'URL que porte un QR code interne, la fiche doit
  // pouvoir la montrer (`PlanPlaceSheet` savait l'afficher, personne ne la lui passait).
  const shareUrl =
    sheetPlace && typeof window !== 'undefined'
      ? `${window.location.origin}${buildPlaceUrl(window.location, String(sheetPlace.id))}`
      : '';

  return (
    <div className="plan-shell" style={brandStyle}>
      <PlanTopBar
        title={title}
        logoUrl={brand.logoUrl}
        query={query}
        onQueryChange={onQueryChange}
        onFocusSearch={() => setResultsOpen(true)}
        resultCount={results.length}
        help={
          <PlanHelp
            welcomeHint={settings?.welcome_hint || ''}
            canLocate={position.available}
            hasRoutes={(routes || []).some((r) => (r?.steps || []).length > 0)}
            onOpen={() => reportPlanUsage('help_open', 'plan')}
          />
        }
        tools={
          /* Pas de bouton quand il n'y aurait rien derrière : un plan public unique n'a ni
             session à rendre ni autre plan à proposer. */
          hasSettings ? (
            <button
              type="button"
              className="plan-topbar__tool"
              aria-expanded={settingsOpen}
              aria-label="Réglages"
              title="Réglages"
              data-testid="plan-settings-button"
              onClick={() => setSettingsOpen((open) => !open)}
            >
              <span aria-hidden>⚙️</span>
            </button>
          ) : null
        }
      />

      <div className="plan-filters">
        <div className="plan-filters__row">
          <PlanRoutePicker
            routes={routes}
            places={places}
            onStart={startRoute}
            open={routePickerOpen}
            onToggle={setRoutePickerOpen}
          />
          {(categories || []).length > 0 ? (
            <button
              type="button"
              className={`plan-chip plan-chip--filters${selectedCategoryIds.size > 0 ? ' is-active' : ''}`}
              aria-expanded={filtersOpen}
              data-testid="plan-filters-button"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              Filtres
              {selectedCategoryIds.size > 0 ? (
                <span className="plan-chip__count">{selectedCategoryIds.size}</span>
              ) : null}
            </button>
          ) : null}
          <PlanCategoryChips
            categories={categories}
            selectedIds={selectedCategoryIds}
            onToggle={toggleCategory}
            onReset={resetCategories}
            counts={counts}
          />
        </div>
      </div>

      <main className="plan-main" role="main">
        {hasMapImage && filteredPlaces.length === 0 ? (
          <p className="plan-empty" role="status">
            Aucun lieu dans cette sélection de catégories.{' '}
            <button type="button" className="plan-empty__reset" onClick={resetCategories}>
              Tout afficher
            </button>
          </p>
        ) : null}
        {hasMapImage ? (
          <PlanMapStage
            map={map}
            zones={mapZones}
            markers={mapMarkers}
            /* Le lieu visé reste mis en avant même fiche refermée : pendant le guidage, la
               carte doit montrer *où l'on va*, pas seulement d'où part le trait (B4). */
            selectedPlace={routePeekPlace || selectedPlace || guidedPlace}
            onSelectPlace={openPlace}
            onOpenGroup={openGroup}
            labelsClickable
            categoriesById={categoriesById}
            position={position}
            onLocateToggle={() => {
              reportPlanUsage('locate', position.active ? 'off' : 'on');
              position.toggle();
            }}
            headingUpAllowed={headingUpAllowed}
            headingUpEffective={headingUpPref.effective && position.active}
            headingUpUserEnabled={headingUpPref.userEnabled}
            onHeadingUpToggle={() => {
              const next = !headingUpPref.userEnabled;
              reportPlanUsage('heading_up', next ? 'on' : 'off');
              headingUpPref.setEnabled(next);
            }}
            scaleCompassAllowed={scaleCompassAllowed}
            scaleCompassEffective={scaleCompassPref.effective}
            onScaleCompassToggle={scaleCompassPref.toggle}
            targetPct={targetPct}
            focusInsets={mapFocusInsets}
            attribution={settings?.attribution || ''}
            schoolLogoUrl={PLAN_SCHOOL_LOGO_URL}
            /* Feuille ouverte : la colonne de commandes ne tient pas dans la bande de carte
               qui reste (122 px pour 252 px de colonne sur un iPhone 13) — elle se replie en
               rangée juste au-dessus (`docs/AUDIT_PLAN_NAVIGATION_2026-09-16-bis.md` B1). */
            controlsClassName={`plan-map-controls fm-pct-map-controls${
              sheetInsetPx > 0 ? ' is-compact' : ''
            }${controlsHidden ? ' is-hidden' : ''}`}
          />
        ) : (
          <p className="plan-state">Aucun fond de plan n’est encore publié pour ce lieu.</p>
        )}

        {/* Le bandeau d'accueil vit **dans la carte**, pas sur la coquille : posé sur
            `.plan-shell`, il recouvrait intégralement le bouton d'aide de la barre haute — la
            seule explication du produit, au moment exact où le visiteur est neuf
            (`docs/AUDIT_PLAN_NAVIGATION_2026-09-16-bis.md` G1). */}
        {welcomeVisible && settings?.welcome_hint ? (
          <div className="plan-welcome" role="status">
            <p className="plan-welcome__text">{settings.welcome_hint}</p>
            <button type="button" className="plan-welcome__close" onClick={dismissWelcome}>
              J’ai compris
            </button>
          </div>
        ) : null}
      </main>

      {offline ? (
        <p className="plan-offline" role="status">
          Hors ligne — plan mémorisé sur cet appareil.
        </p>
      ) : null}

      {!activeRoute && resumableRouteSlug ? (
        <div className="plan-route-resume">
          <button type="button" className="plan-route-resume__btn" onClick={resumeRoute}>
            Reprendre le parcours
          </button>
        </div>
      ) : null}

      {guidedPlace ? (
        <PlanGuideBar
          place={guidedPlace}
          distanceLabel={position.positionPct ? formatDistanceFr(targetDistanceM) : ''}
          positionActive={position.active && !!position.positionPct}
          canLocate={position.available}
          onStop={stopGuidance}
          onOpenPlace={() => openPlace(guidedPlace)}
          onLocate={() => {
            reportPlanUsage('locate', 'on');
            if (!position.active) position.toggle();
          }}
        />
      ) : null}

      {activeRoute ? (
        <PlanRouteBar
          route={activeRoute}
          steps={routeSteps}
          index={routeIndex}
          onGoToIndex={goToRouteIndex}
          onExit={exitRoute}
          onHeight={setRouteBarHeight}
          canLocate={position.available}
          distanceLabel={
            currentRouteEntry && position.positionPct ? formatDistanceFr(targetDistanceM) : ''
          }
        />
      ) : null}

      <PlanResultsSheet
        open={resultsOpen}
        onClose={() => {
          setResultsOpen(false);
          setGroupPlaces(null);
        }}
        title={groupPlaces ? `Lieux regroupés (${groupPlaces.length})` : null}
        query={query}
        results={results}
        onSelect={openPlace}
        categoriesOf={categoriesOf}
        distanceOf={distanceOfPlace}
        totalCount={resultsTotal}
        filterActive={selectedCategoryIds.size > 0}
      />

      <PlanFiltersSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        categories={categories}
        selectedIds={selectedCategoryIds}
        onToggle={toggleCategory}
        onReset={resetCategories}
        counts={counts}
        shownCount={filteredPlaces.length}
        totalCount={places.length}
      />

      <PlanSettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        maps={maps}
        currentMapId={String(map?.id || '')}
        onSelectMap={selectMap}
        canLogout={canLogout}
        onLogout={logout}
        sessionHint={
          variant.requiresAccount
            ? 'Ferme votre session sur cet appareil : le plan des personnels redemandera la connexion.'
            : 'Oublie le code d’accès mémorisé sur cet appareil : le plan le redemandera.'
        }
      />

      <PlanPlaceSheet
        place={sheetPlace}
        onClose={activeRoute ? () => setRoutePeekPlace(null) : closePlace}
        shareUrl={shareUrl}
        categories={categoriesOf(sheetPlace)}
        canLocate={position.available}
        onGoTo={goToPlace}
        isTarget={isGuidanceTarget(sheetPlace)}
        distanceLabel={isGuidanceTarget(sheetPlace) ? formatDistanceFr(targetDistanceM) : ''}
        secondaryAction={
          activeRoute && routePeekPlace
            ? { label: 'Revenir à l’étape', onClick: () => setRoutePeekPlace(null) }
            : null
        }
        /* Pendant un parcours, la fiche s'ouvre au cran bas : à mi-hauteur elle recouvrait
           entièrement la barre d'étape (B3). La barre reste la commande principale ; la fiche
           se tire vers le haut pour lire. */
        initialSnap={activeRoute && routePeekPlace ? 'peek' : 'half'}
        editUrl={canEditLocations ? consoleBaseUrl : ''}
        onSuggest={suggestForPlace(sheetPlace)}
        myReports={reportsForPlace(sheetPlace)}
      />

      <FixedToast className="plan-toast">{positionToast || routeToast}</FixedToast>
    </div>
  );
}
