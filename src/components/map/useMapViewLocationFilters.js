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
import { parseCategoryIdsSetting } from '../../utils/categoryIdsSetting.js';
import { collectMapCategoryOptions } from '../../utils/locationCategories.js';

/** Identifiants des éléments absents de `matchingIds` (`null` si aucun filtre n'est actif). */
function dimmedIds(active, ids, matchingIds) {
  if (!active) return null;
  const set = new Set();
  for (const id of ids) {
    if (!matchingIds.has(id)) set.add(id);
  }
  return set;
}

/**
 * @param {object} options
 * @param {string} options.activeMapId carte active (les filtres repartent de zéro à chaque carte)
 * @param {string} options.mode mode de la carte (le raccourci clavier ne vit qu'en navigation)
 * @param {object} options.publicSettings réglages publics (`default_category_ids`)
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
  mode,
  publicSettings,
  zones,
  markersOnMap,
  parsedZones,
  categoryCatalog,
  categoriesById,
  badges,
}) {
  const [mapLocationFilters, setMapLocationFilters] = useState(() => ({
    ...MAP_LOCATION_FILTER_DEFAULTS,
  }));
  const [categoryDefaultsApplied, setCategoryDefaultsApplied] = useState(false);
  const mapLocationSearchRef = useRef(null);

  // Nouvelle carte : filtres remis à zéro (avant l'application des catégories d'office).
  useEffect(() => {
    setMapLocationFilters({ ...MAP_LOCATION_FILTER_DEFAULTS });
  }, [activeMapId]);

  // Catégories cochées d'office (réglage admin `ui.map.default_category_ids`).
  useEffect(() => {
    if (categoryDefaultsApplied || !(categoryCatalog || []).length) return;
    const raw =
      publicSettings?.map?.default_category_ids ??
      publicSettings?.ui?.map?.default_category_ids ??
      '';
    const ids = parseCategoryIdsSetting(raw).filter((id) => categoriesById.has(id));
    if (ids.length) {
      setMapLocationFilters((prev) => ({ ...prev, categoryIds: ids }));
    }
    setCategoryDefaultsApplied(true);
  }, [categoryDefaultsApplied, categoryCatalog, categoriesById, publicSettings]);

  const mapSpeciesOptions = useMemo(
    () => collectMapSpeciesOptions(zones, markersOnMap),
    [zones, markersOnMap],
  );

  // Options du filtre « Catégories » : celles réellement portées par les lieux affichés,
  // complétées par le catalogue de la carte (une catégorie encore inutilisée reste visible).
  const mapCategoryOptions = useMemo(
    () => collectMapCategoryOptions(zones, markersOnMap, categoryCatalog),
    [zones, markersOnMap, categoryCatalog],
  );

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
    dimmedZoneIds,
    dimmedMarkerIds,
    getFilterDimSeen,
  };
}
