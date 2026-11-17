/* Fichier généré par scripts/sync-shared-cores.js — ne pas éditer. */
/* Source : src/shared/glSortMomentsCore.js — régénérer avec `npm run sync:shared-cores`. */
'use strict';

/**
 * « Tenir à deux », lot 2 — moments du tour où un sort se lance, dérivés de sa fenêtre
 * (`gl_spells.fenetre`). L'écran d'équipe range les sorts par moment ; un sort hors fenêtre
 * reste visible, grisé, avec le message de sa fenêtre. Noyau PUR partagé serveur / client
 * (miroir CJS `lib/shared/glSortMomentsCore.js`, `npm run sync:shared-cores`).
 *
 * Les rôles sont un conseil d'organisation de l'équipe, jamais un contrôle : le serveur ne les
 * lit pas.
 */

/**
 * Moments, dans l'ordre de l'écran (ensemble unifié, M6 : cinq moments ; l'écran d'équipe ne
 * montre que les sorts lançables et payables à cet instant).
 */
const SORT_MOMENTS = Object.freeze([
  Object.freeze({
    key: 'avant',
    label: 'Avant de lancer',
    fenetres: Object.freeze(['avant_jet']),
  }),
  Object.freeze({ key: 'apres', label: 'Après le jet', fenetres: Object.freeze(['apres_jet']) }),
  Object.freeze({
    key: 'pendant',
    label: 'Pendant le tour',
    fenetres: Object.freeze(['jeu', 'jeu_avant_fouille']),
  }),
  Object.freeze({
    key: 'activite',
    label: 'Pendant l’activité',
    fenetres: Object.freeze(['activite', 'fin_seance']),
  }),
  Object.freeze({
    key: 'fin_chapitre',
    label: 'En fin de chapitre ou en veillée',
    fenetres: Object.freeze(['seuil', 'seuil_veillee', 'trimestre_3']),
  }),
]);

/**
 * Clé du moment d'une fenêtre ; une fenêtre inconnue ou absente se range dans « En fin de
 * chapitre ou en veillée ».
 */
function momentDeFenetre(fenetre) {
  const f = String(fenetre || '');
  return SORT_MOMENTS.find((m) => m.fenetres.includes(f))?.key || 'fin_chapitre';
}

/** Range des sorts (`{ fenetre }`) par moment, dans l'ordre de l'écran ; moments vides omis. */
function rangerSortsParMoment(sorts = []) {
  return SORT_MOMENTS.map((m) => ({
    key: m.key,
    label: m.label,
    sorts: sorts.filter((s) => momentDeFenetre(s?.fenetre) === m.key),
  })).filter((m) => m.sorts.length > 0);
}

/**
 * Rôles en conseil : à quel rôle de l'équipe revient chaque geste. Aucun contrôle serveur.
 */
const ROLES_EN_CONSEIL = Object.freeze({
  lancer: 'C’est le moment de l’Opérateur.',
  fouiller: 'C’est le moment de l’Éclaireur.',
  lire: 'C’est le moment du Secrétaire.',
  jeter: 'C’est le moment du Gestionnaire.',
  marche: 'C’est le moment du Gestionnaire.',
});

module.exports = {
  SORT_MOMENTS,
  momentDeFenetre,
  rangerSortsParMoment,
  ROLES_EN_CONSEIL,
};
