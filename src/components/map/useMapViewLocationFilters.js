/**
 * Recherche et filtres de lieux de la carte de travail (nom, espèce, catégorie, tâches,
 * tutoriels) : état des filtres, catégories cochées d'office, options proposées, lieux
 * retenus, lieux atténués, et raccourci clavier « / » ou Ctrl+K vers le champ de recherche.
 *
 * Extrait de `MapViewImpl` (`src/components/map-views.jsx`, étape B4 de l'audit du
 * 25/09/2026, § 3.3 ligne 5 — patron O6), sans changement de comportement.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MAP_LOCATION_FILTER_DEFAULTS,
  applyMapLocationFilters,
  collectMapSpeciesOptions,
} from '../../utils/mapLocationFilters.js';
import { collectMapCategoryOptions } from '../../utils/locationCategories.js';
import { mapCategoryIdList, mapDefaultCategoryIds } from '../../utils/mapCategoryIds.js';

/** Identifiants des éléments absents de `matchingIds` (`null` si aucun filtre n'est actif). */
function dimmedIds(active, ids, matchingIds) {
  if (!active) return null;
  const set = new Set();
  for (const id of ids) {
    if (!matchingIds.has(id)) set.add(id);
  }
  return set;
}

/** Les filtres sont-ils exactement ceux posés d'office (catégories par défaut, rien d'autre) ? */
function filtersMatchMapDefaults(filters, defaultIdsKey) {
  if (!defaultIdsKey) return false;
  const f = { ...MAP_LOCATION_FILTER_DEFAULTS, ...filters };
  for (const key of Object.keys(MAP_LOCATION_FILTER_DEFAULTS)) {
    if (key === 'categoryIds') continue;
    if (f[key] !== MAP_LOCATION_FILTER_DEFAULTS[key]) return false;
  }
  const current = (f.categoryIds || []).map(String).sort().join(';');
  return current === defaultIdsKey.split(';').sort().join(';');
}

/**
 * @param {object} options
 * @param {string} options.activeMapId carte active (les filtres repartent de zéro à chaque carte)
 * @param {object} [options.activeMap] carte active (`default_category_ids`, `hidden_category_ids`)
 * @param {string} options.mode mode de la carte (le raccourci clavier ne vit qu'en navigation)
 * @param {object[]} options.zones zones (toutes cartes, comme la liste d'origine)
 * @param {object[]} options.markersOnMap repères de la carte active
 * @param {object[]} options.parsedZones zones pré-parsées du calque (atténuation)
 * @param {object[]} options.categoryCatalog catalogue des catégories de la carte
 * @param {Map} options.categoriesById même catalogue, indexé par identifiant
 * @param {object} options.badges `{ zoneTaskVisualById, markerTaskVisualById,
 *   zoneTutorialCountById, markerTutorialCountById, emojiParsingList }`
 */
export function useMapViewLocationFilters({
  activeMapId,
  activeMap = null,
  mode,
  zones,
  markersOnMap,
  parsedZones,
  categoryCatalog,
  badges,
}) {
  const [mapLocationFilters, setMapLocationFilters] = useState(() => ({
    ...MAP_LOCATION_FILTER_DEFAULTS,
  }));
  /** Carte dont les catégories d'office ont déjà été appliquées (une fois par carte). */
  const defaultsAppliedForMapRef = useRef(null);
  const mapLocationSearchRef = useRef(null);

  // Nouvelle carte : filtres remis à zéro, puis catégories cochées d'office de **cette**
  // carte (réglage « Cartographie → Cartes »). Attend que la carte soit connue : le catalogue
  // des cartes peut arriver après l'identifiant de la carte active.
  const activeMapLoaded = !!activeMap && String(activeMap.id) === String(activeMapId);
  const defaultIdsKey = activeMapLoaded ? mapDefaultCategoryIds(activeMap).join(';') : '';
  useEffect(() => {
    if (defaultsAppliedForMapRef.current === activeMapId) return;
    setMapLocationFilters({
      ...MAP_LOCATION_FILTER_DEFAULTS,
      categoryIds: defaultIdsKey ? defaultIdsKey.split(';') : [],
    });
    if (activeMapLoaded) defaultsAppliedForMapRef.current = activeMapId;
  }, [activeMapId, activeMapLoaded, defaultIdsKey]);

  const mapFiltersAtDefaults = useMemo(
    () => filtersMatchMapDefaults(mapLocationFilters, defaultIdsKey),
    [mapLocationFilters, defaultIdsKey],
  );

  const hiddenIdsKey = mapCategoryIdList(activeMap?.hidden_category_ids).join(';');
  const mapSpeciesOptions = useMemo(
    () => collectMapSpeciesOptions(zones, markersOnMap),
    [zones, markersOnMap],
  );

  // Options du filtre « Catégories » : celles réellement portées par les lieux affichés,
  // complétées par le catalogue de la carte (une catégorie encore inutilisée reste visible),
  // moins les catégories cachées sur cette carte.
  const mapCategoryOptions = useMemo(() => {
    const hidden = new Set(hiddenIdsKey ? hiddenIdsKey.split(';') : []);
    return collectMapCategoryOptions(zones, markersOnMap, categoryCatalog).filter(
      (cat) => !hidden.has(cat.id),
    );
  }, [zones, markersOnMap, categoryCatalog, hiddenIdsKey]);

  const {
    zoneTaskVisualById,
    markerTaskVisualById,
    zoneTutorialCountById,
    markerTutorialCountById,
    emojiParsingList,
  } = badges;
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
        markers: markersOnMap,
        filters: mapLocationFilters,
        context: mapFilterContext,
      }),
    [zones, markersOnMap, mapLocationFilters, mapFilterContext],
  );

  const dimmedZoneIds = useMemo(
    () =>
      dimmedIds(
        mapFilterActive,
        parsedZones.map((parsed) => String(parsed.zone.id)),
        matchingZoneIds,
      ),
    [mapFilterActive, parsedZones, matchingZoneIds],
  );

  const dimmedMarkerIds = useMemo(
    () =>
      dimmedIds(
        mapFilterActive,
        markersOnMap.map((m) => String(m.id)),
        matchingMarkerIds,
      ),
    [mapFilterActive, markersOnMap, matchingMarkerIds],
  );

  /** Atténuation filtre : `true` = vu/atténué, `false` = mis en avant, `null` = neutre. */
  const getFilterDimSeen = useCallback(
    (place) => {
      if (!mapFilterActive || !place) return null;
      const id = String(place.id);
      const isMarker =
        place.kind === 'marker' ||
        (place.x_pct != null &&
          place.y_pct != null &&
          !(place.points && String(place.points).trim()));
      if (isMarker) return matchingMarkerIds.has(id) ? false : true;
      return matchingZoneIds.has(id) ? false : true;
    },
    [mapFilterActive, matchingZoneIds, matchingMarkerIds],
  );

  // Raccourci clavier : « / » ou Ctrl+K (Cmd+K) place le curseur dans la recherche.
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

  return {
    mapLocationFilters,
    setMapLocationFilters,
    mapLocationSearchRef,
    mapSpeciesOptions,
    mapCategoryOptions,
    matchingZoneIds,
    matchingMarkerIds,
    mapFilterResultItems,
    mapFilterActive,
    mapFiltersAtDefaults,
    dimmedZoneIds,
    dimmedMarkerIds,
    getFilterDimSeen,
  };
}
