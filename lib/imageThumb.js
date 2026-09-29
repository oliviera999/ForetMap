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
  noteMapPhotoThumbPresence,
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
    noteMapPhotoThumbPresence(thumbRel, true);
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
  if (thumbRel) {
    deleteFile(thumbRel);
    noteMapPhotoThumbPresence(thumbRel, false);
  }
}

/**
 * Vignettes des autres familles **publiques** affichées en tuiles
 * (`docs/AUDIT_AFFICHAGE_PHOTOS_2026-09-29.md` PH-M1) :
 *  - `plants/<id>/<fichier>.ext`  → `plants/<id>/<fichier>.thumb.jpg` ;
 *  - `tasks/<id>.ext`             → `tasks/<id>.thumb.jpg` ;
 *  - `media-library/image/…/x.ext` → `media-thumbs/media-library/image/…/x.thumb.jpg` — hors de
 *    `media-library/`, dont les fichiers sont le catalogue (une vignette y serait listée).
 * Le front dérive la même adresse (`src/shared/utils/uploadThumbUrl.js`) et retombe sur
 * l'original si la vignette n'existe pas (fichier antérieur, sharp absent).
 */
const PUBLIC_THUMB_RULES = Object.freeze([
  { re: /^plants\/\d+\/[\w.-]+\.(jpe?g|png|webp)$/i, prefix: '' },
  { re: /^tasks\/[\w-]+\.(jpe?g|png|webp)$/i, prefix: '' },
  { re: /^media-library\/image\/[\w./-]+\.(jpe?g|png|webp)$/i, prefix: 'media-thumbs/' },
]);

/** Chemin de la vignette d'une photo publique, ou `null` si la famille n'en a pas. */
function publicUploadThumbRelativePath(mainRelativePath) {
  const main = mainRelativePath != null ? String(mainRelativePath).trim() : '';
  if (!main || main.includes('..') || main.includes('\\') || /\.thumb\.jpe?g$/i.test(main)) {
    return null;
  }
  const rule = PUBLIC_THUMB_RULES.find((r) => r.re.test(main));
  if (!rule) return null;
  return `${rule.prefix}${main.replace(/\.(jpe?g|png|webp)$/i, '.thumb.jpg')}`;
}

/**
 * Génère la vignette d'une photo publique (plante, tâche, médiathèque). Ne lève jamais :
 * une vignette manquante n'empêche pas l'envoi, le front affiche alors l'original.
 * @returns {Promise<{ ok: boolean, skipped?: boolean, error?: string }>}
 */
async function generatePublicUploadThumb(mainRelativePath) {
  const thumbRel = publicUploadThumbRelativePath(mainRelativePath);
  if (!thumbRel) return { ok: false, error: 'path_not_supported' };
  const sharp = getSharp();
  if (!sharp) return { ok: false, skipped: true };
  let absIn;
  let absOut;
  try {
    absIn = getAbsolutePath(String(mainRelativePath).trim());
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
    logger.warn({ err, main: mainRelativePath }, 'Génération vignette en échec');
    return { ok: false, error: err.message || 'sharp' };
  }
}

/**
 * Supprime la vignette d'une photo publique (l'original est géré par l'appelant). Gardée si
 * un original de même nom existe encore : `tasks/x.png` remplacé par `tasks/x.jpg` partage
 * la vignette `tasks/x.thumb.jpg`, déjà régénérée pour le nouveau fichier.
 */
function deletePublicUploadThumb(mainRelativePath) {
  const thumbRel = publicUploadThumbRelativePath(mainRelativePath);
  if (!thumbRel) return;
  const stem = String(mainRelativePath)
    .trim()
    .replace(/\.(jpe?g|png|webp)$/i, '');
  const siblingAlive = ['jpg', 'jpeg', 'png', 'webp'].some((ext) => {
    try {
      return fs.existsSync(getAbsolutePath(`${stem}.${ext}`));
    } catch (_) {
      return false;
    }
  });
  if (!siblingAlive) deleteFile(thumbRel);
}

module.exports = {
  generateMapPhotoThumbFromMainRelativePath,
  deleteMapPhotoMainAndThumb,
  publicUploadThumbRelativePath,
  generatePublicUploadThumb,
  deletePublicUploadThumb,
  THUMB_MAX_WIDTH,
};
