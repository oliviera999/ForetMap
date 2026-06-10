/**
 * Helpers purs de liste de tutoriels — extraits de `tutorials-views.jsx` (O6).
 *
 * Tri par `sort_order` (puis titre, locale fr), déplacement d'index (réordonnancement) et libellé
 * de statut d'une tâche liée. Aucune dépendance ni effet de bord ; logique testable.
 */

/** Trie une liste de tutoriels par `sort_order` croissant, puis par titre (locale fr). Ne mute pas l'entrée. */
export function sortTutorialsByOrder(list) {
  return [...list].sort(
    (a, b) =>
      (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) ||
      String(a.title || '').localeCompare(String(b.title || ''), 'fr')
  );
}

/** Déplace l'élément d'index `from` vers `to`. Retourne le tableau inchangé si indices invalides/égaux ; sinon une copie. */
export function moveIndex(arr, from, to) {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

const LINKED_TASK_STATUS_LABELS = {
  available: 'À faire',
  in_progress: 'En cours',
  done: 'Terminée',
  validated: 'Validée',
  proposed: 'Proposée',
  on_hold: 'En attente',
};

/** Libellé francisé du statut d'une tâche liée (repli sur la valeur brute, puis « — »). */
export function linkedTaskStatusLabel(status) {
  const s = String(status || '').toLowerCase();
  return LINKED_TASK_STATUS_LABELS[s] || status || '—';
}
