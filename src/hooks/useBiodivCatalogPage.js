import { useEffect, useMemo, useState } from 'react';
import { usePlantCatalogFilters } from './usePlantCatalogFilters';
import { usePlantObservationCounts } from './usePlantObservationCounts';
import { useGatingSummary } from './useGatingSummary';
import { BIODIV_PAGE_SIZE, normalizePlantIds } from '../utils/biodivCatalogLoad.js';
import { ZONE_PRESENCE_FILTER } from '../utils/plantFilters';

/**
 * Catalogue biodiversité paginé : filtres + Voir plus + compteurs/gating sur la fenêtre
 * (ou toute la liste si chip/tri d’observation).
 */
export function useBiodivCatalogPage({
  plants,
  zones,
  markers,
  activeMapId,
  defaultZonePresence = ZONE_PRESENCE_FILTER.IN_MAP,
  enableObservationChips = true,
}) {
  const [pageSize, setPageSize] = useState(BIODIV_PAGE_SIZE);
  const [obsCounts, setObsCounts] = useState({});

  const { filteredPlants, countScopePlants, needsFullCounts, filterResetKey, filterPanelProps } =
    usePlantCatalogFilters(plants, zones, markers, {
      defaultZonePresence,
      activeMapId,
      countsById: obsCounts,
      enableObservationChips,
    });

  useEffect(() => {
    setPageSize(BIODIV_PAGE_SIZE);
  }, [filterResetKey]);

  const displayedPlants = useMemo(
    () => filteredPlants.slice(0, pageSize),
    [filteredPlants, pageSize],
  );

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

  const hasMore = filteredPlants.length > displayedPlants.length;
  const nextBatch = Math.min(
    BIODIV_PAGE_SIZE,
    Math.max(0, filteredPlants.length - displayedPlants.length),
  );

  const showMore = () => {
    setPageSize((n) => n + BIODIV_PAGE_SIZE);
  };

  const countsReady = Object.keys(obsCounts).length > 0 || biodivObservationPlantIds.length === 0;

  return {
    filteredPlants,
    displayedPlants,
    filterPanelProps: { ...filterPanelProps, countsReady },
    plantObservationCounts: obsCounts,
    applyObservationAcknowledged,
    plantGatingSummaries,
    refreshPlantGating,
    hasMore,
    nextBatch,
    showMore,
    pageSize,
  };
}
