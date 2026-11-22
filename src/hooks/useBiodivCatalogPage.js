import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePlantCatalogFilters } from './usePlantCatalogFilters';
import { usePlantObservationCounts } from './usePlantObservationCounts';
import { useGatingSummary } from './useGatingSummary';
import { useMapSpeciesPresence } from './useMapSpeciesPresence';
import { BIODIV_PAGE_SIZE, normalizePlantIds } from '../utils/biodivCatalogLoad.js';
import { ZONE_PRESENCE_FILTER, catalogHasUsageGroups } from '../utils/plantFilters';
import { groupCatalogByUsage } from '../utils/plantCatalogHelpers.js';

/**
 * Catalogue biodiversité paginé : filtres + Voir plus + compteurs/gating sur la fenêtre
 * (ou toute la liste si chip/tri d’observation).
 *
 * La présence sur la carte active vient du serveur (`GET /api/maps/:mapId/species`) ; elle
 * est redemandée quand la carte change ou quand zones, repères ou fiches sont rechargés.
 *
 * Catalogue groupé (collège, chantier collège flux C4) : avec `catalogGrouped` et au moins une
 * fiche portant un groupe d'usage, la liste est rangée en sections repliables
 * (`groupCatalogByUsage`) ; les fiches « affichées » (compteurs, verrous) sont celles des
 * sections ouvertes — toutes pendant une recherche — et la pagination « Voir plus » ne
 * s'applique pas. Sans groupe d'usage : repli sur la liste paginée (comportement actuel).
 */
export function useBiodivCatalogPage({
  plants,
  zones,
  markers,
  activeMapId,
  defaultZonePresence = ZONE_PRESENCE_FILTER.IN_MAP,
  enableObservationChips = true,
  /** Gestion : garder les fiches « ressource », masquées de la liste des élèves par défaut. */
  includeResourceEntities = false,
  /** Brique `catalog_grouped` de la table de visibilité (collège). */
  catalogGrouped = false,
  /** Brique `featured_first` : espèces phares en tête de chaque groupe. */
  featuredFirst = false,
}) {
  const [pageSize, setPageSize] = useState(BIODIV_PAGE_SIZE);
  const [openGroupIds, setOpenGroupIds] = useState(() => new Set());
  const [obsCounts, setObsCounts] = useState({});

  const presence = useMapSpeciesPresence(activeMapId, { watch: [zones, markers, plants] });

  const {
    catalogPlants,
    filteredPlants,
    countScopePlants,
    needsFullCounts,
    filterResetKey,
    filterPanelProps,
  } = usePlantCatalogFilters(plants, presence.byPlantId, {
    defaultZonePresence,
    activeMapId,
    countsById: obsCounts,
    enableObservationChips,
    includeResourceEntities,
  });

  useEffect(() => {
    setPageSize(BIODIV_PAGE_SIZE);
  }, [filterResetKey]);

  const groupingActive = catalogGrouped && catalogHasUsageGroups(catalogPlants);
  const searchActive = String(filterPanelProps.search || '').trim() !== '';

  const groups = useMemo(
    () =>
      groupingActive
        ? groupCatalogByUsage(filteredPlants, presence.byPlantId, { featuredFirst })
        : null,
    [groupingActive, filteredPlants, presence.byPlantId, featuredFirst],
  );

  const isGroupOpen = useCallback(
    (id) => searchActive || openGroupIds.has(String(id)),
    [searchActive, openGroupIds],
  );

  const toggleGroup = useCallback((id) => {
    const key = String(id);
    setOpenGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const displayedPlants = useMemo(() => {
    if (groups) {
      return groups.filter((g) => isGroupOpen(g.id)).flatMap((g) => g.plants.map((x) => x.plant));
    }
    return filteredPlants.slice(0, pageSize);
  }, [groups, isGroupOpen, filteredPlants, pageSize]);

  const biodivObservationPlantIds = useMemo(() => {
    const source = needsFullCounts ? countScopePlants : displayedPlants;
    const ids = normalizePlantIds(source.map((p) => p.id));
    ids.sort((a, b) => a - b);
    return ids;
  }, [needsFullCounts, countScopePlants, displayedPlants]);

  const { counts: plantObservationCounts, applyAcknowledged: applyObservationAcknowledged } =
    usePlantObservationCounts(biodivObservationPlantIds, plants.length);

  useEffect(() => {
    setObsCounts(plantObservationCounts);
  }, [plantObservationCounts]);

  const { summaries: plantGatingSummaries, refresh: refreshPlantGating } = useGatingSummary(
    'plant',
    biodivObservationPlantIds,
  );

  const hasMore = !groups && filteredPlants.length > displayedPlants.length;
  const nextBatch = Math.min(
    BIODIV_PAGE_SIZE,
    Math.max(0, filteredPlants.length - displayedPlants.length),
  );

  const showMore = () => {
    setPageSize((n) => n + BIODIV_PAGE_SIZE);
  };

  const countsReady = Object.keys(obsCounts).length > 0 || biodivObservationPlantIds.length === 0;

  return {
    /** Catalogue proposé à ce public (sans les fiches « ressource » côté élève). */
    catalogPlants,
    filteredPlants,
    displayedPlants,
    presenceByPlantId: presence.byPlantId,
    presenceStatus: presence.status,
    filterPanelProps: { ...filterPanelProps, countsReady, presenceStatus: presence.status },
    plantObservationCounts: obsCounts,
    applyObservationAcknowledged,
    plantGatingSummaries,
    refreshPlantGating,
    hasMore,
    nextBatch,
    showMore,
    pageSize,
    /** Sections par groupe d'usage (`null` hors catalogue groupé). */
    groups,
    groupingActive,
    isGroupOpen,
    toggleGroup,
  };
}
