'use strict';

/**
 * Durées de conservation des COMPTES (décision de l'établissement) :
 *   - élève : jusqu'à la fin de sa scolarité + 1 an ;
 *   - personnel : jusqu'à son départ + 1 an.
 *
 * L'application ne connaît ni la date de fin de scolarité ni la date de départ. Elle retient
 * deux critères explicables, toujours au moins 12 mois après la dernière activité :
 *
 *   1. DÉPART CONSTATÉ — le compte est désactivé (synchronisation Moodle quand l'élève quitte
 *      sa cohorte, ou administrateur) depuis plus de 12 mois (`users.deactivated_at`).
 *      Vaut pour les élèves et pour les personnels.
 *
 *   2. DÉPART PRÉSUMÉ (élèves seulement) — aucune activité pendant toute une année scolaire :
 *      la fin de scolarité est présumée à la fin de l'année scolaire (31 août) de la dernière
 *      activité, et le compte est supprimé un an après. Concrètement, au 1er septembre, les
 *      comptes élèves sans aucune activité pendant l'année scolaire qui s'achève.
 *      Pour les personnels, ce critère ne supprime rien : le compte est signalé « à revoir »
 *      (un enseignant peut ne pas utiliser l'outil une année et rester en poste) — c'est la
 *      désactivation par l'administrateur qui déclare le départ.
 *
 * « Activité » : la plus récente de la dernière connexion (`users.last_seen`), de la création
 * du compte, de la dernière visite du joueur Gnomes & Licornes lié et de la dernière ouverture
 * d'une application (`user_product_visits`).
 */

/** Délai après le départ (constaté ou présumé) : 1 an. */
const ACCOUNT_RETENTION_MONTHS = 12;

/** Premier mois de l'année scolaire (septembre ; calendrier scolaire français). */
const SCHOOL_YEAR_START_MONTH = 9;

/** Seuil par défaut : au-delà, la catégorie est bloquée sans rien supprimer (alerte). */
const DEFAULT_MAX_ACCOUNTS = 200;
const MAX_ACCOUNTS_LIMIT = 100000;

/** Comptes traités par lot (chaque suppression est sa propre transaction). */
const DEFAULT_ACCOUNT_BATCH_SIZE = 50;
const MAX_ACCOUNT_BATCH_SIZE = 500;

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * Début de l'année scolaire qui contient `date` (1er septembre, en UTC).
 * @param {Date} date
 * @returns {Date}
 */
function schoolYearStart(date) {
  const d = date instanceof Date ? date : new Date(date);
  const year =
    d.getUTCMonth() + 1 >= SCHOOL_YEAR_START_MONTH ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return new Date(Date.UTC(year, SCHOOL_YEAR_START_MONTH - 1, 1));
}

/**
 * Date limite du départ présumé : un compte élève dont la dernière activité est ANTÉRIEURE à
 * cette date a fini sa dernière année scolaire active depuis plus d'un an.
 *
 * Fin présumée de scolarité E = veille du début de l'année scolaire suivant la dernière
 * activité ; suppression quand E + 1 an < maintenant, c'est-à-dire quand la dernière activité
 * précède le début de l'année scolaire qui contient (maintenant − 1 an).
 * @param {number|Date} now
 * @returns {string} `AAAA-MM-JJ`
 */
function presumedDepartureCutoff(now = Date.now()) {
  const d = now instanceof Date ? now : new Date(now);
  const oneYearAgo = new Date(
    Date.UTC(
      d.getUTCFullYear() - 1,
      d.getUTCMonth(),
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
    ),
  );
  const start = schoolYearStart(oneYearAgo);
  return `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-${pad(start.getUTCDate())}`;
}

module.exports = {
  ACCOUNT_RETENTION_MONTHS,
  SCHOOL_YEAR_START_MONTH,
  DEFAULT_MAX_ACCOUNTS,
  MAX_ACCOUNTS_LIMIT,
  DEFAULT_ACCOUNT_BATCH_SIZE,
  MAX_ACCOUNT_BATCH_SIZE,
  schoolYearStart,
  presumedDepartureCutoff,
};
