import { useMemo, useState } from 'react';
import { ZONE_PRESENCE_FILTER, plantMatchesAllFilters } from '../utils/plantFilters';

/**
 * État partagé des filtres du catalogue biodiversité (PlantManager / PlantViewer).
 *
 * Regroupe les 7 états de filtre (recherche + taxonomie + habitat/rôle/milieu + présence
 * en zone), le memo `structured` et le calcul mémoïsé de `filteredPlants` — auparavant
 * dupliqués dans les deux composants. `zonePresence` démarre sur `ALL` : un appelant qui
 * n'affiche pas ce filtre (PlantManager) obtient donc le même résultat qu'avant.
 *
 * Retourne aussi `filterPanelProps`, à étaler tel quel sur `<PlantCatalogFilterPanel />`.
 */
export function usePlantCatalogFilters(plants, zones, markers) {
  const [search, setSearch] = useState('');
  const [group1, setGroup1] = useState('');
  const [group2, setGroup2] = useState('');
  const [group3, setGroup3] = useState('');
  const [habitat, setHabitat] = useState('');
  const [trophicRole, setTrophicRole] = useState('');
  const [habitatType, setHabitatType] = useState('');
  const [zonePresence, setZonePresence] = useState(ZONE_PRESENCE_FILTER.ALL);

  const structured = useMemo(
    () => ({
      group1,
      group2,
      group3,
      habitat,
      trophicRole,
      habitatType,
    }),
    [group1, group2, group3, habitat, trophicRole, habitatType],
  );

  const queryTrimmedLower = search.trim().toLowerCase();

  const filteredPlants = useMemo(
    () =>
      plants.filter((p) =>
        plantMatchesAllFilters(p, { structured, queryTrimmedLower, zonePresence }, zones, markers),
      ),
    [plants, structured, queryTrimmedLower, zonePresence, zones, markers],
  );

  return {
    filteredPlants,
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
      zonePresence,
      setZonePresence,
    },
  };
}
