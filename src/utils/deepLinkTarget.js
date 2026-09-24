/**
 * Liens directs vers un élément précis de l'application :
 * - `?tache=<id>` (option `&carte=<id>`) : la tâche, mise en évidence dans la liste ;
 * - `?lieu=zone:<id>` ou `?lieu=marker:<id>` (option `&carte=<id>`) : le lieu sur la carte,
 *   fenêtre ouverte sur ses messages ;
 * - `?fil=<id>` (option `&message=<id>`) : le sujet du forum, réponse visée à l'écran.
 *
 * La cible produite a la même forme que celle des notifications serveur, et passe par le
 * même `openTarget` d'App.jsx. Comme `?seance=`, elle est mise de côté en sessionStorage pour
 * survivre à l'écran de connexion, puis retirée de la barre d'adresse.
 */

export const DEEP_LINK_PARAMS = Object.freeze({
  task: 'tache',
  place: 'lieu',
  map: 'carte',
  thread: 'fil',
  post: 'message',
});
const PENDING_KEY = 'foretmap.pendingDeepLink.v1';
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function cleanId(raw) {
  const v = String(raw || '').trim();
  return ID_RE.test(v) ? v : null;
}

/** Cible lue dans une chaîne de recherche d'URL (`?tache=…`), ou `null`. */
export function readDeepLinkTargetFromSearch(search) {
  let params;
  try {
    params = new URLSearchParams(String(search || ''));
  } catch {
    return null;
  }
  const mapId = cleanId(params.get(DEEP_LINK_PARAMS.map));
  const taskId = cleanId(params.get(DEEP_LINK_PARAMS.task));
  if (taskId) return { type: 'task', id: taskId, mapId };
  const placeRaw = String(params.get(DEEP_LINK_PARAMS.place) || '').trim();
  if (placeRaw) {
    const colon = placeRaw.indexOf(':');
    const kind = colon > 0 ? placeRaw.slice(0, colon) : 'zone';
    const id = cleanId(colon > 0 ? placeRaw.slice(colon + 1) : placeRaw);
    if (id && (kind === 'zone' || kind === 'marker')) return { type: 'place', kind, id, mapId };
  }
  const threadId = cleanId(params.get(DEEP_LINK_PARAMS.thread));
  if (threadId) {
    return { type: 'thread', id: threadId, postId: cleanId(params.get(DEEP_LINK_PARAMS.post)) };
  }
  return null;
}

/** Adresse partageable vers une cible (`origin` = racine de l'application). */
export function buildDeepLinkUrl(origin, target) {
  const base = String(origin || '').replace(/\/+$/, '');
  const params = new URLSearchParams();
  if (target?.type === 'task' && target.id) {
    params.set(DEEP_LINK_PARAMS.task, String(target.id));
    if (target.mapId) params.set(DEEP_LINK_PARAMS.map, String(target.mapId));
  } else if (target?.type === 'place' && target.id) {
    params.set(
      DEEP_LINK_PARAMS.place,
      `${target.kind === 'marker' ? 'marker' : 'zone'}:${target.id}`,
    );
    if (target.mapId) params.set(DEEP_LINK_PARAMS.map, String(target.mapId));
  } else if (target?.type === 'thread' && target.id) {
    params.set(DEEP_LINK_PARAMS.thread, String(target.id));
    if (target.postId) params.set(DEEP_LINK_PARAMS.post, String(target.postId));
  } else {
    return `${base}/`;
  }
  return `${base}/?${params.toString()}`;
}

function stripDeepLinkParams(win) {
  const url = new URL(win.location.href);
  for (const name of Object.values(DEEP_LINK_PARAMS)) url.searchParams.delete(name);
  win.history.replaceState(win.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

/**
 * Lit la cible depuis l'URL (puis la retire de la barre d'adresse et la met de côté) ou,
 * à défaut, depuis la mise de côté d'un chargement précédent (connexion entre-temps).
 */
export function consumeDeepLinkFromLocation(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return null;
  const fromUrl = readDeepLinkTargetFromSearch(win.location?.search);
  if (fromUrl) {
    try {
      win.sessionStorage.setItem(PENDING_KEY, JSON.stringify(fromUrl));
      stripDeepLinkParams(win);
    } catch {
      /* navigation privée : on garde seulement la valeur en mémoire */
    }
    return fromUrl;
  }
  try {
    const raw = win.sessionStorage.getItem(PENDING_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && parsed.type ? parsed : null;
  } catch {
    return null;
  }
}

export function clearPendingDeepLink(win = typeof window !== 'undefined' ? window : null) {
  try {
    win?.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}
