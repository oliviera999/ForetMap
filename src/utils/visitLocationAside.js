import { orderedLivingBeingsForForm } from './livingBeings';
import { isInfrastructureLocation } from './locationCategories.js';
import {
  tutorialLocationIds,
  tutorialsFromTasksAtLocation,
  livingBeingNamesFromTasksAtLocation,
  dedupeTutorialsById,
} from './mapLocationContext';

/** Aside vide (aucune sélection) — même forme que le résultat calculé. */
export const EMPTY_VISIT_LOCATION_ASIDE = Object.freeze({
  showBiodiversity: false,
  showTutos: false,
  primaryLivingNames: [],
  primaryLivingSpecies: [],
  livingBeingsOnlyOnTasks: [],
  tutorialListForPreview: [],
  locationKind: 'zone',
});

/**
 * Source de biodiversité d'un lieu : la zone / le repère **de la carte** quand l'écran en
 * dispose (élève ou prof connecté), sinon la ligne de visite elle-même.
 *
 * `GET /api/visit/content` publie désormais `species`, `living_beings_list` et
 * `is_infrastructure` : c'est la seule source disponible en **visite invitée**, où les
 * routes `/api/zones` et `/api/markers` sont hors de portée. Les deux formes portent les
 * mêmes champs, la dérivation est donc identique.
 *
 * @param {object|null} mapLocation zone/repère de la carte (peut manquer)
 * @param {object} visitLocation ligne de visite sélectionnée
 */
function biodiversitySourceForLocation(mapLocation, visitLocation) {
  if (!mapLocation) return visitLocation || null;
  const mapNames = orderedLivingBeingsForForm(
    mapLocation.living_beings_list || mapLocation.living_beings,
    mapLocation.current_plant || mapLocation.plant_name,
  );
  if (mapNames.length > 0) return mapLocation;
  // Zone de carte connue mais sans espèce : le contenu de visite peut en porter (cache
  // client de la carte plus ancien que le contenu public, par exemple).
  const visitNames = orderedLivingBeingsForForm(
    visitLocation?.living_beings_list,
    visitLocation?.current_plant || visitLocation?.plant_name,
  );
  return visitNames.length > 0 ? visitLocation : mapLocation;
}

/** Espèces (id, nom, emoji) du lieu, dans l'ordre des noms affichés. */
function speciesForDisplayedNames(source, names) {
  const species = Array.isArray(source?.species) ? source.species : [];
  if (species.length === 0) return [];
  const byName = new Map(
    species
      .filter((sp) => sp && String(sp.name || '').trim())
      .map((sp) => [String(sp.name).trim(), sp]),
  );
  return names.map((name) => byName.get(name)).filter(Boolean);
}

/**
 * Biodiversité et tutoriels liés au lieu sélectionné en visite (aligné sur les
 * panneaux zone/repère de la carte). Extrait de `VisitView` (O6), comportement inchangé.
 *
 * @param {object|null} selected zone ou repère **visite** sélectionné·e
 * @param {'zone'|'marker'|null} selectedType
 * @param {{ mapId: string, mapZones: Array, mapMarkers: Array, tasks: Array,
 *   catalogTutorials: Array, isTeacher: boolean }} ctx données carte/missions/catalogue
 * @returns {{ showBiodiversity: boolean, showTutos: boolean, primaryLivingNames: string[],
 *   livingBeingsOnlyOnTasks: string[], tutorialListForPreview: Array, locationKind: 'zone'|'marker' }}
 */
export function computeVisitLocationAside(
  selected,
  selectedType,
  {
    mapId,
    mapZones = [],
    mapMarkers = [],
    tasks = [],
    catalogTutorials = [],
    isTeacher = false,
  } = {},
) {
  if (!selected || !selectedType) return EMPTY_VISIT_LOCATION_ASIDE;
  const catalog = catalogTutorials || [];
  const taskList = tasks || [];
  if (selectedType === 'zone') {
    const mapZone = (mapZones || []).find(
      (z) => String(z.id) === String(selected.id) && String(z.map_id || '') === String(mapId),
    );
    const zoneSource = biodiversitySourceForLocation(mapZone, selected);
    const zoneIsInfrastructure = isInfrastructureLocation(zoneSource);
    const primaryLivingNames = zoneSource
      ? orderedLivingBeingsForForm(
          zoneSource.living_beings_list || zoneSource.living_beings,
          zoneSource.current_plant,
        )
      : [];
    const livingFromTasks = livingBeingNamesFromTasksAtLocation('zone', selected.id, taskList);
    const livingBeingsOnlyOnTasks = livingFromTasks.filter((n) => !primaryLivingNames.includes(n));
    const showBiodiversity =
      !zoneIsInfrastructure &&
      (primaryLivingNames.length > 0 || livingBeingsOnlyOnTasks.length > 0);
    const linkedTutorialsDirect = catalog.filter((tu) =>
      tutorialLocationIds(tu).zoneIds.some((id) => String(id) === String(selected.id)),
    );
    const tutorialsFromTasksHere = tutorialsFromTasksAtLocation(
      'zone',
      selected.id,
      taskList,
      catalog,
    );
    const linkedTutorialsAll = dedupeTutorialsById([
      ...linkedTutorialsDirect,
      ...tutorialsFromTasksHere,
    ]);
    const linkedTutorialsVisible = isTeacher
      ? linkedTutorialsAll
      : linkedTutorialsAll.filter((tu) => tu.is_active !== false);
    const tutorialListForPreview = isTeacher ? linkedTutorialsAll : linkedTutorialsVisible;
    return {
      showBiodiversity,
      showTutos: tutorialListForPreview.length > 0,
      primaryLivingNames,
      primaryLivingSpecies: speciesForDisplayedNames(zoneSource, primaryLivingNames),
      livingBeingsOnlyOnTasks,
      tutorialListForPreview,
      locationKind: 'zone',
    };
  }
  const mapMarker = (mapMarkers || []).find(
    (m) => String(m.id) === String(selected.id) && String(m.map_id || '') === String(mapId),
  );
  const markerSource = biodiversitySourceForLocation(mapMarker, selected);
  const primaryLivingNames = markerSource
    ? orderedLivingBeingsForForm(
        markerSource.living_beings_list || markerSource.living_beings,
        markerSource.plant_name,
      )
    : [];
  const livingFromTasks = livingBeingNamesFromTasksAtLocation('marker', selected.id, taskList);
  const livingBeingsOnlyOnTasks = livingFromTasks.filter((n) => !primaryLivingNames.includes(n));
  const showBiodiversity = primaryLivingNames.length > 0 || livingBeingsOnlyOnTasks.length > 0;
  const linkedTutorialsDirect = catalog.filter((tu) =>
    tutorialLocationIds(tu).markerIds.some((id) => String(id) === String(selected.id)),
  );
  const tutorialsFromTasksHere = tutorialsFromTasksAtLocation(
    'marker',
    selected.id,
    taskList,
    catalog,
  );
  const linkedTutorialsAll = dedupeTutorialsById([
    ...linkedTutorialsDirect,
    ...tutorialsFromTasksHere,
  ]);
  const linkedTutorialsVisible = isTeacher
    ? linkedTutorialsAll
    : linkedTutorialsAll.filter((tu) => tu.is_active !== false);
  const tutorialListForPreview = isTeacher ? linkedTutorialsAll : linkedTutorialsVisible;
  return {
    showBiodiversity,
    showTutos: tutorialListForPreview.length > 0,
    primaryLivingNames,
    primaryLivingSpecies: speciesForDisplayedNames(markerSource, primaryLivingNames),
    livingBeingsOnlyOnTasks,
    tutorialListForPreview,
    locationKind: 'marker',
  };
}
