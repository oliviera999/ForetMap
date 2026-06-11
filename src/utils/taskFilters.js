/**
 * Filtrage pur des tâches (carte / texte / lieu / statut / projet / groupe / urgence) — extrait
 * de `tasks-views.jsx` (O6). Le composant détient l'état des filtres et délègue le prédicat ici.
 */

import { taskHasLocation, taskEffectiveStatus } from './taskListHelpers.js';
import { isTaskUrgentCategory } from '../components/tasks/taskViewHelpers.js';

/** Carte effective d'une tâche : `map_id_resolved` → `map_id` → carte de zone/repère → null. */
export function taskEffectiveMapId(task) {
  return task.map_id_resolved || task.map_id || task.zone_map_id || task.marker_map_id || null;
}

/**
 * Vrai si la tâche passe l'ensemble des filtres actifs.
 * @param {object} task
 * @param {{ filterMap?: string, filterText?: string, filterZone?: string, filterStatus?: string,
 *           filterProject?: string, filterGroupId?: string|number, filterUrgentCategory?: string }} filters
 * @param {string} activeMapId carte active (pour `filterMap === 'active'`)
 */
export function taskMatchesFilters(task, filters = {}, activeMapId = null) {
  const {
    filterMap, filterText, filterZone, filterStatus, filterProject, filterGroupId, filterUrgentCategory,
  } = filters;
  const taskMapId = taskEffectiveMapId(task);
  if (filterMap === 'active' && taskMapId !== activeMapId && taskMapId != null) return false;
  if (filterMap !== 'active' && filterMap !== 'all' && taskMapId !== filterMap && taskMapId != null) return false;
  if (filterText && !task.title.toLowerCase().includes(filterText.toLowerCase()) &&
    !(task.description || '').toLowerCase().includes(filterText.toLowerCase())) return false;
  if (filterZone && !taskHasLocation(task, filterZone)) return false;
  if (filterStatus) {
    const eff = taskEffectiveStatus(task);
    let matches = eff === filterStatus;
    if (filterStatus === 'validated') {
      matches = eff === 'validated' || eff === 'project_validated';
    } else if (filterStatus === 'on_hold') {
      matches = eff === 'on_hold';
    } else if (filterStatus === 'project_completed') {
      matches = eff === 'project_completed';
    } else if (filterStatus === 'project_validated') {
      matches = eff === 'project_validated';
    }
    if (!matches) return false;
  }
  if (filterProject && task.project_id !== filterProject) return false;
  if (filterGroupId && String(task.group_id || '') !== String(filterGroupId)) return false;
  if (filterUrgentCategory === 'urgent' && !isTaskUrgentCategory(task)) return false;
  if (filterUrgentCategory === 'non_urgent' && isTaskUrgentCategory(task)) return false;
  return true;
}
