/**
 * Réordonnancement des tâches (n3boss) : projet (glisser-déposer) et liste globale (flèches ↑↓).
 *
 * Calcul pur des listes d'ids envoyées à `POST /api/tasks/reorder-project` et
 * `POST /api/tasks/reorder` — sans React ni I/O, testable unitairement
 * (`tests-ui/utils/taskDragReorder.test.js`).
 */

/**
 * Ids (strings) des tâches du projet cible, tâche glissée insérée avant `beforeTaskId`
 * (ou en fin de liste si absent / introuvable). La tâche glissée est d'abord exclue
 * pour gérer le réordonnancement au sein du même projet.
 */
export function computeReorderedProjectTaskIds(
  tasks,
  dragTaskId,
  targetProjectId,
  beforeTaskId = '',
) {
  const targetIdsWithoutDragged = (tasks || [])
    .filter(
      (task) =>
        String(task.id) !== dragTaskId && String(task.project_id || '').trim() === targetProjectId,
    )
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

/**
 * Échange deux ids dans une liste ordonnée (flèches ↑↓ d'une section). Ne mute pas
 * l'entrée ; renvoie la même référence si un id est absent.
 * @param {Array<string|number>} orderedIds
 * @param {string|number} idA
 * @param {string|number} idB
 * @returns {string[]}
 */
export function swapTaskIdsInOrder(orderedIds, idA, idB) {
  const list = (Array.isArray(orderedIds) ? orderedIds : []).map((id) => String(id));
  const a = String(idA || '');
  const b = String(idB || '');
  if (!a || !b || a === b) return list;
  const i = list.indexOf(a);
  const j = list.indexOf(b);
  if (i < 0 || j < 0) return list;
  const next = list.slice();
  next[i] = b;
  next[j] = a;
  return next;
}
