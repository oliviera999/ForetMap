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

/**
 * Données d'élève sans durée propre : elles vivent et disparaissent avec le compte, par clé
 * étrangère `ON DELETE CASCADE` vers `users` (vérifié par `tests/rewards-privacy.test.js`).
 * Les badges (`user_rewards`, migrations 285 et 329) décrivent l'activité d'un mineur : ils
 * suivent donc exactement la durée de conservation du compte, sans purge séparée.
 * Les refus d'élève référent par série (`task_series_referent_vetoes`, migration
 * `task_referents_auto`) suivent la même règle que `task_referents` : la vie du compte.
 */
const ACCOUNT_LIFETIME_TABLES = Object.freeze(['user_rewards', 'task_series_referent_vetoes']);

/**
 * Observations d'espèces (`species_observations`) et leurs photos
 * (`species_observation_photos`, fichiers sous `uploads/observations/species/`).
 *
 * Finalité : l'inventaire des espèces du site, tenu par les élèves et vérifié par un
 * enseignant. Une observation est **soumise**, puis **validée** ou **refusée**.
 *
 * DURÉES PROPOSÉES, À CONFIRMER PAR L'ÉTABLISSEMENT (aucune n'était fixée avant ce lot). La
 * notice « Vos données » les recopie (`src/shared/privacy/privacyNoticeContent.js`) : une
 * durée changée ici doit l'être là-bas dans le même lot (`tests/privacy-notice.test.js`).
 *
 *   - observation VALIDÉE : aucune durée propre. Elle est la preuve d'une ligne de
 *     l'inventaire (`map_species`, preuves d'interaction) ; elle vit et disparaît avec le
 *     compte de son auteur (clé étrangère en cascade, fichiers effacés par
 *     `lib/observations/accountCleaners.js`). La purge planifiée n'y touche jamais.
 *   - photo d'une observation REFUSÉE : elle ne sert plus l'inventaire. Fichier et ligne
 *     supprimés peu après la décision — le délai laisse à l'élève le temps de lire le refus
 *     avec sa photo sous les yeux, et à l'enseignant celui de corriger une erreur de saisie.
 *   - observation REFUSÉE (texte, note de l'enseignant) : gardée le temps que l'élève lise la
 *     réponse et refasse son observation, puis supprimée.
 *   - observation SOUMISE jamais examinée : au-delà d'une année, elle ne sera plus examinée
 *     (l'année scolaire est passée) ; supprimée avec ses photos.
 */

/** Photo d'une observation refusée : jours gardés après la décision. */
const OBSERVATION_REFUSED_PHOTO_RETENTION_DAYS = 7;

/** Observation refusée (texte et note de décision) : jours gardés après la décision. */
const OBSERVATION_REFUSED_RETENTION_DAYS = 90;

/** Observation soumise et jamais examinée : jours gardés après sa création. */
const OBSERVATION_PENDING_RETENTION_DAYS = 365;

/**
 * Confirmations « espèce observée » (`user_plant_observation_events`) : au-delà de ce délai,
 * les lignes **antérieures à la plus récente** pour un même couple utilisateur × fiche sont
 * purgées. La dernière observation par couple est conservée (acquis d'apprentissage, cascade
 * compte). Durée proposée, à confirmer par l'établissement.
 */
const PLANT_OBSERVATION_EVENT_RETENTION_DAYS = 365;

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
  ACCOUNT_LIFETIME_TABLES,
  OBSERVATION_REFUSED_PHOTO_RETENTION_DAYS,
  OBSERVATION_REFUSED_RETENTION_DAYS,
  OBSERVATION_PENDING_RETENTION_DAYS,
  PLANT_OBSERVATION_EVENT_RETENTION_DAYS,
  SCHOOL_YEAR_START_MONTH,
  DEFAULT_MAX_ACCOUNTS,
  MAX_ACCOUNTS_LIMIT,
  DEFAULT_ACCOUNT_BATCH_SIZE,
  MAX_ACCOUNT_BATCH_SIZE,
  schoolYearStart,
  presumedDepartureCutoff,
};
