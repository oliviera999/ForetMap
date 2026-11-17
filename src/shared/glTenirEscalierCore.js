/**
 * L'escalier du chapitre 1 (« Tenir à deux », ensemble unifié, M8 — apprendre en jouant).
 *
 * Au plateau 1, les règles s'ouvrent séance après séance : on ne les explique pas, on les
 * rencontre. Ce cœur PUR dit ce qui est ouvert à une séance donnée ; le serveur le rejoue dans
 * les réglages résolus d'une partie (`lib/glTenir.js › resolveTenirSettings`) et dans les droits
 * (`glTenirPermissionsCore`), l'écran masque ce qui n'est pas ouvert (jamais de bouton grisé).
 * Miroir CJS `lib/shared/glTenirEscalierCore.js`, régénéré par `npm run sync:shared-cores`.
 *
 * | Séance | S'ouvre                                                                              |
 * | 1      | avancer, chercher, défi de case, défis de la Trame hors tour                         |
 * | 2      | tenir (la page trouvée attend un lecteur de l'autre peuple), l'erreur du jour d'Olu  |
 * | 3      | le voile, la page témoin, trois sorts (Progression et les deux du peuple), la Lumière |
 * | 4      | le Marché, trois sorts (Relance, Farce, Question)                                    |
 * | 5, 6   | rien de nouveau                                                                      |
 *
 * La séance d'une partie est son **pas** : 1 à la création, + 1 à chaque tour clos, + 1 quand
 * le prof touche « Ouvrir la suite ». Il ne recule jamais.
 */

export const ESCALIER_MARCHES = Object.freeze([
  Object.freeze({
    seance: 1,
    modules: Object.freeze(['avancer', 'chercher', 'defi_case', 'trame']),
    sorts: Object.freeze([]),
  }),
  Object.freeze({
    seance: 2,
    modules: Object.freeze(['tenir', 'erreur_du_jour']),
    sorts: Object.freeze([]),
  }),
  Object.freeze({
    seance: 3,
    modules: Object.freeze(['voile', 'page_temoin', 'sorts', 'lumiere']),
    // Progression ; Lanterne et Bourrasque (Licornes) ; Sentier et Relais (Gnomes).
    sorts: Object.freeze(['SL002', 'SL037', 'SL039', 'SL042', 'SL044']),
  }),
  Object.freeze({
    seance: 4,
    modules: Object.freeze(['marche']),
    // Relance, Farce, Question.
    sorts: Object.freeze(['SL005', 'SL036', 'SL004']),
  }),
]);

/** Séance à partir de laquelle plus rien ne s'ouvre : l'escalier est monté. */
export const ESCALIER_DERNIERE_SEANCE = ESCALIER_MARCHES[ESCALIER_MARCHES.length - 1].seance;

export const ESCALIER_MODULES = Object.freeze(ESCALIER_MARCHES.flatMap((m) => m.modules));

/** Tous les sorts que l'escalier ouvre : ceux du chapitre 1 (contrôlé par le test de contenu). */
export const ESCALIER_SORTS = Object.freeze(ESCALIER_MARCHES.flatMap((m) => m.sorts));

/** Séance (pas) ramenée à ses bornes : au moins 1, au plus la dernière marche. */
export function normaliserPas(n) {
  const pas = Math.floor(Number(n));
  if (!Number.isFinite(pas) || pas < 1) return 1;
  return Math.min(pas, ESCALIER_DERNIERE_SEANCE);
}

/**
 * Modules ouverts à la séance `n` du chapitre 1 (cumulatif : ce qui s'est ouvert reste ouvert).
 * @param {number} n séance, c'est-à-dire tours clos + 1 (+ les avances du prof)
 * @returns {string[]}
 */
export function escalierPourTour(n) {
  const pas = normaliserPas(n);
  return ESCALIER_MARCHES.filter((m) => m.seance <= pas).flatMap((m) => m.modules);
}

/** Codes des sorts ouverts à la séance `n` (cumulatif ; vide avant la séance 3). */
export function sortsDeLEscalier(n) {
  const pas = normaliserPas(n);
  return ESCALIER_MARCHES.filter((m) => m.seance <= pas).flatMap((m) => m.sorts);
}

/** Séance qui ouvre un module, ou `null` s'il n'est pas dans l'escalier. */
export function seanceDuModule(module) {
  const marche = ESCALIER_MARCHES.find((m) => m.modules.includes(String(module || '')));
  return marche ? marche.seance : null;
}

/** Séance qui ouvre un sort, ou `null` si l'escalier ne le connaît pas. */
export function seanceDuSort(code) {
  const marche = ESCALIER_MARCHES.find((m) => m.sorts.includes(String(code || '')));
  return marche ? marche.seance : null;
}

/**
 * Ce que la prochaine séance ouvrira : `{ seance, modules, sorts }`, ou `null` quand l'escalier
 * est monté.
 */
export function prochaineMarche(n) {
  const pas = normaliserPas(n);
  const marche = ESCALIER_MARCHES.find((m) => m.seance === pas + 1);
  return marche
    ? { seance: marche.seance, modules: [...marche.modules], sorts: [...marche.sorts] }
    : null;
}

/**
 * État de l'escalier d'une partie, lu dans ses réglages résolus (`escalier`, `escalier_pas`) :
 * `null` si la partie ne le monte pas (tout est ouvert).
 * @param {{ escalier?: boolean, escalier_pas?: number|null }|null} resolved
 * @returns {null|{ pas: number, dernier: number, monte: boolean, modules: string[],
 *   sorts: string[], prochaine: object|null }}
 */
export function etatEscalier(resolved) {
  if (!resolved || resolved.escalier !== true || resolved.escalier_pas == null) return null;
  const pas = normaliserPas(resolved.escalier_pas);
  return {
    pas,
    dernier: ESCALIER_DERNIERE_SEANCE,
    monte: pas >= ESCALIER_DERNIERE_SEANCE,
    modules: escalierPourTour(pas),
    sorts: sortsDeLEscalier(pas),
    prochaine: prochaineMarche(pas),
  };
}

/**
 * Un module est-il ouvert pour cette partie ? Toujours, hors escalier ; un module que
 * l'escalier ne connaît pas (le chapardeur, les péripéties…) n'est jamais fermé par lui.
 */
export function moduleOuvert(resolved, module) {
  const etat = etatEscalier(resolved);
  if (!etat) return true;
  if (!ESCALIER_MODULES.includes(String(module || ''))) return true;
  return etat.modules.includes(String(module));
}

/**
 * Un sort est-il ouvert pour cette partie ? Hors escalier, toujours (le chapitre décide). Dans
 * l'escalier, seulement s'il fait partie d'une marche déjà montée : un sort que l'escalier ne
 * connaît pas reste fermé tant que la dernière marche n'est pas atteinte.
 */
export function sortOuvert(resolved, code) {
  const etat = etatEscalier(resolved);
  if (!etat) return true;
  if (etat.sorts.includes(String(code || ''))) return true;
  return etat.monte && seanceDuSort(code) == null;
}
