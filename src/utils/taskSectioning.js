/**
 * Logique pure de filtrage et de sectionnement de la vue Tâches.
 *
 * Extraite de `tasks-views.jsx` (O6) : application des filtres (carte, texte, lieu,
 * statut, projet, groupe, catégorie urgent), projets visibles selon le filtre carte,
 * répartition des tâches par statut effectif et échéances proches côté élève.
 * Sans React ni I/O (l'horloge locale est lue via `taskEffectiveStatus`/`daysUntil`),
 * testable unitairement (`tests-ui/utils/taskSectioning.test.js`).
 */

import { daysUntil } from './badges';
import {
  compareTasksByImportanceThenDueDate,
  taskEffectiveStatus,
  taskHasLocation,
} from './taskListHelpers.js';
import {
  taskEffectiveMapId,
  taskMapIdMatchesFilter,
} from './taskLocationPicker.js';

/** Tâche marquée « importance absolue » (affichage urgence). */
export function isTaskUrgentCategory(task) {
  return String(task?.importance_level || '').trim().toLowerCase() === 'absolute';
}

/** Une tâche passe-t-elle l'ensemble des filtres de la vue Tâches ? */
export function taskMatchesFilters(t, {
  filterMap,
  activeMapId,
  filterText = '',
  filterZone = '',
  filterStatus = '',
  filterProject = '',
  filterGroupId = '',
  filterUrgentCategory = '',
} = {}) {
  if (!taskMapIdMatchesFilter(taskEffectiveMapId(t), filterMap, activeMapId)) return false;
  if (filterText && !t.title.toLowerCase().includes(filterText.toLowerCase()) &&
    !(t.description || '').toLowerCase().includes(filterText.toLowerCase())) return false;
  if (filterZone && !taskHasLocation(t, filterZone)) return false;
  if (filterStatus) {
    const eff = taskEffectiveStatus(t);
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
  if (filterProject && t.project_id !== filterProject) return false;
  if (filterGroupId && String(t.group_id || '') !== String(filterGroupId)) return false;
  if (filterUrgentCategory === 'urgent' && !isTaskUrgentCategory(t)) return false;
  if (filterUrgentCategory === 'non_urgent' && isTaskUrgentCategory(t)) return false;
  return true;
}

/** Liste des tâches passant les filtres de la vue (ordre d'origine conservé). */
export function applyTaskFilters(list, filters) {
  return list.filter((t) => taskMatchesFilters(t, filters));
}

/** Un projet passe-t-il le filtre carte (`active` / `all` / id de carte) ? */
export function projectMatchesMapChoice(p, filterMap, activeMapId) {
  if (filterMap === 'all') return true;
  if (filterMap === 'active') return p.map_id === activeMapId;
  return p.map_id === filterMap;
}

/** Projets passant le filtre carte (ordre d'origine conservé — options du sélecteur projet). */
export function filterProjectsByMapChoice(projects, filterMap, activeMapId) {
  return projects.filter((p) => projectMatchesMapChoice(p, filterMap, activeMapId));
}

/** Projets visibles (filtre carte) triés par titre (fr) — blocs projets de la vue. */
export function sortedVisibleProjects(projects, filterMap, activeMapId) {
  return filterProjectsByMapChoice(projects, filterMap, activeMapId)
    .slice()
    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'fr'));
}

/** Répartit les tâches (hors urgent / projets visibles) par statut effectif — sections de la vue. */
export function partitionTasksByEffectiveStatus(regularFiltered) {
  return {
    available: regularFiltered.filter((t) => taskEffectiveStatus(t) === 'available'),
    inProgress: regularFiltered.filter((t) => taskEffectiveStatus(t) === 'in_progress'),
    done: regularFiltered.filter((t) => taskEffectiveStatus(t) === 'done'),
    validated: regularFiltered.filter((t) => taskEffectiveStatus(t) === 'validated'),
    proposed: regularFiltered.filter((t) => taskEffectiveStatus(t) === 'proposed'),
    onHold: regularFiltered.filter((t) => taskEffectiveStatus(t) === 'on_hold'),
    projectCompletedTasks: regularFiltered.filter((t) => taskEffectiveStatus(t) === 'project_completed'),
    projectValidatedTasks: regularFiltered.filter((t) => taskEffectiveStatus(t) === 'project_validated'),
  };
}

/** Bandeau « Échéances proches » côté élève : tâches actives dues entre J-2 (retard) et J+3, triées par importance puis échéance. */
export function studentUrgentDueTasks(regularFiltered) {
  return regularFiltered.filter((t) => {
    const effective = taskEffectiveStatus(t);
    if (effective === 'validated' || effective === 'done' || effective === 'on_hold' || effective === 'project_completed' || effective === 'project_validated') return false;
    const d = daysUntil(t.due_date);
    return d !== null && d <= 3 && d >= -2;
  }).sort(compareTasksByImportanceThenDueDate);
}
