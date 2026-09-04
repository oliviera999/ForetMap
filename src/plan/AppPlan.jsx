import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  safeLocalStorageReadJson,
  safeLocalStorageWriteJson,
} from '../shared/platform/browserStorage.js';
import { buildPlaceIndex, searchPlaces } from '../shared/search/placeSearch.js';
import { useMapPosition } from '../shared/pct-map/useMapPosition.js';
import { distanceMetersBetweenPct, formatDistanceFr } from '../shared/pct-map/positionGeometry.js';
import { parsePctPolygonPoints } from '../shared/pct-map/pctPolygon.js';
import { FixedToast } from '../shared/components/FixedToast.jsx';
import { useTimedToastState } from '../shared/hooks/useTimedToastState.js';
import { PlanCategoryChips } from './components/PlanCategoryChips.jsx';
import { PlanMapStage } from './components/PlanMapStage.jsx';
import { PlanPlaceSheet } from './components/PlanPlaceSheet.jsx';
import { PlanResultsSheet } from './components/PlanResultsSheet.jsx';
import { PlanTopBar } from './components/PlanTopBar.jsx';
import { usePlanContent } from './hooks/usePlanContent.js';
import { reportPlanUsage } from './planApi.js';
import {
  buildPlaceUrl,
  countPlacesByCategory,
  filterPlacesByCategories,
  planPlaceFocusPct,
  readPlaceIdFromLocation,
} from './utils/planPlaces.js';
import { PLAN_POSITION_MESSAGES } from './utils/planPositionMessages.js';

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
  const { content, places, categories, settings, map, loading, error, reload } = usePlanContent();
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

  /**
   * « Y aller » : la carte trace une **ligne droite** entre la position et le lieu, avec la
   * distance. Ce n'est pas un itinéraire — le plan ne connaît pas encore les chemins, et
   * mieux vaut une direction honnête qu'un trajet inventé.
   */
  const targetPlace = useMemo(
    () => (targetPlaceId ? places.find((p) => String(p.id) === targetPlaceId) || null : null),
    [targetPlaceId, places],
  );
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

  const dismissWelcome = useCallback(() => {
    setWelcomeVisible(false);
    safeLocalStorageWriteJson(WELCOME_STORAGE_KEY, true);
  }, []);

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
    <div className="plan-shell">
      <PlanTopBar
        title={title}
        query={query}
        onQueryChange={onQueryChange}
        onFocusSearch={() => setResultsOpen(true)}
        resultCount={results.length}
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
        place={selectedPlace}
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
