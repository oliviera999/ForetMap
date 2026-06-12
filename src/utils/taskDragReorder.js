/**
 * Réordonnancement des tâches d'un projet par glisser-déposer (n3boss).
 *
 * Extrait de `tasks-views.jsx` (O6) : calcul pur de la liste ordonnée d'ids envoyée à
 * `POST /api/tasks/reorder-project` — sans React ni I/O, testable unitairement
 * (`tests-ui/utils/taskDragReorder.test.js`).
 */

/**
 * Ids (strings) des tâches du projet cible, tâche glissée insérée avant `beforeTaskId`
 * (ou en fin de liste si absent / introuvable). La tâche glissée est d'abord exclue
 * pour gérer le réordonnancement au sein du même projet.
 */
export function computeReorderedProjectTaskIds(tasks, dragTaskId, targetProjectId, beforeTaskId = '') {
  const targetIdsWithoutDragged = (tasks || [])
    .filter((task) => String(task.id) !== dragTaskId && String(task.project_id || '').trim() === targetProjectId)
    .map((task) => String(task.id));
  let insertAt = targetIdsWithoutDragged.length;
  if (beforeTaskId) {
    const idx = targetIdsWithoutDragged.indexOf(beforeTaskId);
    if (idx >= 0) insertAt = idx;
  }
  return [
    ...targetIdsWithoutDragged.slice(0, insertAt),
    dragTaskId,
    ...targetIdsWithoutDragged.slice(insertAt),
  ];
}
