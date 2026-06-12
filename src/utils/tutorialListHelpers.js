/**
 * Helpers purs de liste de tutoriels — extraits de `tutorials-views.jsx` (O6).
 *
 * Tri par `sort_order` (puis titre, locale fr), déplacement d'index (réordonnancement), libellé
 * de statut d'une tâche liée, libellé de zone et formulaire vierge. Logique testable.
 */

import { orderedLivingBeingsForForm, formatLivingBeingsListLine } from './livingBeings';

/** Libellé d'une zone pour les sélecteurs de tutoriel : « Nom — espèces » (ou « Nom » si aucune). */
export function tutorialZonePickLabel(z) {
  const line = formatLivingBeingsListLine(
    orderedLivingBeingsForForm(z.living_beings_list || z.living_beings, z.current_plant),
  );
  return line ? `${z.name} — ${line}` : z.name;
}

/** Formulaire de tutoriel vierge (objet neuf à chaque appel : `zone_ids`/`marker_ids` non partagés). */
export function createInitialTutorialForm() {
  return {
    id: null,
    title: '',
    summary: '',
    type: 'html',
    html_content: '',
    source_url: '',
    source_file_path: '',
    sort_order: 0,
    is_active: true,
    map_id: '',
    zone_ids: [],
    marker_ids: [],
  };
}

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

/**
 * Filtre la liste des tutoriels (type, statut actif/archivé, recherche texte sur titre + résumé,
 * insensible à la casse) puis la trie par `sort_order`. Ne mute pas l'entrée.
 */
export function filterAndSortTutorials(tutorials, { search = '', typeFilter = 'all', statusFilter = 'all' } = {}) {
  const q = String(search || '').trim().toLowerCase();
  const arr = (tutorials || []).filter((t) => {
    if (typeFilter !== 'all' && t.type !== typeFilter) return false;
    if (statusFilter === 'active' && !t.is_active) return false;
    if (statusFilter === 'archived' && t.is_active) return false;
    if (!q) return true;
    return (
      String(t.title || '').toLowerCase().includes(q) ||
      String(t.summary || '').toLowerCase().includes(q)
    );
  });
  return sortTutorialsByOrder(arr);
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
