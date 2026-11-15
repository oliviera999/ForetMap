/**
 * « Tenir à deux », lot 2 — moments du tour où un sort se lance, dérivés de sa fenêtre
 * (`gl_spells.fenetre`). L'écran d'équipe range les sorts par moment ; un sort hors fenêtre
 * reste visible, grisé, avec le message de sa fenêtre. Noyau PUR partagé serveur / client
 * (miroir CJS `lib/shared/glSortMomentsCore.js`, `npm run sync:shared-cores`).
 *
 * Les rôles sont un conseil d'organisation de l'équipe, jamais un contrôle : le serveur ne les
 * lit pas.
 */

/** Moments, dans l'ordre de l'écran. */
export const SORT_MOMENTS = Object.freeze([
  Object.freeze({
    key: 'avant',
    label: 'Avant de lancer',
    fenetres: Object.freeze(['avant_jet', 'avant_jets_pacte']),
  }),
  Object.freeze({ key: 'apres', label: 'Après le jet', fenetres: Object.freeze(['apres_jet']) }),
  Object.freeze({
    key: 'pendant',
    label: 'Pendant le tour',
    fenetres: Object.freeze(['jeu', 'jeu_avant_fouille']),
  }),
  Object.freeze({
    key: 'plus_tard',
    label: 'Plus tard',
    fenetres: Object.freeze(['activite', 'fin_seance', 'seuil', 'seuil_veillee', 'trimestre_3']),
  }),
]);

/** Clé du moment d'une fenêtre ; une fenêtre inconnue ou absente se range dans « Plus tard ». */
export function momentDeFenetre(fenetre) {
  const f = String(fenetre || '');
  return SORT_MOMENTS.find((m) => m.fenetres.includes(f))?.key || 'plus_tard';
}

/** Range des sorts (`{ fenetre }`) par moment, dans l'ordre de l'écran ; moments vides omis. */
export function rangerSortsParMoment(sorts = []) {
  return SORT_MOMENTS.map((m) => ({
    key: m.key,
    label: m.label,
    sorts: sorts.filter((s) => momentDeFenetre(s?.fenetre) === m.key),
  })).filter((m) => m.sorts.length > 0);
}

/**
 * Rôles en conseil : à quel rôle de l'équipe revient chaque geste. Aucun contrôle serveur.
 */
export const ROLES_EN_CONSEIL = Object.freeze({
  lancer: 'C’est le moment de l’Opérateur.',
  fouiller: 'C’est le moment de l’Éclaireur.',
  lire: 'C’est le moment du Secrétaire.',
  jeter: 'C’est le moment du Gestionnaire.',
  marche: 'C’est le moment du Gestionnaire.',
});
