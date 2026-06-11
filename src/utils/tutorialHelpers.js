/**
 * Fonctions pures relatives aux tutoriels — tri, formatage, statuts et valeurs dérivées.
 *
 * Extraites de `tutorials-views.jsx` (O6) pour réduire le méga-composant et couvrir
 * la logique par des tests unitaires. Aucune dépendance React/DOM/hooks.
 */

import { orderedLivingBeingsForForm, formatLivingBeingsListLine } from './livingBeings.js';

// ── Libellé d'une zone dans le sélecteur de tutoriels ──────────────────────────

/**
 * Construit le libellé affiché pour une zone dans le sélecteur de tutoriels.
 * Format : "<nom de la zone> — <liste d'êtres vivants>" ou juste "<nom de la zone>".
 *
 * @param {{ name: string, living_beings_list?: unknown[], living_beings?: unknown[], current_plant?: unknown }} z
 * @returns {string}
 */
export function tutorialZonePickLabel(z) {
  const line = formatLivingBeingsListLine(
    orderedLivingBeingsForForm(z.living_beings_list || z.living_beings, z.current_plant),
  );
  return line ? `${z.name} — ${line}` : z.name;
}

// ── Tri des tutoriels ──────────────────────────────────────────────────────────

/**
 * Trie une liste de tutoriels par `sort_order` croissant,
 * puis par titre alphabétique (fr) en cas d'égalité.
 *
 * @param {Array<{ sort_order?: number|string, title?: string }>} list
 * @returns {Array}
 */
export function sortTutorialsByOrder(list) {
  return [...list].sort(
    (a, b) =>
      (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) ||
      String(a.title || '').localeCompare(String(b.title || ''), 'fr')
  );
}

// ── Déplacement d'un élément dans un tableau ───────────────────────────────────

/**
 * Déplace l'élément à l'index `from` vers l'index `to` dans un tableau,
 * sans modifier le tableau d'origine.  Retourne le tableau inchangé si les
 * index sont invalides ou identiques.
 *
 * @template T
 * @param {T[]} arr
 * @param {number} from
 * @param {number} to
 * @returns {T[]}
 */
export function moveIndex(arr, from, to) {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// ── Statuts de tâche liée ──────────────────────────────────────────────────────

/** Libellés français des statuts de tâche pour l'affichage dans la modale « Tâches liées ». */
export const LINKED_TASK_STATUS_LABELS = {
  available: 'À faire',
  in_progress: 'En cours',
  done: 'Terminée',
  validated: 'Validée',
  proposed: 'Proposée',
  on_hold: 'En attente',
};

/**
 * Retourne le libellé français d'un statut de tâche liée.
 * Si le statut est inconnu, retourne la valeur brute ou '—'.
 *
 * @param {string|null|undefined} status
 * @returns {string}
 */
export function linkedTaskStatusLabel(status) {
  const s = String(status || '').toLowerCase();
  return LINKED_TASK_STATUS_LABELS[s] || status || '—';
}

// ── Valeur initiale du formulaire tutoriel ─────────────────────────────────────

/**
 * Retourne un objet formulaire tutoriel vide pour la création.
 *
 * @returns {{ id: null, title: string, summary: string, type: string, html_content: string, source_url: string, source_file_path: string, sort_order: number, is_active: boolean, map_id: string, zone_ids: [], marker_ids: [] }}
 */
export function initialTutorialForm() {
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
