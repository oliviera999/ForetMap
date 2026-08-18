'use strict';

/**
 * Résolution disque de la **bibliothèque de sprites de visite**.
 *
 * Depuis la migration `176_visit_mascot_packs_drop_map.sql`, la bibliothèque est globale :
 * un nom de fichier suffit à désigner un sprite, et les nouveaux fichiers sont écrits à
 * plat dans `uploads/visit_mascot_sprite_library/`.
 *
 * Les fichiers antérieurs n'ont **pas** été déplacés : ils vivent dans un sous-dossier par
 * carte (`uploads/visit_mascot_sprite_library/<map_id>/`) et restent référencés par les
 * packs publiés via l'URL historique. Ce module encapsule ce repli, partagé par les routes
 * (`routes/visit/mascot.js`) et l'export d'archive (`lib/mascotPackArchive.js`).
 */

const fs = require('fs');
const {
  visitMascotSpriteLibraryRelativeDir,
  sanitizeMascotPackAssetFilename,
  VISIT_MASCOT_SPRITE_LIBRARY_API_ROOT,
} = require('./visitMascotPackHelpers');
const { getAbsolutePath } = require('./uploads');

/**
 * @param {string} filename
 * @returns {string | null} chemin relatif sous `uploads/`, ou `null` si le fichier est absent
 */
function resolveVisitMascotSpriteLibraryRelPath(filename) {
  const safe = sanitizeMascotPackAssetFilename(filename);
  if (!safe) return null;
  const rootRel = visitMascotSpriteLibraryRelativeDir();
  const flatRel = `${rootRel}/${safe}`;
  try {
    if (fs.existsSync(getAbsolutePath(flatRel))) return flatRel;
  } catch (_) {
    return null;
  }
  let entries = [];
  try {
    entries = fs.readdirSync(getAbsolutePath(rootRel), { withFileTypes: true });
  } catch (_) {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const legacyDir = sanitizeMascotPackAssetFilename(entry.name);
    if (!legacyDir) continue;
    const legacyRel = `${rootRel}/${legacyDir}/${safe}`;
    try {
      if (fs.existsSync(getAbsolutePath(legacyRel))) return legacyRel;
    } catch (_) {
      /* chemin hors uploads : ignoré */
    }
  }
  return null;
}

/** @returns {string | null} chemin absolu du sprite, ou `null` s'il n'existe pas. */
function resolveVisitMascotSpriteLibraryAbsolutePath(filename) {
  const rel = resolveVisitMascotSpriteLibraryRelPath(filename);
  if (!rel) return null;
  try {
    return getAbsolutePath(rel);
  } catch (_) {
    return null;
  }
}

/**
 * Nom de fichier porté par une URL de bibliothèque, canonique
 * (`/api/visit/mascot-sprite-library/assets/x.png`) ou historique
 * (`/api/visit/mascot-sprite-library/<map_id>/assets/x.png`).
 * @param {string} url
 * @returns {string | null}
 */
function visitMascotSpriteLibraryFilenameFromUrl(url) {
  const raw = String(url || '').trim();
  if (!raw.startsWith(VISIT_MASCOT_SPRITE_LIBRARY_API_ROOT)) return null;
  const tail = raw.slice(VISIT_MASCOT_SPRITE_LIBRARY_API_ROOT.length).split(/[?#]/)[0];
  const parts = tail.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  if (parts[parts.length - 2] !== 'assets') return null;
  let last = parts[parts.length - 1];
  try {
    last = decodeURIComponent(last);
  } catch (_) {
    /* nom déjà décodé */
  }
  return sanitizeMascotPackAssetFilename(last);
}

module.exports = {
  resolveVisitMascotSpriteLibraryRelPath,
  resolveVisitMascotSpriteLibraryAbsolutePath,
  visitMascotSpriteLibraryFilenameFromUrl,
};
