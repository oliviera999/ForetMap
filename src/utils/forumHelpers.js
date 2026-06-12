/** Logique pure de la vue Forum (`forum-views.jsx`) — parsing des réglages
 * de réactions, droit de modération et pagination. */

export const DEFAULT_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🔥', '👏'];

/** Parse la liste d'emojis autorisés du réglage public (séparateurs espace/virgule,
 * tokens ≤ 16 caractères, dédup, max 24) ; repli sur la liste par défaut. */
export function parseReactionEmojiList(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return [...DEFAULT_REACTION_EMOJIS];
  const tokens = raw
    .replace(/,/g, ' ')
    .split(/\s+/)
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((item) => item.length <= 16);
  const unique = [...new Set(tokens)].slice(0, 24);
  return unique.length > 0 ? unique : [...DEFAULT_REACTION_EMOJIS];
}

/** Vrai si les claims donnent le droit de modérer le forum (admin/prof ou `teacher.access`). */
export function isForumModerator(authClaims) {
  const roleSlug = String(authClaims?.roleSlug || '').toLowerCase();
  if (roleSlug === 'admin' || roleSlug === 'prof') return true;
  const perms = Array.isArray(authClaims?.permissions) ? authClaims.permissions : [];
  return perms.includes('teacher.access');
}

/** Nombre de pages d'une liste paginée (toujours ≥ 1, même liste vide). */
export function forumPageCount(total, pageSize) {
  return Math.max(1, Math.ceil(total / pageSize));
}
