import {
  safeLocalStorageGetItem,
  safeLocalStorageSetItem,
  safeSessionStorageGetItem,
  safeSessionStorageRemoveItem,
  safeSessionStorageSetItem,
} from './browserStorage.js';

export const DEFAULT_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🔥', '👏'];

/** Brouillon commentaire : survit au remontage des tuiles tâche (rafraîchissement liste / changement de section). */
export function contextCommentDraftKey(contextType, contextId) {
  return `foretmap:contextCommentDraft:${String(contextType || '')}:${String(contextId ?? '')}`;
}

export function readContextCommentDraft(contextType, contextId) {
  return String(safeSessionStorageGetItem(contextCommentDraftKey(contextType, contextId), '') || '');
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

export function readContextCommentReadCursor(userType, userId, contextType, contextId) {
  if (!userType || !userId || !contextType || contextId == null || contextId === '') return null;
  try {
    const raw = safeLocalStorageGetItem(contextCommentReadCursorKey(userType, userId, contextType, contextId), null);
    if (!raw) return null;
    const o = JSON.parse(raw);
    const newestId = Number(o?.newestId);
    if (!Number.isFinite(newestId) || newestId < 0) return null;
    return { newestId };
  } catch {
    return null;
  }
}

export function writeContextCommentReadCursor(userType, userId, contextType, contextId, newestId) {
  if (!userType || !userId || !contextType || contextId == null || contextId === '') return;
  const n = Math.max(0, Math.floor(Number(newestId) || 0));
  safeLocalStorageSetItem(
    contextCommentReadCursorKey(userType, userId, contextType, contextId),
    JSON.stringify({ newestId: n })
  );
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
