/**
 * Helpers purs de droits du shell App, extraits de `src/App.jsx`.
 * Aucun état React : uniquement des dérivations à partir des claims du jeton
 * et du profil courant. Les deux familles de règles factorisées ici étaient
 * dupliquées mot pour mot dans `App.jsx` (tutoriels/quiz, forum/commentaires).
 */

/** Rôles autorisés à administrer les contenus pédagogiques (hors permission fine). */
const PRIVILEGED_ROLE_SLUGS = new Set(['prof', 'admin']);

/**
 * Vrai si le rôle porte l'administration des contenus : `prof`/`admin`, ou compte
 * « nativement privilégié » (claim `nativePrivileged`, cas de l'impersonation admin).
 * @param {string|null|undefined} roleSlug
 * @param {boolean} [nativePrivileged]
 */
export function isPrivilegedRole(roleSlug, nativePrivileged = false) {
  if (nativePrivileged) return true;
  return PRIVILEGED_ROLE_SLUGS.has(String(roleSlug || '').toLowerCase());
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
