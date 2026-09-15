import { useMemo, useState } from 'react';
import { ZONE_PRESENCE_FILTER, plantMatchesAllFilters } from '../utils/plantFilters';

/**
 * État partagé des filtres du catalogue biodiversité (PlantManager / PlantViewer).
 *
 * Regroupe les états de filtre (recherche + taxonomie + habitat/rôle/milieu/statuts
 * biogéographique et UICN + présence sur la carte), le memo `structured` et le calcul
 * mémoïsé de `filteredPlants`.
 * `defaultZonePresence` permet d’ouvrir le catalogue élève déjà filtré sur la carte active
 * sans exposer un second modèle de rattachement.
 *
 * Retourne aussi `filterPanelProps`, à étaler tel quel sur `<PlantCatalogFilterPanel />`.
 */
export function usePlantCatalogFilters(
  plants,
  zones,
  markers,
  { defaultZonePresence = ZONE_PRESENCE_FILTER.ALL, activeMapId = null } = {},
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

  const filteredPlants = useMemo(
    () =>
      plants.filter((p) =>
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
      originStatus,
      setOriginStatus,
      iucnStatus,
      setIucnStatus,
      zonePresence,
      setZonePresence,
      defaultZonePresence,
    },
  };
}
