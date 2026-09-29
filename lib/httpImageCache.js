'use strict';

/** Cache navigateur / CDN pour images servies depuis disque (fichiers versionnés par nom). */
const PUBLIC_IMAGE_CACHE_CONTROL = 'public, max-age=86400';

/**
 * `send` ignore par défaut tout segment de chemin qui commence par un point
 * (ex. worktree `.worktrees`) et répond 404. Les chemins que nous résolvons
 * nous-mêmes sont des fichiers voulus : on autorise.
 */
const SEND_FILE_ABS_OPTIONS = Object.freeze({ dotfiles: 'allow' });

/** Options `res.sendFile` : maxAge + en-tête cohérent. */
function sendFilePublicImageOptions() {
  return {
    ...SEND_FILE_ABS_OPTIONS,
    maxAge: 86400000,
    immutable: false,
    headers: { 'Cache-Control': PUBLIC_IMAGE_CACHE_CONTROL },
  };
}

/**
 * Noms uniques jamais réécrits (médiathèque : `<horodatage ms>-<aléa>.ext`, et leurs vignettes) :
 * le contenu d'une URL ne change pas, le navigateur peut la garder un an sans revalider.
 */
const IMMUTABLE_IMAGE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const IMMUTABLE_NAME_RE =
  /(^|\/)media-(library|thumbs)\/.*\/\d{13}-[0-9a-f]{10}(\.thumb)?\.[a-z0-9]+$/i;

/** `Cache-Control` d'une image publique servie sous `/uploads`, selon son chemin. */
function publicImageCacheControlForPath(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  return IMMUTABLE_NAME_RE.test(normalized)
    ? IMMUTABLE_IMAGE_CACHE_CONTROL
    : PUBLIC_IMAGE_CACHE_CONTROL;
}

/**
 * Images d'élèves servies par une route authentifiée (rapports de tâche, carnet) : ni cache
 * partagé, ni copie disque — sinon une photo reste lisible après révocation de l'accès ou
 * sur un poste partagé.
 */
const PRIVATE_IMAGE_CACHE_CONTROL = 'private, no-store';

function sendFilePrivateImageOptions() {
  return {
    ...SEND_FILE_ABS_OPTIONS,
    cacheControl: false,
    headers: { 'Cache-Control': PRIVATE_IMAGE_CACHE_CONTROL },
  };
}

module.exports = {
  PUBLIC_IMAGE_CACHE_CONTROL,
  IMMUTABLE_IMAGE_CACHE_CONTROL,
  PRIVATE_IMAGE_CACHE_CONTROL,
  SEND_FILE_ABS_OPTIONS,
  sendFilePublicImageOptions,
  sendFilePrivateImageOptions,
  publicImageCacheControlForPath,
};
