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
  primaryLivingPresence: [],
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
  );
  if (mapNames.length > 0) return mapLocation;
  // Zone de carte connue mais sans espèce : le contenu de visite peut en porter (cache
  // client de la carte plus ancien que le contenu public, par exemple).
  const visitNames = orderedLivingBeingsForForm(visitLocation?.living_beings_list);
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
 * Présence des espèces du lieu (`is_featured`, `validation_status`) : toujours celle du
 * **contenu de visite** (`GET /api/visit/content`, chantier collège C5), même quand les noms
 * viennent de la zone de la carte — les zones de `/api/zones` ne la portent pas.
 */
function visitLocationPresence(visitLocation) {
  return Array.isArray(visitLocation?.species) ? visitLocation.species : [];
}

/** Clés propres à chaque nature de lieu (seules différences entre zone et repère). */
const LOCATION_KIND_CONFIG = Object.freeze({
  zone: Object.freeze({ tutorialIdsKey: 'zoneIds', infraGate: true }),
  marker: Object.freeze({ tutorialIdsKey: 'markerIds', infraGate: false }),
});

/**
 * Biodiversité et tutoriels liés au lieu sélectionné en visite (aligné sur les
 * panneaux zone/repère de la carte). Extrait de `VisitView` (O6), comportement inchangé.
 *
 * Une seule dérivation pour la zone et le repère (refacto C5 du chantier collège : les deux
 * branches étaient recopiées) ; seule la zone d'infrastructure masque la biodiversité.
 *
 * @param {object|null} selected zone ou repère **visite** sélectionné·e
 * @param {'zone'|'marker'|null} selectedType
 * @param {{ mapId: string, mapZones: Array, mapMarkers: Array, tasks: Array,
 *   catalogTutorials: Array, isTeacher: boolean }} ctx données carte/missions/catalogue
 * @returns {{ showBiodiversity: boolean, showTutos: boolean, primaryLivingNames: string[],
 *   primaryLivingSpecies: Array, primaryLivingPresence: Array,
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
  const kind = selectedType === 'zone' ? 'zone' : 'marker';
  const config = LOCATION_KIND_CONFIG[kind];
  const catalog = catalogTutorials || [];
  const taskList = tasks || [];
  const mapList = (kind === 'zone' ? mapZones : mapMarkers) || [];

  const mapLocation = mapList.find(
    (l) => String(l.id) === String(selected.id) && String(l.map_id || '') === String(mapId),
  );
  const source = biodiversitySourceForLocation(mapLocation, selected);
  const primaryLivingNames = source
    ? orderedLivingBeingsForForm(source.living_beings_list || source.living_beings)
    : [];
  const livingFromTasks = livingBeingNamesFromTasksAtLocation(kind, selected.id, taskList);
  const livingBeingsOnlyOnTasks = livingFromTasks.filter((n) => !primaryLivingNames.includes(n));
  const hidesBiodiversity = config.infraGate && isInfrastructureLocation(source);
  const showBiodiversity =
    !hidesBiodiversity && (primaryLivingNames.length > 0 || livingBeingsOnlyOnTasks.length > 0);

  const linkedTutorialsDirect = catalog.filter((tu) =>
    tutorialLocationIds(tu)[config.tutorialIdsKey].some((id) => String(id) === String(selected.id)),
  );
  const tutorialsFromTasksHere = tutorialsFromTasksAtLocation(kind, selected.id, taskList, catalog);
  const linkedTutorialsAll = dedupeTutorialsById([
    ...linkedTutorialsDirect,
    ...tutorialsFromTasksHere,
  ]);
  const tutorialListForPreview = isTeacher
    ? linkedTutorialsAll
    : linkedTutorialsAll.filter((tu) => tu.is_active !== false);

  return {
    showBiodiversity,
    showTutos: tutorialListForPreview.length > 0,
    primaryLivingNames,
    primaryLivingSpecies: speciesForDisplayedNames(source, primaryLivingNames),
    primaryLivingPresence: visitLocationPresence(selected),
    livingBeingsOnlyOnTasks,
    tutorialListForPreview,
    locationKind: kind,
  };
}
