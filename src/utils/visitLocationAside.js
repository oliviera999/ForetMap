import { orderedLivingBeingsForForm } from './livingBeings';
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
  livingBeingsOnlyOnTasks: [],
  tutorialListForPreview: [],
  locationKind: 'zone',
});

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
export function computeVisitLocationAside(selected, selectedType, {
  mapId,
  mapZones = [],
  mapMarkers = [],
  tasks = [],
  catalogTutorials = [],
  isTeacher = false,
} = {}) {
  if (!selected || !selectedType) return EMPTY_VISIT_LOCATION_ASIDE;
  const catalog = catalogTutorials || [];
  const taskList = tasks || [];
  if (selectedType === 'zone') {
    const mapZone = (mapZones || []).find(
      (z) => String(z.id) === String(selected.id) && String(z.map_id || '') === String(mapId),
    );
    const zoneSpecial = !!mapZone?.special;
    const primaryLivingNames = mapZone
      ? orderedLivingBeingsForForm(mapZone.living_beings_list || mapZone.living_beings, mapZone.current_plant)
      : [];
    const livingFromTasks = livingBeingNamesFromTasksAtLocation('zone', selected.id, taskList);
    const livingBeingsOnlyOnTasks = livingFromTasks.filter((n) => !primaryLivingNames.includes(n));
    const showBiodiversity = !zoneSpecial && (primaryLivingNames.length > 0 || livingBeingsOnlyOnTasks.length > 0);
    const linkedTutorialsDirect = catalog.filter((tu) => (
      tutorialLocationIds(tu).zoneIds.some((id) => String(id) === String(selected.id))
    ));
    const tutorialsFromTasksHere = tutorialsFromTasksAtLocation('zone', selected.id, taskList, catalog);
    const linkedTutorialsAll = dedupeTutorialsById([...linkedTutorialsDirect, ...tutorialsFromTasksHere]);
    const linkedTutorialsVisible = isTeacher
      ? linkedTutorialsAll
      : linkedTutorialsAll.filter((tu) => tu.is_active !== false);
    const tutorialListForPreview = isTeacher ? linkedTutorialsAll : linkedTutorialsVisible;
    return {
      showBiodiversity,
      showTutos: tutorialListForPreview.length > 0,
      primaryLivingNames,
      livingBeingsOnlyOnTasks,
      tutorialListForPreview,
      locationKind: 'zone',
    };
  }
  const mapMarker = (mapMarkers || []).find(
    (m) => String(m.id) === String(selected.id) && String(m.map_id || '') === String(mapId),
  );
  const primaryLivingNames = mapMarker
    ? orderedLivingBeingsForForm(mapMarker.living_beings_list || mapMarker.living_beings, mapMarker.plant_name)
    : [];
  const livingFromTasks = livingBeingNamesFromTasksAtLocation('marker', selected.id, taskList);
  const livingBeingsOnlyOnTasks = livingFromTasks.filter((n) => !primaryLivingNames.includes(n));
  const showBiodiversity = primaryLivingNames.length > 0 || livingBeingsOnlyOnTasks.length > 0;
  const linkedTutorialsDirect = catalog.filter((tu) => (
    tutorialLocationIds(tu).markerIds.some((id) => String(id) === String(selected.id))
  ));
  const tutorialsFromTasksHere = tutorialsFromTasksAtLocation('marker', selected.id, taskList, catalog);
  const linkedTutorialsAll = dedupeTutorialsById([...linkedTutorialsDirect, ...tutorialsFromTasksHere]);
  const linkedTutorialsVisible = isTeacher
    ? linkedTutorialsAll
    : linkedTutorialsAll.filter((tu) => tu.is_active !== false);
  const tutorialListForPreview = isTeacher ? linkedTutorialsAll : linkedTutorialsVisible;
  return {
    showBiodiversity,
    showTutos: tutorialListForPreview.length > 0,
    primaryLivingNames,
    livingBeingsOnlyOnTasks,
    tutorialListForPreview,
    locationKind: 'marker',
  };
}
