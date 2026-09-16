/**
 * Helpers purs de la galerie média de la visite — extraits de `visit-views.jsx` (O6).
 *
 * Allègent le méga-composant `visit-views.jsx` et couvrent par des tests une logique sinon
 * noyée dans le JSX : résolution de la source d'image (vignette / lightbox), réordonnancement
 * par glisser-déposer, et clé d'identité « vu » d'un item.
 */
import { withAppBase } from '../services/api';

/** Clé d'identité « vu » d'un item (zone/marqueur/…) : `${type}:${id}`. */
export function itemSeenKey(type, id) {
  return `${type}:${id}`;
}

/** Source principale d'un média de visite (préfixée par la base de l'app), ou '' si absente. */
export function visitMediaImgSrc(m) {
  const u = m?.image_url;
  if (!u) return '';
  return withAppBase(u);
}

/** Vignette galerie visite : préfère `thumb_url` (carte) si fourni par l'API, sinon l'image. */
export function visitMediaGalleryThumbDisplaySrc(m) {
  const u = m?.thumb_url || m?.image_url;
  if (!u) return '';
  return withAppBase(u);
}

/** Image plein écran (lightbox) : toujours la résolution principale (repli sur la vignette). */
export function visitMediaGalleryLightboxSrc(m) {
  const u = m?.image_url || m?.thumb_url;
  if (!u) return '';
  return withAppBase(u);
}

/**
 * Clé d'identité d'une photo de lieu, **indépendante de la forme de l'URL**.
 *
 * Un même cliché est servi sous plusieurs URL selon son stockage et son ancienneté :
 * `/uploads/zones/3/10.jpg` (chemin canonique), `/uploads/zones/3/10.thumb.jpg` (vignette
 * dérivée) et `/api/zones/3/photos/10/data` (route historique, servie tant que
 * `zone_photos.image_path` n'est pas au format public). `visit_media.image_url` fige la forme
 * qui avait cours **au moment de l'association** : après une reprise des chemins, la photo
 * carte et le média visite désignent le même fichier sous deux URL différentes — et l'encart
 * de visite affichait deux fois la même image. On compare donc `(type, lieu, photo)` plutôt
 * que la chaîne.
 *
 * @param {unknown} url
 * @returns {string} clé stable ('' si URL vide)
 */
export function visitImageIdentityKey(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  // Origine (déploiement sous domaine) et query/hash (cache-busting) hors identité.
  const path = raw.split(/[?#]/)[0].replace(/^https?:\/\/[^/]+/i, '');
  if (!path) return '';
  // `/uploads/zones/<zoneId>/<photoId>[.thumb].ext` — préfixe de base éventuel toléré.
  const uploaded = /\/uploads\/(zones|markers)\/([^/]+)\/(\d+)(?:\.thumb)?\.[a-z0-9]+$/i.exec(path);
  if (uploaded) {
    const kind = uploaded[1].toLowerCase() === 'zones' ? 'zone' : 'marker';
    return `${kind}:${decodeURIComponent(uploaded[2])}:${uploaded[3]}`;
  }
  const zoneApi = /\/api\/zones\/([^/]+)\/photos\/(\d+)\/data$/i.exec(path);
  if (zoneApi) return `zone:${decodeURIComponent(zoneApi[1])}:${zoneApi[2]}`;
  const markerApi = /\/api\/map\/markers\/([^/]+)\/photos\/(\d+)\/data$/i.exec(path);
  if (markerApi) return `marker:${decodeURIComponent(markerApi[1])}:${markerApi[2]}`;
  const visitApi = /\/api\/visit\/media\/(\d+)\/data$/i.exec(path);
  if (visitApi) return `visit-media:${visitApi[1]}`;
  return `url:${path}`;
}

/**
 * Deux URL désignent-elles la **même photo** ? Évite le double affichage quand la photo lead
 * carte et un média visite pointent vers le même fichier, quelle que soit la forme d'URL
 * (chemin public, vignette, route API historique, URL absolue, query/hash).
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function sameVisitImageUrl(a, b) {
  const ka = visitImageIdentityKey(a);
  const kb = visitImageIdentityKey(b);
  if (!ka || !kb) return false;
  return ka === kb;
}

/**
 * Un média visite reprend-il la photo lead carte (toutes formes d'URL image/vignette) ?
 * @param {object|null|undefined} media
 * @param {object|null|undefined} leadPhoto `{ image_url?, thumb_url? }`
 * @returns {boolean}
 */
export function mediaMatchesLeadPhoto(media, leadPhoto) {
  if (!media || !leadPhoto) return false;
  const leadUrls = [leadPhoto.image_url, leadPhoto.thumb_url].filter(Boolean);
  const mediaUrls = [media.image_url, media.thumb_url].filter(Boolean);
  if (!leadUrls.length || !mediaUrls.length) return false;
  for (const leadUrl of leadUrls) {
    for (const mediaUrl of mediaUrls) {
      if (sameVisitImageUrl(leadUrl, mediaUrl)) return true;
    }
  }
  return false;
}

/**
 * Réordonne une liste de médias après un glisser-déposer : déplace l'élément `draggedId` à la
 * position de `dropTargetId`. Retourne la liste inchangée (même référence) si l'un des ids est
 * introuvable ou si source == cible ; sinon une nouvelle liste (référence neuve).
 */
export function reorderVisitMediaRows(list, draggedId, dropTargetId) {
  const ids = list.map((m) => m.id);
  const from = ids.indexOf(draggedId);
  const to = ids.indexOf(dropTargetId);
  if (from < 0 || to < 0 || from === to) return list;
  const next = [...list];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed);
  return next;
}
