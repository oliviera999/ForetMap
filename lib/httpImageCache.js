'use strict';

/** Cache navigateur / CDN pour images servies depuis disque (fichiers versionnés par nom). */
const PUBLIC_IMAGE_CACHE_CONTROL = 'public, max-age=86400';

function setPublicImageCacheHeaders(res) {
  if (!res.headersSent) res.setHeader('Cache-Control', PUBLIC_IMAGE_CACHE_CONTROL);
}

/** Options `res.sendFile` : maxAge + en-tête cohérent. */
function sendFilePublicImageOptions() {
  return {
    maxAge: 86400000,
    immutable: false,
    headers: { 'Cache-Control': PUBLIC_IMAGE_CACHE_CONTROL },
  };
}

module.exports = {
  PUBLIC_IMAGE_CACHE_CONTROL,
  setPublicImageCacheHeaders,
  sendFilePublicImageOptions,
};
