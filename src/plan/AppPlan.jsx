import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  safeLocalStorageReadJson,
  safeLocalStorageWriteJson,
} from '../shared/platform/browserStorage.js';
import { buildPlaceIndex, searchPlaces } from '../shared/search/placeSearch.js';
import { useMapPosition } from '../shared/pct-map/useMapPosition.js';
import { useBrandTheme } from '../shared/brand/useBrandTheme.js';
import { PLAN_BRAND_DEFAULTS } from './utils/planBrand.js';
import { distanceMetersBetweenPct, formatDistanceFr } from '../shared/pct-map/positionGeometry.js';
import { parsePctPolygonPoints } from '../shared/pct-map/pctPolygon.js';
import { FixedToast } from '../shared/components/FixedToast.jsx';
import { useTimedToastState } from '../shared/hooks/useTimedToastState.js';
import { PlanCategoryChips } from './components/PlanCategoryChips.jsx';
import { PlanHelp } from './components/PlanHelp.jsx';
import { PlanRoutePicker } from './components/PlanRoutePicker.jsx';
import { PlanRouteSheet } from './components/PlanRouteSheet.jsx';
import { AccessCodeGate } from '../shared/components/AccessCodeGate.jsx';
import { PlanMapStage } from './components/PlanMapStage.jsx';
import { PlanPlaceSheet } from './components/PlanPlaceSheet.jsx';
import { PlanResultsSheet } from './components/PlanResultsSheet.jsx';
import { PlanTopBar } from './components/PlanTopBar.jsx';
import { usePlanContent } from './hooks/usePlanContent.js';
import { reportPlanUsage, submitPlanAccessCode } from './planApi.js';
import {
  buildPlaceUrl,
  countPlacesByCategory,
  filterPlacesByCategories,
  planPlaceFocusPct,
  readPlaceIdFromLocation,
} from './utils/planPlaces.js';
import { PLAN_POSITION_MESSAGES } from './utils/planPositionMessages.js';
import {
  buildRouteUrl,
  nextRouteIndex,
  readRouteSlugFromLocation,
  resolveRouteSteps,
} from './utils/planRoutes.js';

/** Catégories retenues d'une visite à l'autre (le plan n'a pas de compte). */
const CATEGORIES_STORAGE_KEY = 'plan:categories';
/** Message d'accueil : montré une seule fois par appareil. */
const WELCOME_STORAGE_KEY = 'plan:welcome-seen';
/** Nombre de résultats affichés (au-delà, affiner la recherche est plus rapide que défiler). */
const RESULTS_LIMIT = 40;

/**
 * Plan Lyautey (lot 4 du plan de convergence, `docs/AUDIT_PLAN_LYAUTEY_2026-09.md`).
 *
 * Un seul écran : la carte en plein écran, une barre de recherche en haut, des puces de
 * catégories, et deux feuilles basses (résultats, fiche du lieu). Aucun compte, aucune
 * validation de visite, aucune donnée personnelle — seul le compteur d'usage anonyme
 * (`POST /api/usage`) sait qu'un lieu a été ouvert.
 */
export function AppPlan() {
  /** Code d'accès porté par un lien profond (`?code=`, QR interne) — lot 8. */
  const [accessCode, setAccessCode] = useState(() =>
    typeof window === 'undefined'
      ? ''
      : String(new URLSearchParams(window.location.search).get('code') || '').trim(),
  );
  const {
    content,
    places,
    routes,
    categories,
    settings,
    map,
    loading,
    error,
    accessRequired,
    reload,
  } = usePlanContent('', accessCode);
  /** Parcours en cours (lot 8) : slug actif et position, mémorisés sur l'appareil seulement. */
  const [activeRouteSlug, setActiveRouteSlug] = useState('');
  const [routeIndex, setRouteIndex] = useState(0);
  const [routePickerOpen, setRoutePickerOpen] = useState(false);
  const [offline, setOffline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine === false,
  );
  const [query, setQuery] = useState('');
  const [resultsOpen, setResultsOpen] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState(() => new Set());
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  /** Lieux d'un groupe de repères ouvert depuis la carte (désencombrement, lot 5). */
  const [groupPlaces, setGroupPlaces] = useState(null);
  /** Lieu visé par « Y aller » (ligne droite depuis la position, lot 6). */
  const [targetPlaceId, setTargetPlaceId] = useState('');
  const deepLinkAppliedRef = useRef(false);
  const openedOnceRef = useRef(false);

  const title = settings?.title || 'Plan Lyautey';

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
   * Position de la personne sur le plan (lot 6) : le point bleu, son halo de précision et le
   * cap viennent du noyau partagé. Rien n'est envoyé au serveur.
   */
  const position = useMapPosition({
    georef: map?.geo_anchors || null,
    gpsEnabled: !!map?.gps_enabled,
  });
  const [positionToast, setPositionToast] = useTimedToastState();
  const categoriesById = useMemo(
    () => new Map((categories || []).map((c) => [String(c.id), c])),
    [categories],
  );

  // Catégories : choix mémorisé sur l'appareil, sinon défauts d'établissement.
  useEffect(() => {
    if (!settings) return;
    const stored = safeLocalStorageReadJson(CATEGORIES_STORAGE_KEY, null);
    const initial = Array.isArray(stored) ? stored : settings.default_category_ids || [];
    const known = initial.map(String).filter((id) => categoriesById.has(id));
    setSelectedCategoryIds(new Set(known));
  }, [settings, categoriesById]);

  useEffect(() => {
    if (!settings?.welcome_hint) return;
    if (safeLocalStorageReadJson(WELCOME_STORAGE_KEY, false)) return;
    setWelcomeVisible(true);
  }, [settings]);

  // Compteur d'usage : une ouverture par chargement de plan.
  useEffect(() => {
    if (!content || openedOnceRef.current) return;
    openedOnceRef.current = true;
    reportPlanUsage('open', String(map?.id || ''));
  }, [content, map]);

  const filteredPlaces = useMemo(
    () => filterPlacesByCategories(places, selectedCategoryIds),
    [places, selectedCategoryIds],
  );
  const counts = useMemo(() => countPlacesByCategory(places), [places]);
  // Identités stables pour la carte : `filter` recrée un tableau à chaque rendu, ce qui
  // relancerait le regroupement et le rendu des repères pour rien.
  const mapZones = useMemo(() => filteredPlaces.filter((p) => p.kind === 'zone'), [filteredPlaces]);
  const mapMarkers = useMemo(
    () => filteredPlaces.filter((p) => p.kind === 'marker'),
    [filteredPlaces],
  );
  const searchIndex = useMemo(
    () =>
      buildPlaceIndex(filteredPlaces, {
        getCategoryLabels: (place) =>
          (place.category_ids || [])
            .map((id) => categoriesById.get(String(id))?.label || '')
            .filter(Boolean),
      }),
    [filteredPlaces, categoriesById],
  );
  const results = useMemo(() => {
    if (groupPlaces) return groupPlaces.map((place) => ({ place }));
    if (!query.trim()) {
      return filteredPlaces.slice(0, RESULTS_LIMIT).map((place) => ({ place }));
    }
    return searchPlaces(searchIndex, query, { limit: RESULTS_LIMIT });
  }, [groupPlaces, query, searchIndex, filteredPlaces]);

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

  const openPlace = useCallback(
    (place) => {
      setSelectedPlace(place);
      setResultsOpen(false);
      setGroupPlaces(null);
      reportPlanUsage('place_open', String(place?.id || ''));
      if (typeof window !== 'undefined' && window.history?.replaceState) {
        window.history.replaceState(null, '', buildPlaceUrl(window.location, String(place.id)));
      }
    },
    [setSelectedPlace],
  );

  const closePlace = useCallback(() => {
    setSelectedPlace(null);
    setTargetPlaceId('');
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      window.history.replaceState(null, '', buildPlaceUrl(window.location, ''));
    }
  }, []);

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

  // Recherche sans résultat : signalé au compteur (quels mots manquent au plan).
  const emptyReportedRef = useRef('');
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || results.length > 0 || emptyReportedRef.current === trimmed) return;
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

  const toggleCategory = useCallback((id) => {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      safeLocalStorageWriteJson(CATEGORIES_STORAGE_KEY, [...next]);
      return next;
    });
  }, []);

  const resetCategories = useCallback(() => {
    setSelectedCategoryIds(new Set());
    safeLocalStorageWriteJson(CATEGORIES_STORAGE_KEY, []);
  }, []);

  /** Parcours actif et ses étapes résolues en lieux réels. */
  const activeRoute = useMemo(
    () => (activeRouteSlug ? routes.find((r) => r.slug === activeRouteSlug) || null : null),
    [activeRouteSlug, routes],
  );
  const routeSteps = useMemo(
    () => (activeRoute ? resolveRouteSteps(activeRoute, places) : []),
    [activeRoute, places],
  );
  const currentRouteEntry = routeSteps[routeIndex] || null;

  /**
   * « Y aller » : la carte trace une **ligne droite** entre la position et le lieu, avec la
   * distance. Ce n'est pas un itinéraire — le plan ne connaît pas encore les chemins, et
   * mieux vaut une direction honnête qu'un trajet inventé.
   */
  const targetPlace = useMemo(() => {
    // En mode parcours, la cible est l'étape courante : « Y aller » suit le parcours.
    if (currentRouteEntry) return currentRouteEntry.place;
    return targetPlaceId ? places.find((p) => String(p.id) === targetPlaceId) || null : null;
  }, [currentRouteEntry, targetPlaceId, places]);
  const targetPct = useMemo(
    () => (targetPlace ? planPlaceFocusPct(targetPlace, parsePctPolygonPoints) : null),
    [targetPlace],
  );
  const targetDistanceM = useMemo(
    () =>
      position.positionPct && targetPct
        ? distanceMetersBetweenPct(position.positionPct, targetPct, position.planSize)
        : null,
    [position.positionPct, position.planSize, targetPct],
  );

  const goToPlace = useCallback(
    (place) => {
      if (!place) return;
      setTargetPlaceId(String(place.id));
      reportPlanUsage('go', String(place.id));
      if (!position.active) position.toggle();
    },
    [position],
  );

  const startRoute = useCallback((route) => {
    setActiveRouteSlug(route.slug);
    setRouteIndex(0);
    setRoutePickerOpen(false);
    setResultsOpen(false);
    setGroupPlaces(null);
    reportPlanUsage('route_start', route.slug);
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      window.history.replaceState(null, '', buildRouteUrl(window.location, route.slug));
    }
  }, []);

  const exitRoute = useCallback(() => {
    setActiveRouteSlug('');
    setRouteIndex(0);
    setSelectedPlace(null);
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      window.history.replaceState(null, '', buildRouteUrl(window.location, ''));
    }
  }, []);

  const goToRouteIndex = useCallback(
    (next) => {
      const index = nextRouteIndex(next, routeSteps.length, 0);
      setRouteIndex(index);
      reportPlanUsage('route_step', `${activeRouteSlug}#${index + 1}`);
    },
    [routeSteps.length, activeRouteSlug],
  );

  // L'étape courante est le lieu sélectionné : la carte recadre dessus et sa fiche suit.
  useEffect(() => {
    if (!currentRouteEntry) return;
    setSelectedPlace(currentRouteEntry.place);
  }, [currentRouteEntry]);

  // Lien profond `?parcours=` : ouvre le parcours dès que le contenu est là.
  const routeLinkAppliedRef = useRef(false);
  useEffect(() => {
    if (routeLinkAppliedRef.current || routes.length === 0) return;
    routeLinkAppliedRef.current = true;
    const wanted = readRouteSlugFromLocation(
      typeof window === 'undefined' ? '' : window.location.search,
    );
    if (!wanted) return;
    const found = routes.find((route) => route.slug === wanted);
    if (found) {
      setActiveRouteSlug(found.slug);
      setRouteIndex(0);
    }
  }, [routes]);

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

  const submitAccessCode = useCallback(async (code) => {
    await submitPlanAccessCode(code);
    // Le laissez-passer est posé : on relance la charge avec le code, pour ne pas dépendre
    // de l'ordre d'écriture du cookie.
    setAccessCode(code);
  }, []);

  const dismissWelcome = useCallback(() => {
    setWelcomeVisible(false);
    safeLocalStorageWriteJson(WELCOME_STORAGE_KEY, true);
  }, []);

  if (accessRequired) {
    return (
      <div className="plan-shell plan-shell--state">
        <AccessCodeGate
          className="plan-access-gate"
          title={title}
          intro="Ce plan est réservé à l’établissement. Saisissez le code qui vous a été communiqué."
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

  return (
    <div className="plan-shell" style={brandStyle}>
      <PlanTopBar
        title={title}
        logoUrl={brand.logoUrl}
        query={query}
        onQueryChange={onQueryChange}
        onFocusSearch={() => setResultsOpen(true)}
        resultCount={results.length}
      />

      <PlanHelp
        welcomeHint={settings?.welcome_hint || ''}
        canLocate={position.available}
        onOpen={() => reportPlanUsage('help_open', 'plan')}
      />

      <PlanRoutePicker
        routes={routes}
        onStart={startRoute}
        open={routePickerOpen}
        onToggle={setRoutePickerOpen}
      />

      <PlanCategoryChips
        categories={categories}
        selectedIds={selectedCategoryIds}
        onToggle={toggleCategory}
        onReset={resetCategories}
        counts={counts}
      />

      <main className="plan-main" role="main">
        {hasMapImage ? (
          <PlanMapStage
            map={map}
            zones={mapZones}
            markers={mapMarkers}
            selectedPlace={selectedPlace}
            onSelectPlace={openPlace}
            onOpenGroup={openGroup}
            categoriesById={categoriesById}
            position={position}
            targetPct={targetPct}
            attribution={settings?.attribution || ''}
          />
        ) : (
          <p className="plan-state">Aucun fond de plan n’est encore publié pour ce lieu.</p>
        )}
      </main>

      {welcomeVisible && settings?.welcome_hint ? (
        <div className="plan-welcome" role="status">
          <p className="plan-welcome__text">{settings.welcome_hint}</p>
          <button type="button" className="plan-welcome__close" onClick={dismissWelcome}>
            J’ai compris
          </button>
        </div>
      ) : null}

      {offline ? (
        <p className="plan-offline" role="status">
          Hors ligne — plan mémorisé sur cet appareil.
        </p>
      ) : null}

      {activeRoute ? (
        <PlanRouteSheet
          route={activeRoute}
          steps={routeSteps}
          index={routeIndex}
          onGoToIndex={goToRouteIndex}
          onExit={exitRoute}
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
      />

      <PlanPlaceSheet
        place={activeRoute ? null : selectedPlace}
        onClose={closePlace}
        categories={categoriesOf(selectedPlace)}
        canLocate={position.available}
        onGoTo={goToPlace}
        isTarget={Boolean(selectedPlace && String(selectedPlace.id) === targetPlaceId)}
        distanceLabel={
          selectedPlace && String(selectedPlace.id) === targetPlaceId
            ? formatDistanceFr(targetDistanceM)
            : ''
        }
      />

      <FixedToast className="plan-toast">{positionToast}</FixedToast>
    </div>
  );
}
