/**
 * Vocabulaire du traitement d'un message reçu sur un lieu — module pur, partagé par la console
 * ForetMap et le plan des personnels.
 *
 * Les deux surfaces nomment forcément les mêmes états : l'administrateur pose « traité » dans
 * la console, l'auteur lit « traité » sur sa fiche de lieu. Écrire ces libellés deux fois, c'est
 * accepter qu'ils divergent le jour où l'un est reformulé.
 *
 * Miroir de `PLACE_STATUSES` (`lib/placeMessages.js`, migration 264).
 */

/** Statuts qu'un traitant peut poser, dans l'ordre d'avancement. */
export const SETTABLE_PLACE_STATUSES = Object.freeze(['pris_en_compte', 'traite', 'sans_suite']);

/** Libellés affichés. La chaîne vide est le point de départ, pas un statut posé. */
export const PLACE_STATUS_LABELS = Object.freeze({
  '': 'Nouveau',
  pris_en_compte: 'Pris en compte',
  traite: 'Traité',
  sans_suite: 'Sans suite',
});

/**
 * Ce que l'auteur du message lit. Volontairement différent des libellés de la console : côté
 * console on classe, côté auteur on répond à « et alors ? ».
 */
export const PLACE_STATUS_AUTHOR_LABELS = Object.freeze({
  '': 'En attente de lecture',
  pris_en_compte: 'Pris en compte',
  traite: 'Traité',
  sans_suite: 'Sans suite donnée',
});

/** Libellé d'un statut, côté console (défaut) ou côté auteur. */
export function placeStatusLabel(status, { forAuthor = false } = {}) {
  const key = String(status || '');
  const table = forAuthor ? PLACE_STATUS_AUTHOR_LABELS : PLACE_STATUS_LABELS;
  return table[key] || table[''];
}

/** Suffixe de classe CSS d'un statut (`place-status--traite`), sans valeur de couleur ici. */
export function placeStatusClass(status) {
  const key = String(status || '');
  return `place-status place-status--${key || 'nouveau'}`;
}

/** Message encore à traiter. */
export function isOpenPlaceStatus(status) {
  return String(status || '') === '';
}
