'use strict';

/**
 * Deux notions voisines, volontairement distinctes depuis le réalignement des profils
 * du 22/09/2026 — les confondre est exactement ce qui fermait le forum au personnel.
 *
 * 1. `VISITOR_LIKE_ROLE_SLUGS` — **parcours** : Visite + Biodiversité, sans carte de
 *    travail ni tâches. C'est ce qui borne les tâches (`lib/taskAuthzHelpers.js`,
 *    `routes/tasks*.js`) et ce que la progression automatique considère comme
 *    « profil qu'un palier n3beur peut relever » (`lib/rbac.js`).
 * 2. `PARTICIPATION_EXCLUDED_ROLE_SLUGS` — **parole** : qui n'écrit ni sur le forum ni
 *    dans les commentaires de contexte.
 *
 * `personnel` est dans la première et **pas** dans la seconde : un agent ou un AED n'a
 * pas de tâches ni de carte de travail, mais il participe au forum, commente et réagit.
 * `visiteur` est dans les deux : c'est un compte d'observation, sans identité engagée.
 */

const VISITOR_LIKE_ROLE_SLUGS = new Set(['visiteur', 'personnel']);

/**
 * Profils privés d'écriture sur le forum et les commentaires de contexte.
 *
 * Volontairement décidé sur le **profil** et non sur les drapeaux `roles.forum_participate`
 * / `roles.context_comment_participate` : ces colonnes valent 1 par défaut (y compris pour
 * `visiteur`), et la console ne les expose que pour les paliers n3beur
 * (`canConfigureStudentTierForumContext`). S'y fier ici ouvrirait le forum aux visiteurs
 * sans qu'aucun écran ne permette de le refermer.
 */
const PARTICIPATION_EXCLUDED_ROLE_SLUGS = new Set(['visiteur']);

function normalizeRoleSlug(slug) {
  return String(slug || '')
    .trim()
    .toLowerCase();
}

function isVisitorLikeSlug(slug) {
  return VISITOR_LIKE_ROLE_SLUGS.has(normalizeRoleSlug(slug));
}

/** Auth hydratée : profil principal lecture seule (visiteur ou personnel). */
function isVisitorRole(auth) {
  return isVisitorLikeSlug(auth?.roleSlug);
}

function isParticipationExcludedSlug(slug) {
  return PARTICIPATION_EXCLUDED_ROLE_SLUGS.has(normalizeRoleSlug(slug));
}

/** Auth hydratée : profil privé de forum et de commentaires de contexte. */
function isParticipationExcludedRole(auth) {
  return isParticipationExcludedSlug(auth?.roleSlug);
}

module.exports = {
  VISITOR_LIKE_ROLE_SLUGS,
  PARTICIPATION_EXCLUDED_ROLE_SLUGS,
  isVisitorLikeSlug,
  isVisitorRole,
  isParticipationExcludedSlug,
  isParticipationExcludedRole,
};
