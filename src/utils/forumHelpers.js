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

/** Vrai si les claims donnent le droit de modérer le forum (admin ou `forum.group.moderate`). */
export function isForumModerator(authClaims) {
  const roleSlug = String(authClaims?.roleSlug || '').toLowerCase();
  if (roleSlug === 'admin') return true;
  const perms = Array.isArray(authClaims?.permissions) ? authClaims.permissions : [];
  return perms.includes('forum.group.moderate');
}

/** Nombre de pages d'une liste paginée (toujours ≥ 1, même liste vide). */
export function forumPageCount(total, pageSize) {
  return Math.max(1, Math.ceil(total / pageSize));
}

/**
 * Applique localement le résultat d'un basculement de réaction (`{ reacted }` renvoyé par
 * l'API) : évite de recharger toute la discussion pour un emoji. Les compteurs restent ≥ 0
 * et une réaction retombée à zéro disparaît de la liste.
 */
export function applyReactionToggle(reactions, emoji, reacted) {
  const list = Array.isArray(reactions) ? reactions : [];
  const idx = list.findIndex((r) => r.emoji === emoji);
  if (idx === -1) {
    return reacted ? [...list, { emoji, count: 1, reacted_by_me: true }] : list;
  }
  const current = list[idx];
  const wasMine = !!current.reacted_by_me;
  if (wasMine === !!reacted) return list;
  const count = Math.max(0, Number(current.count || 0) + (reacted ? 1 : -1));
  if (count === 0) return list.filter((_, i) => i !== idx);
  return list.map((r, i) => (i === idx ? { ...r, count, reacted_by_me: !!reacted } : r));
}
