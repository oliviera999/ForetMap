/**
 * Helpers purs d'identité affichée (shell App), extraits de `src/App.jsx` :
 * ces trois dérivations étaient recopiées dans `previewStudent`, `profileTargetUser`,
 * `currentUserLabel` et `updateTeacherSession`.
 */

/** Libellé de repli quand aucun nom exploitable n'est disponible. */
export const DEFAULT_USER_LABEL = 'Utilisateur';

/**
 * « Prénom Nom » compacté — chaîne vide si les deux champs manquent (permet de
 * chaîner avec `||` sur un repli).
 * @param {object|null|undefined} user
 */
export function formatFullName(user) {
  return `${user?.first_name || ''} ${user?.last_name || ''}`.trim();
}

/**
 * Nom affiché du compte connecté : nom de la session prof en mémoire, sinon nom de rôle
 * du jeton. Prend les deux valeurs brutes (et non les objets) pour garder des dépendances
 * de mémoïsation étroites côté appelant.
 * @param {string|null|undefined} sessionDisplayName Session en mémoire (`sessionUser.displayName`).
 * @param {string|null|undefined} roleDisplayName Claim du jeton (`authClaims.roleDisplayName`).
 * @param {string} [fallback]
 */
export function resolveSessionDisplayName(
  sessionDisplayName,
  roleDisplayName,
  fallback = DEFAULT_USER_LABEL,
) {
  return String(sessionDisplayName || roleDisplayName || fallback).trim();
}
