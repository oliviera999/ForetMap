'use strict';

/**
 * Vignette statique d'un pack de mascotte (audit UI/UX du 19/11/2026, U1, point 4 du lot 2).
 *
 * La grille de choix de la mascotte affichait chaque pack avec son image complète (planche
 * `spritesheet` entière, ou trame `sprite_cut` à pleine taille) : les aperçus arrivaient une
 * dizaine de secondes après la carte, cadres vides en attendant. Ce module produit UNE petite
 * image par pack — la première trame de l'état `idle` (sinon du premier état décrit), réduite à
 * `THUMBNAIL_SIZE_PX` de côté — à un chemin **déterministe** :
 *
 *   uploads/visit_mascot_packs/<id>/_vignette.png
 *   → servie par la route existante GET /api/visit/mascot-packs/<id>/assets/_vignette.png
 *
 * Pas de migration : l'URL se déduit de l'identifiant du pack, et le fichier existe ou non.
 * PNG plutôt que WebP : la route des assets de pack répond toujours en `image/png`, et les jetons
 * d'aperçu des packs non publiés n'acceptent que `.png` (`lib/visitMascotPackAssetPreview.js`).
 *
 * Branchement : `routes/visit/mascot.js` appelle `generateVisitMascotPackThumbnail` après la
 * création, l'import, l'enregistrement, la réinitialisation d'un pack et tout changement de ses
 * images ; `mascot_catalog[].thumbnail_url` (`/api/visit/content`, `/api/visit/mascots`) vaut
 * `visitMascotPackThumbnailUrlIfPresent(id)` ; le sélecteur de guide de la Visite l'affiche.
 * Rattrapage des packs existants : `scripts/generate-visit-mascot-thumbnails.js`.
 *
 * `sharp` est chargé à la demande et reste optionnel, comme pour les vignettes de photos
 * (`lib/imageThumb.js`) : sans lui, pas de vignette, la grille garde son comportement actuel.
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { getAbsolutePath, ensureDir } = require('./uploads');
const {
  visitMascotPackAssetRelativeDir,
  visitMascotSpriteLibraryRelativeDir,
} = require('./visitMascotPackHelpers');

/** Nom réservé du fichier de vignette dans le dossier du pack. */
const THUMBNAIL_FILENAME = '_vignette.png';
/** Côté maximal de la vignette (px) : 2× une case de grille de 48 px. */
const THUMBNAIL_SIZE_PX = 96;

const PUBLIC_MASCOT_URL_PREFIX = '/assets/mascots/';
const SPRITE_LIBRARY_URL_PREFIXES = Object.freeze([
  '/api/visit/mascot-sprite-library/assets/',
  '/api/visit/mascot-sprite-library/',
]);
const SAFE_SEGMENT_RE = /^[a-zA-Z0-9._-]+$/;

let sharpLazy = null;
let sharpLoadFailed = false;
function getSharp() {
  if (sharpLazy) return sharpLazy;
  if (sharpLoadFailed) return null;
  try {
    sharpLazy = require('sharp');
  } catch (err) {
    sharpLoadFailed = true;
    logger.warn({ err }, 'Module sharp indisponible : vignettes de mascottes non générées');
  }
  return sharpLazy;
}

function normalizePackId(packId) {
  const id = String(packId || '').trim();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

/** Chemin relatif (sous `uploads/`) de la vignette d'un pack, `null` si l'identifiant est invalide. */
function visitMascotPackThumbnailRelativePath(packId) {
  const dir = visitMascotPackAssetRelativeDir(normalizePackId(packId));
  return dir ? `${dir}/${THUMBNAIL_FILENAME}` : null;
}

/** URL publique de la vignette (route des assets de pack), `null` si l'identifiant est invalide. */
function visitMascotPackThumbnailUrl(packId) {
  const id = normalizePackId(packId);
  return id ? `/api/visit/mascot-packs/${id}/assets/${THUMBNAIL_FILENAME}` : null;
}

/** Vrai si la vignette du pack a déjà été générée. */
function hasVisitMascotPackThumbnail(packId) {
  const rel = visitMascotPackThumbnailRelativePath(packId);
  if (!rel) return false;
  try {
    return fs.existsSync(getAbsolutePath(rel));
  } catch (_) {
    return false;
  }
}

/** Retire la vignette d'un pack (sans effet si elle n'existe pas). */
function removeVisitMascotPackThumbnail(packId) {
  const rel = visitMascotPackThumbnailRelativePath(packId);
  if (!rel) return;
  try {
    fs.rmSync(getAbsolutePath(rel), { force: true });
  } catch (err) {
    logger.warn({ err, packId }, 'Vignette de mascotte non retirée');
  }
}

/**
 * URL de la vignette d'un pack **si elle existe sur le disque**, sinon `null` (le front garde
 * alors la silhouette de repli).
 */
function visitMascotPackThumbnailUrlIfPresent(packId) {
  return hasVisitMascotPackThumbnail(packId) ? visitMascotPackThumbnailUrl(packId) : null;
}

/**
 * Identifiant de ligne (UUID) des packs publiés, par `catalog_id`. La vignette est rangée sous
 * l'UUID du pack, alors que le catalogue de la Visite ne connaît que `catalog_id`. Même
 * dédoublonnage que `listPublishedVisitMascotPacks` : le plus récemment mis à jour gagne.
 * Table absente → carte vide (aucune vignette, jamais une erreur).
 * @param {{ queryAll: (sql: string, params?: unknown[]) => Promise<Array<object>> }} db
 * @returns {Promise<Map<string, string>>}
 */
async function listPublishedVisitMascotPackUuids({ queryAll }) {
  const out = new Map();
  let rows = [];
  try {
    rows = await queryAll(
      `SELECT id, catalog_id FROM visit_mascot_packs
        WHERE is_published = 1
        ORDER BY updated_at DESC, id ASC`,
    );
  } catch (err) {
    if (err && (err.errno === 1146 || err.code === 'ER_NO_SUCH_TABLE')) return out;
    throw err;
  }
  for (const row of rows || []) {
    const catalogId = String(row?.catalog_id || '').trim();
    const id = normalizePackId(row?.id);
    if (catalogId && id && !out.has(catalogId)) out.set(catalogId, id);
  }
  return out;
}

function firstStateKey(stateFrames) {
  if (!stateFrames || typeof stateFrames !== 'object') return null;
  if (stateFrames.idle) return 'idle';
  return Object.keys(stateFrames)[0] || null;
}

/**
 * Image source et découpe de la vignette d'un pack (logique pure, sans I/O).
 * @param {object} pack JSON du pack (`renderer` sprite_cut | spritesheet | rive)
 * @returns {{ src: string, crop: { left: number, top: number, width: number, height: number } | null } | null}
 *   `null` pour un pack Rive ou sans état exploitable.
 */
function pickVisitMascotThumbnailSource(pack) {
  if (!pack || typeof pack !== 'object') return null;
  if (pack.renderer === 'spritesheet') {
    const sheet = pack.spritesheet;
    const key = firstStateKey(sheet?.stateFrames);
    if (!sheet?.src || !key) return null;
    const state = sheet.stateFrames[key];
    const width = Number(sheet.frameWidth);
    const height = Number(sheet.frameHeight);
    if (!(width > 0) || !(height > 0)) return null;
    return {
      src: String(sheet.src),
      crop: {
        left: (Number(state.col) || 0) * width,
        top: (Number(state.row) || 0) * height,
        width,
        height,
      },
    };
  }
  if (pack.renderer === 'sprite_cut') {
    const key = firstStateKey(pack.stateFrames);
    if (!key) return null;
    const state = pack.stateFrames[key] || {};
    if (Array.isArray(state.srcs) && state.srcs[0])
      return { src: String(state.srcs[0]), crop: null };
    if (Array.isArray(state.files) && state.files[0]) {
      const base = String(pack.framesBase || '');
      return { src: `${base}${String(state.files[0]).replace(/^\//, '')}`, crop: null };
    }
    return null;
  }
  return null;
}

/** Segments d'un chemin relatif, refusés s'ils sortent du dossier ou portent un caractère exotique. */
function safeSegments(relative) {
  const parts = String(relative || '')
    .split('/')
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch (_) {
        return '';
      }
    });
  if (parts.length === 0 || parts.some((part) => !part || part === '.' || part === '..')) {
    return null;
  }
  return parts.every((part) => SAFE_SEGMENT_RE.test(part)) ? parts : null;
}

/**
 * Fichier disque d'une URL d'image de pack, limité aux trois origines connues : assets du pack
 * (`/api/visit/mascot-packs/<id>/assets/…`, le même pack seulement), bibliothèque de sprites,
 * catalogue livré (`/assets/mascots/…`, cherché dans `publicDirs`). Toute autre URL → `null`.
 * @param {string} url
 * @param {{ packId: string, publicDirs?: string[] }} options
 * @returns {string|null} chemin absolu
 */
function resolveVisitMascotImagePath(url, { packId, publicDirs = defaultPublicDirs() } = {}) {
  const pathname = String(url || '').split(/[?#]/)[0];
  const id = normalizePackId(packId);
  const packPrefix = id ? `/api/visit/mascot-packs/${id}/assets/` : null;
  if (packPrefix && pathname.startsWith(packPrefix)) {
    const parts = safeSegments(pathname.slice(packPrefix.length));
    if (!parts || parts.length !== 1) return null;
    return getAbsolutePath(`${visitMascotPackAssetRelativeDir(id)}/${parts[0]}`);
  }
  for (const prefix of SPRITE_LIBRARY_URL_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      const parts = safeSegments(pathname.slice(prefix.length));
      if (!parts || parts.length !== 1) return null;
      return getAbsolutePath(`${visitMascotSpriteLibraryRelativeDir()}/${parts[0]}`);
    }
  }
  if (pathname.startsWith(PUBLIC_MASCOT_URL_PREFIX)) {
    const parts = safeSegments(pathname.slice(1));
    if (!parts) return null;
    for (const dir of publicDirs) {
      const candidate = path.join(dir, ...parts);
      if (candidate.startsWith(path.resolve(dir) + path.sep) && fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function defaultPublicDirs() {
  const root = path.resolve(__dirname, '..');
  return [path.join(root, 'dist'), path.join(root, 'public')];
}

/**
 * Génère (ou régénère) la vignette d'un pack.
 * @param {{ packId: string, pack: object, publicDirs?: string[], size?: number }} params
 * @returns {Promise<{ ok: boolean, skipped?: string, url?: string, relativePath?: string, bytes?: number }>}
 */
async function generateVisitMascotPackThumbnail({
  packId,
  pack,
  publicDirs,
  size = THUMBNAIL_SIZE_PX,
}) {
  const relativePath = visitMascotPackThumbnailRelativePath(packId);
  if (!relativePath) return { ok: false, skipped: 'pack_id_invalide' };
  const source = pickVisitMascotThumbnailSource(pack);
  // Plus d'image exploitable (pack passé en Rive, trame retirée) : la vignette d'avant
  // montrerait un personnage qui n'est plus celui du pack — on la retire.
  if (!source) {
    removeVisitMascotPackThumbnail(packId);
    return { ok: false, skipped: 'aucune_image' };
  }
  const absIn = resolveVisitMascotImagePath(source.src, { packId, publicDirs });
  if (!absIn || !fs.existsSync(absIn)) {
    removeVisitMascotPackThumbnail(packId);
    return { ok: false, skipped: 'source_introuvable' };
  }
  const sharp = getSharp();
  if (!sharp) return { ok: false, skipped: 'sharp_indisponible' };
  const absOut = getAbsolutePath(relativePath);
  try {
    let image = sharp(absIn);
    if (source.crop) image = image.extract(source.crop);
    const buffer = await image
      .resize(size, size, {
        fit: 'inside',
        withoutEnlargement: true,
        // Pixel art : pas de lissage, sinon la vignette d'un sprite devient floue.
        kernel: pack.pixelated ? 'nearest' : 'lanczos3',
      })
      .png({ compressionLevel: 9, palette: true })
      .toBuffer();
    ensureDir(path.dirname(absOut));
    fs.writeFileSync(absOut, buffer);
    return {
      ok: true,
      url: visitMascotPackThumbnailUrl(packId),
      relativePath,
      bytes: buffer.length,
    };
  } catch (err) {
    logger.warn({ err, packId }, 'Vignette de mascotte non générée');
    return { ok: false, skipped: 'erreur_image' };
  }
}

module.exports = {
  THUMBNAIL_FILENAME,
  THUMBNAIL_SIZE_PX,
  visitMascotPackThumbnailRelativePath,
  visitMascotPackThumbnailUrl,
  hasVisitMascotPackThumbnail,
  visitMascotPackThumbnailUrlIfPresent,
  removeVisitMascotPackThumbnail,
  listPublishedVisitMascotPackUuids,
  pickVisitMascotThumbnailSource,
  resolveVisitMascotImagePath,
  generateVisitMascotPackThumbnail,
};
