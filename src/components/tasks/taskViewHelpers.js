/** Tâche marquée « importance absolue » (affichage urgence). */
export function isTaskUrgentCategory(task) {
  return String(task?.importance_level || '').trim().toLowerCase() === 'absolute';
}
