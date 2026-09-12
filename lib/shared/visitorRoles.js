'use strict';

/**
 * Profils lecture seule « type visiteur » : Visite + Biodiversité, sans carte de
 * travail ni tâches ni forum. `personnel` est calqué sur `visiteur` (même rang,
 * aucune permission d’action) pour le staff non enseignant.
 */

const VISITOR_LIKE_ROLE_SLUGS = new Set(['visiteur', 'personnel']);

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

module.exports = {
  VISITOR_LIKE_ROLE_SLUGS,
  isVisitorLikeSlug,
  isVisitorRole,
};
