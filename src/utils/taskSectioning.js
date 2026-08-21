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
import { taskEffectiveMapId, taskMapIdMatchesFilter } from './taskLocationPicker.js';

/** Tâche marquée « importance absolue » (affichage urgence). */
export function isTaskUrgentCategory(task) {
  return (
    String(task?.importance_level || '')
      .trim()
      .toLowerCase() === 'absolute'
  );
}

/**
 * Statuts effectifs « terminaux » : plus rien n'est attendu sur la tâche.
 * `done` n'en fait pas partie (elle attend encore la validation d'un prof) ni `proposed`
 * (elle attend une décision) : ces deux-là restent des tâches sur lesquelles agir.
 */
const TERMINAL_EFFECTIVE_STATUSES = new Set(['validated', 'project_validated']);

/**
 * Tâche urgente ENCORE en cours de vie — seul critère de la section « 🚨 Urgent ! ».
 *
 * La section urgence extrait ses tâches de toutes les autres sections : sans ce filtre,
 * une tâche « Urgent ! » validée y restait bloquée et n'apparaissait jamais dans
 * « ✅ Validées » (prof) / « ✅ Récemment validées » (élève). Une fois validée, une tâche
 * n'est plus urgente : elle rejoint la section de son statut comme n'importe quelle autre.
 */
export function isTaskUrgentPending(task) {
  return isTaskUrgentCategory(task) && !TERMINAL_EFFECTIVE_STATUSES.has(taskEffectiveStatus(task));
}

/**
 * Statut de section d'une tâche affichée HORS bloc projet.
 *
 * `taskEffectiveStatus` renvoie `project_completed`/`project_validated` dès que le projet
 * porteur est terminé/validé — deux valeurs qui ne correspondent à aucune section rendue.
 * Tant que la tâche est affichée dans le bloc de son projet, c'est sans conséquence ; mais
 * une tâche dont le projet n'est PAS affiché (projet archivé sans cascade, ou archivé
 * automatiquement) disparaissait alors complètement de l'écran. On la reclasse donc sur
 * son statut propre, projet mis de côté.
 */
export function taskSectionStatus(task) {
  const effective = taskEffectiveStatus(task);
  if (effective !== 'project_completed' && effective !== 'project_validated') return effective;
  return taskEffectiveStatus({ ...task, project_status: null });
}

/** Une tâche passe-t-elle l'ensemble des filtres de la vue Tâches ? */
export function taskMatchesFilters(
  t,
  {
    filterMap,
    activeMapId,
    filterText = '',
    filterZone = '',
    filterStatus = '',
    filterProject = '',
    filterGroupId = '',
    filterUrgentCategory = '',
  } = {},
) {
  if (!taskMapIdMatchesFilter(taskEffectiveMapId(t), filterMap, activeMapId)) return false;
  if (
    filterText &&
    !t.title.toLowerCase().includes(filterText.toLowerCase()) &&
    !(t.description || '').toLowerCase().includes(filterText.toLowerCase())
  )
    return false;
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

/**
 * Répartit les tâches (hors urgent / projets visibles) par statut de section.
 *
 * Ces tâches sont, par construction, celles qui ne sont PAS rendues dans un bloc projet :
 * on les range donc sur `taskSectionStatus` et non sur le statut effectif brut, sans quoi
 * celles rattachées à un projet terminé/validé non affiché ne tomberaient dans aucune
 * section et seraient invisibles.
 */
export function partitionTasksByEffectiveStatus(regularFiltered) {
  const buckets = {
    available: [],
    inProgress: [],
    done: [],
    validated: [],
    proposed: [],
    onHold: [],
  };
  const bucketByStatus = {
    available: buckets.available,
    in_progress: buckets.inProgress,
    done: buckets.done,
    validated: buckets.validated,
    proposed: buckets.proposed,
    on_hold: buckets.onHold,
  };
  for (const t of regularFiltered) {
    const bucket = bucketByStatus[taskSectionStatus(t)];
    if (bucket) bucket.push(t);
  }
  return buckets;
}

/** Bandeau « Échéances proches » côté élève : tâches actives dues entre J-2 (retard) et J+3, triées par importance puis échéance. */
export function studentUrgentDueTasks(regularFiltered) {
  return regularFiltered
    .filter((t) => {
      const effective = taskEffectiveStatus(t);
      if (
        effective === 'validated' ||
        effective === 'done' ||
        effective === 'on_hold' ||
        effective === 'project_completed' ||
        effective === 'project_validated'
      )
        return false;
      const d = daysUntil(t.due_date);
      return d !== null && d <= 3 && d >= -2;
    })
    .sort(compareTasksByImportanceThenDueDate);
}
