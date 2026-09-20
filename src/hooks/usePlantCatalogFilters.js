import { useMemo, useState } from 'react';
import { ZONE_PRESENCE_FILTER, plantMatchesAllFilters } from '../utils/plantFilters';
import {
  BIODIV_SORT,
  applyBiodivQuickChips,
  sortBiodivPlants,
} from '../utils/biodivCatalogLoad.js';

/**
 * État partagé des filtres / tri / chips du catalogue biodiversité
 * (PlantManager / PlantViewer).
 */
export function usePlantCatalogFilters(
  plants,
  zones,
  markers,
  {
    defaultZonePresence = ZONE_PRESENCE_FILTER.ALL,
    activeMapId = null,
    countsById = null,
    /** Inclure les chips d’observation (élève) et le tri « récemment observées ». */
    enableObservationChips = false,
  } = {},
) {
  const [search, setSearch] = useState('');
  const [group1, setGroup1] = useState('');
  const [group2, setGroup2] = useState('');
  const [group3, setGroup3] = useState('');
  const [habitat, setHabitat] = useState('');
  const [trophicRole, setTrophicRole] = useState('');
  const [habitatType, setHabitatType] = useState('');
  const [originStatus, setOriginStatus] = useState('');
  const [iucnStatus, setIucnStatus] = useState('');
  const [zonePresence, setZonePresence] = useState(defaultZonePresence);
  const [edibleOnly, setEdibleOnly] = useState(false);
  const [iucnThreatenedOnly, setIucnThreatenedOnly] = useState(false);
  const [observationChip, setObservationChip] = useState(''); // '' | 'mine' | 'unseen'
  const [sortKey, setSortKey] = useState(BIODIV_SORT.NAME_ASC);

  const structured = useMemo(
    () => ({
      group1,
      group2,
      group3,
      habitat,
      trophicRole,
      habitatType,
      originStatus,
      iucnStatus,
    }),
    [group1, group2, group3, habitat, trophicRole, habitatType, originStatus, iucnStatus],
  );

  const queryTrimmedLower = search.trim().toLowerCase();

  const baseFiltered = useMemo(
    () =>
      (Array.isArray(plants) ? plants : []).filter((p) =>
        plantMatchesAllFilters(
          p,
          { structured, queryTrimmedLower, zonePresence },
          zones,
          markers,
          activeMapId,
        ),
      ),
    [plants, structured, queryTrimmedLower, zonePresence, zones, markers, activeMapId],
  );

  const chipFiltered = useMemo(() => {
    const needsCounts =
      enableObservationChips && (observationChip === 'mine' || observationChip === 'unseen');
    return applyBiodivQuickChips(
      baseFiltered,
      {
        edibleOnly,
        iucnThreatenedOnly,
        observation: needsCounts ? observationChip : '',
      },
      needsCounts ? countsById : null,
    );
  }, [
    baseFiltered,
    edibleOnly,
    iucnThreatenedOnly,
    observationChip,
    enableObservationChips,
    countsById,
  ]);

  /** Liste pour laquelle charger les compteurs quand un chip/tri d’observation est actif. */
  const countScopePlants = useMemo(
    () => applyBiodivQuickChips(baseFiltered, { edibleOnly, iucnThreatenedOnly }, null),
    [baseFiltered, edibleOnly, iucnThreatenedOnly],
  );

  const filteredPlants = useMemo(
    () => sortBiodivPlants(chipFiltered, sortKey, countsById),
    [chipFiltered, sortKey, countsById],
  );

  /** True si les compteurs doivent couvrir toute la liste filtrée (pas seulement la page). */
  const needsFullCounts =
    enableObservationChips &&
    (observationChip === 'mine' ||
      observationChip === 'unseen' ||
      sortKey === BIODIV_SORT.RECENT_OBSERVED);

  /** Clé pour réinitialiser la pagination « Voir plus » quand les filtres changent. */
  const filterResetKey = [
    search,
    group1,
    group2,
    group3,
    habitat,
    trophicRole,
    habitatType,
    originStatus,
    iucnStatus,
    zonePresence,
    edibleOnly,
    iucnThreatenedOnly,
    observationChip,
    sortKey,
    activeMapId,
  ].join('|');

  return {
    filteredPlants,
    baseFiltered,
    countScopePlants,
    needsFullCounts,
    filterResetKey,
    filterPanelProps: {
      search,
      setSearch,
      group1,
      setGroup1,
      group2,
      setGroup2,
      group3,
      setGroup3,
      habitat,
      setHabitat,
      trophicRole,
      setTrophicRole,
      habitatType,
      setHabitatType,
      originStatus,
      setOriginStatus,
      iucnStatus,
      setIucnStatus,
      zonePresence,
      setZonePresence,
      defaultZonePresence,
      edibleOnly,
      setEdibleOnly,
      iucnThreatenedOnly,
      setIucnThreatenedOnly,
      observationChip,
      setObservationChip,
      sortKey,
      setSortKey,
      enableObservationChips,
    },
  };
}
