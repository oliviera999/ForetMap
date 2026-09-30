/**
 * Adresse de la vignette serveur (520 px, JPEG) d'une photo publique, alignée sur
 * `lib/imageThumb.js` (`publicUploadThumbRelativePath`) — ou `null` si la famille n'en a pas.
 *
 * La vignette peut manquer (fichier antérieur à sa génération, serveur sans sharp) :
 * l'afficher via `PhotoThumb`, qui retombe alors sur l'original.
 *
 *  - `/uploads/plants/3/photo-1.jpg`          → `/uploads/plants/3/photo-1.thumb.jpg`
 *  - `/uploads/tasks/abc.png`                 → `/uploads/tasks/abc.thumb.jpg`
 *  - `/uploads/media-library/image/…/x.webp`  → `/uploads/media-thumbs/media-library/image/…/x.thumb.jpg`
 *  - zones et repères : déjà fournis par l'API (`thumb_url`).
 *
 * URL signée (famille privée `tasks/`, `lib/uploadsSignedUrls.js`) : la signature couvre
 * l'original et sa vignette, la requête `?exp=…&sig=…` est donc recopiée telle quelle. Toute
 * autre requête (paramètre inconnu) désactive la vignette, comme avant.
 * @param {string} url
 * @returns {string|null}
 */
export function uploadThumbUrl(url) {
  const raw = String(url || '').trim();
  const match = /^(.*?\/uploads\/)([^?#]+)(\?[^#]*)?$/.exec(raw);
  if (!match) return null;
  const [, base, rel, query = ''] = match;
  if (query && !/^\?exp=\d+&sig=[\w-]+$/.test(query)) return null;
  if (rel.includes('..') || /\.thumb\.jpe?g$/i.test(rel)) return null;
  const thumbName = (r) => r.replace(/\.(jpe?g|png|webp)$/i, '.thumb.jpg');
  if (/^plants\/\d+\/[\w.-]+\.(jpe?g|png|webp)$/i.test(rel)) return `${base}${thumbName(rel)}`;
  if (/^tasks\/[\w-]+\.(jpe?g|png|webp)$/i.test(rel)) return `${base}${thumbName(rel)}${query}`;
  if (/^media-library\/image\/[\w./-]+\.(jpe?g|png|webp)$/i.test(rel)) {
    return `${base}media-thumbs/${thumbName(rel)}`;
  }
  return null;
}
