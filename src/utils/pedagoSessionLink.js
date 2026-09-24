/**
 * Lien direct `?seance=slug` : ouvre l'application et démarre la séance.
 * Le slug est mis de côté en sessionStorage pour survivre à un écran de connexion.
 */

export const SESSION_LINK_PARAM = 'seance';
const PENDING_KEY = 'foretmap.pendingSeance.v1';
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{1,118}$/i;

export function readSessionSlugFromSearch(search) {
  try {
    const raw = new URLSearchParams(String(search || '')).get(SESSION_LINK_PARAM);
    const slug = String(raw || '').trim();
    return SLUG_RE.test(slug) ? slug.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function buildSessionShareUrl(origin, slug) {
  const base = String(origin || '').replace(/\/+$/, '');
  return `${base}/?${SESSION_LINK_PARAM}=${encodeURIComponent(String(slug || ''))}`;
}

/** Lit le slug depuis l'URL (et le retire de la barre d'adresse) ou depuis la mise de côté. */
export function consumeSessionLinkFromLocation(
  win = typeof window !== 'undefined' ? window : null,
) {
  if (!win) return null;
  const fromUrl = readSessionSlugFromSearch(win.location?.search);
  if (fromUrl) {
    try {
      win.sessionStorage.setItem(PENDING_KEY, fromUrl);
      const url = new URL(win.location.href);
      url.searchParams.delete(SESSION_LINK_PARAM);
      win.history.replaceState(win.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      /* navigation privée : on garde seulement la valeur en mémoire */
    }
    return fromUrl;
  }
  try {
    return win.sessionStorage.getItem(PENDING_KEY) || null;
  } catch {
    return null;
  }
}

export function clearPendingSessionLink(win = typeof window !== 'undefined' ? window : null) {
  try {
    win?.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}
