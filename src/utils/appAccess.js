/**
 * Helpers purs de droits du shell App, extraits de `src/App.jsx`.
 * Aucun état React : uniquement des dérivations à partir des claims du jeton
 * et du profil courant. Les deux familles de règles factorisées ici étaient
 * dupliquées mot pour mot dans `App.jsx` (tutoriels/quiz, forum/commentaires).
 */

import { isPrivilegedSystemRoleSlug } from '../shared/n3beurRolesCore.js';

/** Profil tuteur de classe (enseignants hors n3boss). */
export function isClassTeacherRole(roleSlug) {
  return String(roleSlug || '').toLowerCase() === 'prof_classe';
}

/**
 * Parcours « Visite / Biodiversité » sans carte de travail ni tâches : visiteurs, personnel
 * et profs de classe (même chrome apprenant).
 *
 * Ne décide **que** du parcours. La parole (forum, commentaires) se décide séparément, cf.
 * `isForumExcludedRole` : un personnel et un prof de classe n'ont pas de tâches mais
 * participent au forum.
 */
export function isVisitorLikeRole(roleSlug) {
  const slug = String(roleSlug || '').toLowerCase();
  return slug === 'visiteur' || slug === 'personnel' || slug === 'prof_classe';
}

/**
 * Profils privés de forum — le seul « visiteur », miroir exact de
 * `PARTICIPATION_EXCLUDED_ROLE_SLUGS` (`lib/shared/visitorRoles.js`) côté serveur.
 *
 * Auparavant l'onglet Forum était dérivé de `isVisitorLikeRole`, ce qui le retirait aussi au
 * personnel et aux profs de classe : deux publics que le serveur laisse désormais écrire. Un
 * onglet absent d'un côté et une route ouverte de l'autre, c'est une fonction livrée que
 * personne ne trouve.
 */
export function isForumExcludedRole(roleSlug) {
  // `trim()` comme `normalizeRoleSlug` côté serveur : les deux listes doivent répondre
  // pareil au même slug, sans quoi l'onglet et la route se contrediraient sur un cas limite.
  return (
    String(roleSlug || '')
      .trim()
      .toLowerCase() === 'visiteur'
  );
}

/**
 * Barre haute n3boss (`TeacherTopTabs`) : exige `teacher.access`, sauf pour le
 * prof de classe qui reste sur la navigation basse type visiteur.
 * @param {{ roleSlug?: string|null, hasTeacherAccess?: boolean, roleViewMode?: string }} params
 */
export function shouldUseTeacherChrome({
  roleSlug,
  hasTeacherAccess = false,
  roleViewMode = 'native',
} = {}) {
  if (!hasTeacherAccess) return false;
  if (roleViewMode === 'student') return false;
  if (isClassTeacherRole(roleSlug)) return false;
  return true;
}

/**
 * Vrai si le rôle porte l'administration des contenus : `prof`/`admin`, ou compte
 * « nativement privilégié » (claim `nativePrivileged`, cas de l'impersonation admin).
 * @param {string|null|undefined} roleSlug
 * @param {boolean} [nativePrivileged]
 */
export function isPrivilegedRole(roleSlug, nativePrivileged = false) {
  if (nativePrivileged) return true;
  return isPrivilegedSystemRoleSlug(roleSlug);
}

/**
 * Droit d'administration d'un contenu pédagogique : rôle privilégié **et** permission
 * fine active dans le rôle courant (ex. `tutorials.manage`, `plants.manage`).
 * @param {{ roleSlug?: string|null, nativePrivileged?: boolean, permission: string,
 *           hasPermission?: (perm: string) => boolean }} params
 */
export function canManagePedagoContent({
  roleSlug,
  nativePrivileged = false,
  permission,
  hasPermission,
}) {
  if (!isPrivilegedRole(roleSlug, nativePrivileged)) return false;
  if (typeof hasPermission !== 'function') return false;
  return !!hasPermission(permission);
}

/**
 * Droit de participation d'un utilisateur (forum, commentaires de contexte…).
 * Ordre historique : les profs participent toujours ; sans profil chargé on autorise ;
 * sinon le drapeau camelCase (`/api/auth/me`) prime sur la colonne SQL (0/1).
 * @param {{ isTeacher?: boolean, user?: object|null, camelKey: string, snakeKey: string }} params
 */
export function resolveParticipationFlag({ isTeacher = false, user, camelKey, snakeKey }) {
  if (isTeacher) return true;
  if (!user) return true;
  if (typeof user[camelKey] === 'boolean') return user[camelKey];
  if (user[snakeKey] != null) return Number(user[snakeKey]) !== 0;
  return true;
}
