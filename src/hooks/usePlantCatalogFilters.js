import { useMemo, useState } from 'react';
import {
  ZONE_PRESENCE_FILTER,
  plantMatchesAllFilters,
  plantsForStudentCatalog,
} from '../utils/plantFilters';
import {
  BIODIV_SORT,
  applyBiodivQuickChips,
  sortBiodivPlants,
} from '../utils/biodivCatalogLoad.js';

/**
 * État partagé des filtres / tri / chips du catalogue biodiversité
 * (PlantManager / PlantViewer).
 *
 * @param {Array<object>} plants catalogue
 * @param {Map<number, object>|null} presenceByPlantId présence sur la carte active, telle
 *   que la renvoie le serveur (`useMapSpeciesPresence`) ; `null` tant qu'elle est inconnue
 */
export function usePlantCatalogFilters(
  plants,
  presenceByPlantId,
  {
    defaultZonePresence = ZONE_PRESENCE_FILTER.ALL,
    activeMapId = null,
    countsById = null,
    /** Inclure les chips d’observation (élève) et le tri « récemment observées ». */
    enableObservationChips = false,
    /**
     * Garder les fiches « ressource » (matière non vivante). `false` par défaut : elles sont
     * absentes de la liste et de la recherche des élèves ; la gestion passe `true`.
     */
    includeResourceEntities = false,
  } = {},
) {
  const [search, setSearch] = useState('');
  const [group1, setGroup1] = useState('');
  const [group2, setGroup2] = useState('');
  const [group3, setGroup3] = useState('');
  /** Filtre « Groupe » du catalogue collège (groupe d'usage), à la place de la taxonomie. */
  const [usageGroup, setUsageGroup] = useState('');
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
      usageGroup,
      habitat,
      trophicRole,
      habitatType,
      originStatus,
      iucnStatus,
    }),
    [
      group1,
      group2,
      group3,
      usageGroup,
      habitat,
      trophicRole,
      habitatType,
      originStatus,
      iucnStatus,
    ],
  );

  const queryTrimmedLower = search.trim().toLowerCase();

  /** Catalogue proposé à ce public : base de la liste, de la recherche et des compteurs. */
  const catalogPlants = useMemo(
    () => plantsForStudentCatalog(plants, { includeResourceEntities }),
    [plants, includeResourceEntities],
  );

  const baseFiltered = useMemo(
    () =>
      catalogPlants.filter((p) =>
        plantMatchesAllFilters(
          p,
          { structured, queryTrimmedLower, zonePresence },
          presenceByPlantId,
        ),
      ),
    [catalogPlants, structured, queryTrimmedLower, zonePresence, presenceByPlantId],
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
    usageGroup,
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
    catalogPlants,
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
      usageGroup,
      setUsageGroup,
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
