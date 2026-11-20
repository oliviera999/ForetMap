/**
 * « Tenir à deux » — les phases d'un tour, dites en mots d'élève. **Source unique** : l'écran
 * d'équipe, la projection et la console du prof lisent ce module (les deux anciens
 * `PHASE_LABELS`, qui montraient « jeu », « souffle », « clos », ont disparu).
 *
 * Les clés sont celles du moteur (`ouverture → jeu → souffle → clos`, `lib/glTour.js`) ; elles
 * ne s'affichent jamais telles quelles à un élève. Les libellés parlent à l'équipe (« vous ») et
 * disent le voile par ce qu'il fait : il avance.
 */

/** Ordre des phases d'un tour (clés du moteur). */
export const PHASES_DU_TOUR = Object.freeze(['ouverture', 'jeu', 'souffle', 'clos']);

/** Libellé d'une phase pour un élève : écran d'équipe et projection. */
export const PHASE_ELEVE = Object.freeze({
  ouverture: 'Le tour s’ouvre',
  jeu: 'À vous de jouer',
  souffle: 'Le voile avance',
  clos: 'Tour terminé',
});

/**
 * Libellé d'une phase à la console du prof : les mêmes mots que l'élève (le prof dit ce que la
 * classe lit), avec le terme technique du moteur en infobulle (`technique`).
 */
export const PHASE_CONSOLE = Object.freeze(
  Object.fromEntries(
    PHASES_DU_TOUR.map((phase) => [
      phase,
      Object.freeze({ label: PHASE_ELEVE[phase], technique: `Phase « ${phase} »` }),
    ]),
  ),
);

/** Texte quand aucun tour n'est ouvert (écran d'équipe, projection). */
export const PHASE_AUCUN_TOUR = 'Le prof ouvre bientôt le tour.';

/** Libellé élève d'une phase ; chaîne vide pour une phase inconnue ou absente (jamais la clé). */
export function phaseEleve(phase) {
  return PHASE_ELEVE[String(phase || '')] || '';
}

/** `{ label, technique }` d'une phase à la console ; `null` pour une phase inconnue. */
export function phaseConsole(phase) {
  return PHASE_CONSOLE[String(phase || '')] || null;
}

/** « Tour 3 — À vous de jouer » (ou « Tour 3 » si la phase est inconnue). */
export function titreDuTour(round) {
  if (!round || !Number(round.number)) return '';
  const phase = phaseEleve(round.phase);
  return phase ? `Tour ${round.number} — ${phase}` : `Tour ${round.number}`;
}
