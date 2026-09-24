import {
  safeLocalStorageGetItem,
  safeLocalStorageSetItem,
  safeSessionStorageGetItem,
  safeSessionStorageRemoveItem,
  safeSessionStorageSetItem,
} from '../shared/platform/browserStorage.js';

export const DEFAULT_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🔥', '👏'];

/** Nombre de commentaires visibles sans déplier la section (aperçu replié). */
export const CONTEXT_COMMENT_PREVIEW_SIZE = 2;

/** Brouillon commentaire : survit au remontage des tuiles tâche (rafraîchissement liste / changement de section). */
export function contextCommentDraftKey(contextType, contextId) {
  return `foretmap:contextCommentDraft:${String(contextType || '')}:${String(contextId ?? '')}`;
}

export function readContextCommentDraft(contextType, contextId) {
  return String(
    safeSessionStorageGetItem(contextCommentDraftKey(contextType, contextId), '') || '',
  );
}

export function writeContextCommentDraft(contextType, contextId, text) {
  if (!contextType || contextId == null || contextId === '') return;
  const key = contextCommentDraftKey(contextType, contextId);
  const v = String(text || '');
  if (v.trim()) safeSessionStorageSetItem(key, v);
  else safeSessionStorageRemoveItem(key);
}

/** Dernier commentaire « lu » pour ce contexte (persisté, par utilisateur). */
export function contextCommentReadCursorKey(userType, userId, contextType, contextId) {
  return `foretmap:contextCommentReadCursor:${String(userType || '')}:${String(userId || '')}:${String(contextType || '')}:${String(contextId ?? '')}`;
}

/**
 * Curseur de lecture : le marqueur du dernier commentaire **vu** dans ce contexte.
 *
 * C'est une **chaîne opaque**, pas un nombre. Les identifiants de commentaire sont des UUID :
 * les convertir en nombre donnait `NaN`, replié en `0`, et le badge « non lus » ne se
 * déclenchait jamais. Les curseurs écrits par l'ancienne version (`{ newestId: 0 }`) sont
 * relus tels quels et normalisés en `'0'` — ils ne correspondront à aucun UUID, donc le fil
 * paraîtra non lu **une fois**, puis le curseur se remettra à jour. C'est le bon sens de
 * l'erreur : mieux vaut signaler à tort une fois que taire indéfiniment.
 */
export function readContextCommentReadCursor(userType, userId, contextType, contextId) {
  if (!userType || !userId || !contextType || contextId == null || contextId === '') return null;
  try {
    const raw = safeLocalStorageGetItem(
      contextCommentReadCursorKey(userType, userId, contextType, contextId),
      null,
    );
    if (!raw) return null;
    const o = JSON.parse(raw);
    const newestId = normalizeContextCommentMarker(o?.newestId);
    if (!newestId) return null;
    const total = Number(o?.total);
    return Number.isFinite(total) && total >= 0 ? { newestId, total } : { newestId };
  } catch {
    return null;
  }
}

/**
 * `total` : nombre de commentaires au moment de la lecture, pour pouvoir chiffrer les non-lus
 * ensuite. Facultatif — les curseurs écrits sans lui restent valides.
 */
export function writeContextCommentReadCursor(
  userType,
  userId,
  contextType,
  contextId,
  newestId,
  total,
) {
  if (!userType || !userId || !contextType || contextId == null || contextId === '') return;
  const cursor = { newestId: normalizeContextCommentMarker(newestId) };
  const n = Number(total);
  if (total != null && Number.isFinite(n) && n >= 0) cursor.total = n;
  safeLocalStorageSetItem(
    contextCommentReadCursorKey(userType, userId, contextType, contextId),
    JSON.stringify(cursor),
  );
}

/**
 * Marqueur de commentaire sous sa forme canonique : une chaîne, vide si absente.
 *
 * Accepte aussi bien un UUID qu'un ancien identifiant numérique, pour que les curseurs déjà
 * écrits dans les navigateurs restent lisibles.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeContextCommentMarker(value) {
  if (value == null) return '';
  const raw = String(value).trim();
  // `'0'` était la valeur écrite quand il n'y avait rien à marquer : elle vaut « aucun ».
  return raw === '0' ? '' : raw;
}

/**
 * Le dernier commentaire a-t-il changé depuis la dernière lecture ?
 *
 * Comparaison par **égalité**, et non par ordre : les identifiants sont des UUID, on ne peut
 * pas dire lequel est « plus grand », seulement s'il s'agit du même. Sans curseur et avec au
 * moins un commentaire → jamais consulté, donc non lu.
 *
 * Conséquence assumée du changement de sémantique : un marqueur qui *recule* (cas de bord —
 * suppression définitive du dernier message) compte désormais comme « non lu » au lieu d'être
 * ignoré. Le fil a bel et bien changé ; le signaler une fois est le comportement souhaitable.
 *
 * @param {string|number|null|undefined} newestId marqueur servi par l'API
 * @param {{ newestId: string } | null} cursor curseur de lecture local
 */
export function hasUnreadContextComments(newestId, cursor) {
  const newest = normalizeContextCommentMarker(newestId);
  if (!newest) return false;
  if (!cursor) return true;
  return newest !== normalizeContextCommentMarker(cursor.newestId);
}

/**
 * Nombre de commentaires non lus, déduit de l'écart entre le total actuel et le total vu lors
 * de la dernière lecture. Toujours ≥ 1 dès que le fil a changé (des suppressions peuvent
 * masquer des ajouts) et jamais au-delà du total. Curseur sans total mémorisé → on ne sait
 * pas combien ont été vus, tout le fil compte comme non lu.
 *
 * @param {string|number|null|undefined} newestId marqueur servi par l'API
 * @param {number} total nombre actuel de commentaires
 * @param {{ newestId: string, total?: number } | null} cursor curseur de lecture local
 * @returns {number}
 */
export function countUnreadContextComments(newestId, total, cursor) {
  const current = Math.max(0, Number(total) || 0);
  if (!hasUnreadContextComments(newestId, cursor)) return 0;
  if (current === 0) return 0;
  const seen = Number(cursor?.total);
  if (!cursor || !Number.isFinite(seen)) return current;
  return Math.min(current, Math.max(1, current - seen));
}

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

export function canModerate(authClaims) {
  const roleSlug = String(authClaims?.roleSlug || '').toLowerCase();
  if (roleSlug === 'admin' || roleSlug === 'prof') return true;
  const perms = Array.isArray(authClaims?.permissions) ? authClaims.permissions : [];
  return perms.includes('teacher.access');
}
