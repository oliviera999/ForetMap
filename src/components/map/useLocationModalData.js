/**
 * Dérivations communes des modales de lieu (MarkerModal / ZoneInfoModal) :
 * tâches liées / liables, tutoriels (directs, via tâches, visibles, liables),
 * êtres vivants et drapeaux du bloc « visite » de l'onglet Info. Logique copiée
 * quasi à l'identique dans les deux modales avant mutualisation (audit §5.3) —
 * seuls varient le type de lieu (`zoneIds` / `markerIds`, champ plante) et les
 * portes `isNew` (repère en création) / `special` (zone spéciale).
 */
import { useMemo } from 'react';
import { orderedLivingBeingsForForm } from '../../utils/livingBeings';
import {
  dedupeTutorialsById,
  isTaskDetachedFromLocation,
  livingBeingNamesFromTasksAtLocation,
  taskLocationIds,
  tutorialLocationIds,
  tutorialsFromTasksAtLocation,
} from '../../utils/mapLocationContext';
import { markerTaskMapId } from '../../utils/markerModalForm.js';
import { canStudentAssignTask } from '../../utils/taskEnrollment.js';
import { tutorialLinkedToSameMap } from './mapModalShared.jsx';

/**
 * @param {'marker'|'zone'} kind - type de lieu
 * @param {object} entity - repère ou zone affiché par le modal
 * @param {object} ctx - { tasks, tutorials, student, isTeacher, isNew }
 *   `isNew` (repère en création) neutralise onglets et bloc visite ; toujours false côté zone.
 */
export function useLocationModalData(
  kind,
  entity,
  { tasks, tutorials, student, isTeacher, isNew = false },
) {
  const idsKey = kind === 'zone' ? 'zoneIds' : 'markerIds';
  const entityId = entity.id;

  // Mémoïsés : l'effet de nettoyage de la sélection (dans le modal parent) dépend de
  // studentAssignableTasks — une nouvelle identité à chaque rendu provoquerait une
  // boucle rendu/effet (fix P0 « Maximum update depth exceeded », à préserver).
  const linkedTasks = useMemo(
    () =>
      (tasks || []).filter(
        (t) =>
          taskLocationIds(t)[idsKey].some((id) => String(id) === String(entityId)) &&
          !isTaskDetachedFromLocation(t),
      ),
    [tasks, entityId, idsKey],
  );
  const studentAssignableTasks = useMemo(
    () => linkedTasks.filter((t) => canStudentAssignTask(t, student)),
    [linkedTasks, student],
  );
  const assignableTasks = (tasks || []).filter((t) => {
    if (linkedTasks.some((lt) => lt.id === t.id)) return false;
    if (isTaskDetachedFromLocation(t)) return false;
    const mapId = markerTaskMapId(t);
    return mapId === entity.map_id || mapId == null;
  });
  const linkedTutorialsDirect = (tutorials || []).filter((tu) =>
    tutorialLocationIds(tu)[idsKey].some((id) => String(id) === String(entityId)),
  );
  const tutorialsFromTasksHere = tutorialsFromTasksAtLocation(kind, entityId, tasks, tutorials);
  const linkedTutorialsAll = dedupeTutorialsById([
    ...linkedTutorialsDirect,
    ...tutorialsFromTasksHere,
  ]);
  const tutorialsOnlyViaTasks = tutorialsFromTasksHere.filter(
    (tu) => !linkedTutorialsDirect.some((d) => String(d.id) === String(tu.id)),
  );
  const linkedTutorialsVisible = isTeacher
    ? linkedTutorialsAll
    : linkedTutorialsAll.filter((tu) => tu.is_active !== false);
  const assignableTutorials = (tutorials || []).filter(
    (tu) =>
      tu.is_active !== false &&
      !tutorialLocationIds(tu)[idsKey].some((id) => String(id) === String(entityId)) &&
      tutorialLinkedToSameMap(tu, entity.map_id),
  );

  // Êtres vivants du lieu (champ « plante » historique : plant_name côté repère,
  // current_plant côté zone) + ceux uniquement portés par les missions sur ce lieu.
  const livingNames = orderedLivingBeingsForForm(
    entity.living_beings_list || entity.living_beings,
    kind === 'zone' ? entity.current_plant : entity.plant_name,
  );
  const livingBeingsFromTasksHere = livingBeingNamesFromTasksAtLocation(kind, entityId, tasks);
  const livingBeingsOnlyOnTasks = livingBeingsFromTasksHere.filter((n) => !livingNames.includes(n));

  const visitAsideTutorials =
    !isNew && (isTeacher ? linkedTutorialsAll : linkedTutorialsVisible).length > 0;
  // Zone spéciale (bâtiment / infrastructure) : pas de section Biodiversité.
  const visitAsideSpecies =
    (kind === 'marker' ? !isNew : !entity.special) &&
    (livingNames.length > 0 || livingBeingsOnlyOnTasks.length > 0);
  const showVisitAsideBlock =
    !isNew &&
    !!(
      entity.visit_subtitle ||
      entity.visit_short_description ||
      entity.visit_details_text ||
      visitAsideSpecies ||
      visitAsideTutorials
    );

  const showTasksTab = !isNew && (isTeacher || (!!student && linkedTasks.length > 0));
  const showTutorialsTab = !isNew && (isTeacher || linkedTutorialsVisible.length > 0);

  return {
    linkedTasks,
    studentAssignableTasks,
    assignableTasks,
    linkedTutorialsDirect,
    linkedTutorialsAll,
    tutorialsOnlyViaTasks,
    linkedTutorialsVisible,
    assignableTutorials,
    livingNames,
    livingBeingsOnlyOnTasks,
    visitAsideTutorials,
    visitAsideSpecies,
    showVisitAsideBlock,
    showTasksTab,
    showTutorialsTab,
  };
}
