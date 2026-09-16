/**
 * Helpers purs de liens « source » d'une fiche plante — extraits de `foretmap-views.jsx` (O6).
 *
 * Détection de liens HTTP / chemins d'upload locaux / images directes, et résolution des pages
 * Wikimedia Commons (`/wiki/File:…`, `/wiki/Category:…`). Logique de parsing d'URL sujette aux
 * cas limites : isolée ici pour être couverte par des tests. Toutes les fonctions sont pures.
 */

export function isHttpLink(value) {
  return /^https?:\/\//i.test(value);
}

export function isLocalUploadsPath(value) {
  return /^\/uploads\/[^?#\s]+/i.test(value);
}

export function isLikelyDirectImageUrl(value) {
  if (isLocalUploadsPath(value)) {
    return /\.(avif|bmp|gif|jpe?g|png|svg|webp)(?:$|\?)/i.test(value);
  }
  if (!isHttpLink(value)) return false;
  try {
    const url = new URL(value);
    const path = url.pathname.toLowerCase();
    // Accepte les URLs pointant vers un fichier image direct
    // ou les liens Wikimedia FilePath (binaire direct).
    if (/\.(avif|bmp|gif|jpe?g|png|svg|webp)$/.test(path)) return true;
    if (/\/wiki\/special:filepath\//.test(path)) return true;
    return false;
  } catch {
    return false;
  }
}

/** Page fichier Commons /wiki/File:… → titre de fichier (ou null). */
export function parseCommonsFilePageFromUrl(value) {
  if (!isHttpLink(value)) return null;
  try {
    const url = new URL(value);
    if (!/^(?:www\.)?commons\.wikimedia\.org$/i.test(url.hostname)) return null;
    const m = url.pathname.match(/^\/wiki\/File:(.+)$/i);
    if (!m) return null;
    return m[1];
  } catch {
    return null;
  }
}

/** Page fichier Commons → URL affichable en miniature (redirige vers le binaire), ou null. */
export function commonsFilePageToDisplaySrc(value) {
  const fileTitle = parseCommonsFilePageFromUrl(value);
  if (!fileTitle) return null;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${fileTitle}`;
}

/** Page catégorie Commons /wiki/Category:… → titre de catégorie décodé (ou null). */
export function parseCommonsCategoryFromUrl(value) {
  if (!isHttpLink(value)) return null;
  try {
    const url = new URL(value);
    if (!/^(?:www\.)?commons\.wikimedia\.org$/i.test(url.hostname)) return null;
    const m = url.pathname.match(/^\/wiki\/(Category:.+)$/i);
    if (!m) return null;
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

/** Libellé court d'une source : « fichier local », hostname (sans www.), ou la valeur brute. */
export function getSourceLabel(value) {
  if (isLocalUploadsPath(value)) return 'fichier local';
  try {
    const url = new URL(value);
    return url.hostname.replace(/^www\./i, '');
  } catch {
    return value;
  }
}

/**
 * Page du fichier sur Wikimedia Commons à partir d'une URL d'image (`upload.wikimedia.org`
 * ou `Special:FilePath`). C'est le lien d'attribution : les licences CC acceptent de
 * renvoyer vers la page source, qui porte auteur, licence et historique.
 *
 * @returns {string|null} `https://commons.wikimedia.org/wiki/File:Nom.jpg`, ou `null` si
 *   l'URL n'est pas une image Wikimedia.
 */
export function commonsFilePageFromPhotoUrl(url) {
  const raw = String(url || '').trim();
  if (!raw || !/wikimedia\.org|wikipedia\.org/i.test(raw)) return null;
  let path = '';
  try {
    path = new URL(raw).pathname;
  } catch {
    return null;
  }
  // .../commons/3/32/Nom.jpg et .../commons/thumb/3/32/Nom.jpg/800px-Nom.jpg
  let match = /\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/.exec(path);
  if (!match) match = /\/wiki\/Special:FilePath\/(.+)$/.exec(path);
  if (!match) return null;
  const file = decodeURIComponent(match[1]).split('?')[0];
  if (!file) return null;
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`;
}
