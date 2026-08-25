'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { getAbsolutePath, ensureDir, deleteFile } = require('./uploads');
const {
  companionMapPhotoThumbRelativePath,
  isSafePublicZonePhotoRelativePath,
  isSafePublicMarkerPhotoRelativePath,
  isSafePublicZonePhotoThumbRelativePath,
  isSafePublicMarkerPhotoThumbRelativePath,
} = require('./uploadsPublicUrls');

// Chargé à la première vignette : ~+23 Mo de RSS au boot sinon (audit charge
// serveur, piste 1). Optionnel : échec d’installation (hébergeur sans binaires)
// → pas de vignettes, l’app reste fonctionnelle ; l'échec est mémorisé pour ne
// pas retenter (ni re-loguer) à chaque appel.
let sharpLazy = null;
let sharpLoadFailed = false;
function getSharp() {
  if (sharpLazy) return sharpLazy;
  if (sharpLoadFailed) return null;
  try {
    sharpLazy = require('sharp');
  } catch (err) {
    sharpLoadFailed = true;
    logger.warn({ err }, 'Module sharp indisponible : vignettes zones/repères non générées');
  }
  return sharpLazy;
}

const THUMB_MAX_WIDTH = 520;
const THUMB_JPEG_QUALITY = 82;

/**
 * Génère `*.thumb.jpg` à côté d’une photo zone/repère (JPEG/PNG/WebP source).
 * @param {string} mainRelativePath — chemin relatif sous uploads/
 * @returns {Promise<{ ok: boolean, skipped?: boolean, error?: string }>}
 */
async function generateMapPhotoThumbFromMainRelativePath(mainRelativePath) {
  const sharp = getSharp();
  if (!sharp) return { ok: false, skipped: true };
  const main = mainRelativePath != null ? String(mainRelativePath).trim() : '';
  if (!isSafePublicZonePhotoRelativePath(main) && !isSafePublicMarkerPhotoRelativePath(main)) {
    return { ok: false, error: 'path_not_supported' };
  }
  const thumbRel = companionMapPhotoThumbRelativePath(main);
  if (!thumbRel) return { ok: false, error: 'no_thumb_rel' };
  if (
    !isSafePublicZonePhotoThumbRelativePath(thumbRel) &&
    !isSafePublicMarkerPhotoThumbRelativePath(thumbRel)
  ) {
    return { ok: false, error: 'invalid_thumb_rel' };
  }
  let absIn;
  let absOut;
  try {
    absIn = getAbsolutePath(main);
    absOut = getAbsolutePath(thumbRel);
  } catch (e) {
    return { ok: false, error: e.message || 'path' };
  }
  if (!fs.existsSync(absIn)) return { ok: false, error: 'missing_source' };
  ensureDir(path.dirname(absOut));
  try {
    await sharp(absIn, { failOn: 'none' })
      .rotate()
      .resize({ width: THUMB_MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: THUMB_JPEG_QUALITY, mozjpeg: true })
      .toFile(absOut);
    return { ok: true };
  } catch (err) {
    logger.warn({ err, main }, 'Génération vignette carte en échec');
    return { ok: false, error: err.message || 'sharp' };
  }
}

function deleteMapPhotoMainAndThumb(mainRelativePath) {
  const main = mainRelativePath != null ? String(mainRelativePath).trim() : '';
  if (!main) return;
  deleteFile(main);
  const thumbRel = companionMapPhotoThumbRelativePath(main);
  if (thumbRel) deleteFile(thumbRel);
}

module.exports = {
  generateMapPhotoThumbFromMainRelativePath,
  deleteMapPhotoMainAndThumb,
  THUMB_MAX_WIDTH,
};
