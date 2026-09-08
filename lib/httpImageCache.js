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

module.exports = {
  PUBLIC_IMAGE_CACHE_CONTROL,
  SEND_FILE_ABS_OPTIONS,
  sendFilePublicImageOptions,
};
