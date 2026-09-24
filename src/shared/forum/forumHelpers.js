/** Logique pure du forum partagé ForetMap / G&L — réactions, modération, pagination,
 * citation et non-lus par sujet. */

export const DEFAULT_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🔥', '👏'];

/** Parse la liste d'emojis autorisés du réglage public (séparateurs espace/virgule,
 * tokens ≤ 16 caractères, dédup, max 24) ; repli sur la liste par défaut. */
export function parseReactionEmojiList(rawValue) {
  const raw = Array.isArray(rawValue) ? rawValue.join(' ') : String(rawValue || '').trim();
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

/** Vrai si les claims ForetMap donnent le droit de modérer le forum (admin ou `forum.group.moderate`). */
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

/** Même identifiant, qu'il arrive en nombre (G&L) ou en chaîne (ForetMap, UUID). */
export function sameForumId(a, b) {
  if (a == null || b == null || a === '' || b === '') return false;
  return String(a) === String(b);
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

const QUOTE_MAX_CHARS = 400;

/**
 * Bloc Markdown de citation d'un message : `> Auteur a écrit :` puis le texte cité, ligne à
 * ligne. Les citations imbriquées du message d'origine sont retirées (on ne cite que ce que
 * la personne a écrit elle-même) et le texte est tronqué pour rester une citation.
 */
export function buildQuoteMarkdown(post) {
  const author = String(post?.author_display_name || '').trim() || 'Quelqu’un';
  const ownLines = String(post?.body || '')
    .split(/\r?\n/)
    .filter((line) => !/^\s*>/.test(line));
  let text = ownLines.join('\n').trim();
  if (text.length > QUOTE_MAX_CHARS) text = `${text.slice(0, QUOTE_MAX_CHARS).trimEnd()}…`;
  const quoted = text
    ? text
        .split('\n')
        .map((line) => (line.trim() ? `> ${line}` : '>'))
        .join('\n')
    : '> …';
  return `> **${author}** a écrit :\n${quoted}\n\n`;
}

/** Ajoute une citation à la fin d'un brouillon (séparée par une ligne vide). */
export function appendQuoteToDraft(draft, quote) {
  const current = String(draft || '');
  if (!current.trim()) return quote;
  return `${current.replace(/\s+$/, '')}\n\n${quote}`;
}

/* ── Non-lus par sujet ──────────────────────────────────────────────────────────────────
 * Mémorisés sur l'appareil. On ne stocke **que des valeurs venues du serveur** (le
 * `last_other_post_at` du sujet au moment de la lecture), jamais l'heure du navigateur : une
 * horloge d'appareil décalée ne peut donc ni allumer ni éteindre une pastille à tort. Les
 * deux valeurs comparées ayant le même format, la comparaison de chaînes suffit.
 */

const THREAD_READ_MAX_ENTRIES = 500;

export function forumThreadReadStorageKey(product, userType, userId) {
  const id = String(userId ?? '').trim();
  if (!id) return '';
  return `foretmap:forumThreadRead:${String(product || 'foret')}:${String(userType || '')}:${id}`;
}

function normalizeMarker(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function readThreadReadState(storageKey, storage = globalThis.localStorage) {
  if (!storageKey || !storage) return null;
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      baseline: normalizeMarker(parsed.baseline),
      threads: parsed.threads && typeof parsed.threads === 'object' ? parsed.threads : {},
    };
  } catch {
    return null;
  }
}

export function writeThreadReadState(storageKey, state, storage = globalThis.localStorage) {
  if (!storageKey || !storage || !state) return;
  const entries = Object.entries(state.threads || {});
  const threads =
    entries.length > THREAD_READ_MAX_ENTRIES
      ? Object.fromEntries(
          entries
            .sort((a, b) => String(b[1]).localeCompare(String(a[1])))
            .slice(0, THREAD_READ_MAX_ENTRIES),
        )
      : state.threads || {};
  try {
    storage.setItem(storageKey, JSON.stringify({ baseline: state.baseline || '', threads }));
  } catch {
    /* stockage plein ou interdit (navigation privée) : les pastilles restent éteintes */
  }
}

/**
 * État initial à la toute première ouverture : tout ce qui est visible est considéré comme
 * lu, sinon chaque sujet existant s'allumerait d'un coup.
 */
export function initialThreadReadState(threads) {
  let baseline = '';
  for (const t of Array.isArray(threads) ? threads : []) {
    const marker = normalizeMarker(t?.last_other_post_at);
    if (marker > baseline) baseline = marker;
  }
  return { baseline, threads: {} };
}

/** Vrai si quelqu'un d'autre a écrit dans ce sujet depuis sa dernière lecture sur l'appareil. */
export function isThreadUnread(thread, state) {
  if (!state || !thread) return false;
  const marker = normalizeMarker(thread.last_other_post_at);
  if (!marker) return false;
  const readMarker = normalizeMarker(state.threads?.[String(thread.id)]) || state.baseline || '';
  return marker > readMarker;
}

/** Marque un sujet comme lu jusqu'à son dernier message d'autrui. Renvoie le nouvel état. */
export function markThreadRead(state, thread) {
  const base = state || { baseline: '', threads: {} };
  const marker = normalizeMarker(thread?.last_other_post_at);
  if (!thread || !marker) return base;
  const key = String(thread.id);
  if (normalizeMarker(base.threads?.[key]) >= marker) return base;
  return { ...base, threads: { ...base.threads, [key]: marker } };
}
