'use strict';

/**
 * Images de marque de Gnomes & Licornes (`platform.brand` : héros, trois vignettes, logo) —
 * variante WebP allégée pour l'écran de connexion (écrans de séance, constat K11 : trois
 * PNG d'environ 1,6 Mo et un logo de 1 Mo sur la page d'accueil).
 *
 * La variante est un **fichier compagnon** rangé hors de la médiathèque, sous
 * `uploads/gl_brand/optim/` (famille publique, comme `gl_brand/` que remplit l'import WP) :
 * elle n'apparaît pas dans le catalogue et **l'original n'est jamais modifié ni supprimé**.
 * Son nom porte l'empreinte du fichier d'origine : la même image rend toujours la même
 * variante (idempotent), une image remplacée en reçoit une autre.
 *
 * Rien ici ne lève : une variante manquante n'empêche ni l'envoi ni l'affichage, l'adresse
 * d'origine reste alors dans l'emplacement.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');
const { getAbsolutePath, ensureDir } = require('./uploads');

const GL_BRAND_VARIANT_DIR = 'gl_brand/optim';

/** Largeur maximale et poids visé, par usage. */
const GL_BRAND_VARIANT_PROFILES = Object.freeze({
  slot: Object.freeze({ maxWidth: 1600, targetBytes: 200 * 1024 }),
  // Le logo s'affiche à 88 px (connexion) et dans la barre : 512 px couvrent un écran dense.
  logo: Object.freeze({ maxWidth: 512, targetBytes: 60 * 1024 }),
});

/** Qualités WebP essayées dans l'ordre, jusqu'à passer sous le poids visé. */
const WEBP_QUALITIES = Object.freeze([82, 74, 66, 58, 50]);

const SOURCE_EXT_RE = /\.(jpe?g|png|webp)$/i;

/** Emplacements de `platform.brand.slots` qui portent une image. */
const GL_BRAND_IMAGE_SLOT_IDS = Object.freeze(['hero', 'card_world', 'card_rules', 'card_spells']);

// Chargé au premier besoin (comme `lib/imageThumb.js`) ; l'échec est mémorisé.
let sharpLazy = null;
let sharpLoadFailed = false;
function getSharp() {
  if (sharpLazy) return sharpLazy;
  if (sharpLoadFailed) return null;
  try {
    sharpLazy = require('sharp');
  } catch (err) {
    sharpLoadFailed = true;
    logger.warn({ err }, 'Module sharp indisponible : variantes des images de marque non générées');
  }
  return sharpLazy;
}

/** `/uploads/a/b.png?x=1` → `a/b.png` ; `null` pour toute autre adresse. */
function uploadsRelativePathFromUrl(url) {
  const raw = String(url || '')
    .trim()
    .split(/[?#]/)[0];
  if (!raw.startsWith('/uploads/')) return null;
  let rel = raw.slice('/uploads/'.length);
  try {
    rel = decodeURIComponent(rel);
  } catch (_) {
    return null;
  }
  if (!rel || rel.includes('..') || rel.includes('\\') || rel.startsWith('/')) return null;
  return rel;
}

/** Vrai pour l'adresse d'une variante déjà produite par ce module. */
function isGlBrandVariantUrl(url) {
  const rel = uploadsRelativePathFromUrl(url);
  return Boolean(rel && rel.startsWith(`${GL_BRAND_VARIANT_DIR}/`) && /\.webp$/i.test(rel));
}

function variantRelativePath(sourceRelativePath, buffer, profile) {
  const stem =
    path
      .basename(sourceRelativePath)
      .replace(SOURCE_EXT_RE, '')
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'image';
  const hash = crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 12);
  return `${GL_BRAND_VARIANT_DIR}/${stem}-${hash}-w${profile.maxWidth}.webp`;
}

async function encodeVariant(sharp, buffer, profile) {
  let best = null;
  for (const quality of WEBP_QUALITIES) {
    const { data, info } = await sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({ width: profile.maxWidth, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });
    best = { buffer: data, width: info.width, height: info.height, quality };
    if (data.length <= profile.targetBytes) break;
  }
  return best;
}

function ignored(sourceUrl, reason, extra = {}) {
  return { status: 'ignoree', reason, sourceUrl, url: sourceUrl, ...extra };
}

/**
 * Produit (ou retrouve) la variante WebP d'une image de marque.
 *
 * @param {string} sourceUrl adresse de l'image (`/uploads/…`)
 * @param {{ profile?: 'slot' | 'logo', dryRun?: boolean }} [options]
 * @returns {Promise<{
 *   status: 'creee' | 'existante' | 'a_creer' | 'ignoree',
 *   reason?: string, sourceUrl: string, url: string,
 *   bytesBefore?: number, bytesAfter?: number, width?: number, height?: number,
 * }>} `url` est l'adresse à ranger dans l'emplacement (la variante, ou l'origine si rien
 *   n'a été produit). `a_creer` : mode à blanc, la variante serait écrite.
 */
async function ensureGlBrandVariant(sourceUrl, options = {}) {
  const url = String(sourceUrl || '').trim();
  const profile = GL_BRAND_VARIANT_PROFILES[options.profile] || GL_BRAND_VARIANT_PROFILES.slot;
  const dryRun = options.dryRun === true;
  if (!url) return ignored(url, 'vide');
  const rel = uploadsRelativePathFromUrl(url);
  if (!rel) return ignored(url, 'hors_uploads');
  if (isGlBrandVariantUrl(url)) return ignored(url, 'deja_variante');
  if (!SOURCE_EXT_RE.test(rel)) return ignored(url, 'format_non_pris_en_charge');
  try {
    const absIn = getAbsolutePath(rel);
    if (!fs.existsSync(absIn)) return ignored(url, 'fichier_introuvable');
    const sharp = getSharp();
    if (!sharp) return ignored(url, 'sharp_absent');
    const buffer = await fs.promises.readFile(absIn);
    const meta = await sharp(buffer, { failOn: 'none' }).metadata();
    const bytesBefore = buffer.length;
    if (bytesBefore <= profile.targetBytes && Number(meta.width) <= profile.maxWidth) {
      return ignored(url, 'deja_legere', { bytesBefore, width: meta.width, height: meta.height });
    }
    const variantRel = variantRelativePath(rel, buffer, profile);
    const variantUrl = `/uploads/${variantRel}`;
    const absOut = getAbsolutePath(variantRel);
    if (fs.existsSync(absOut)) {
      const stat = await fs.promises.stat(absOut);
      return {
        status: 'existante',
        sourceUrl: url,
        url: variantUrl,
        bytesBefore,
        bytesAfter: stat.size,
      };
    }
    const variant = await encodeVariant(sharp, buffer, profile);
    const sizes = {
      bytesBefore,
      bytesAfter: variant.buffer.length,
      width: variant.width,
      height: variant.height,
    };
    if (variant.buffer.length >= bytesBefore) return ignored(url, 'sans_gain', sizes);
    if (dryRun) return { status: 'a_creer', sourceUrl: url, url: variantUrl, ...sizes };
    ensureDir(path.dirname(absOut));
    // Fichier temporaire puis `rename` : jamais de variante à moitié écrite derrière une
    // adresse déjà rangée dans le réglage.
    const tmp = `${absOut}.${process.pid}.tmp`;
    await fs.promises.writeFile(tmp, variant.buffer);
    await fs.promises.rename(tmp, absOut);
    return { status: 'creee', sourceUrl: url, url: variantUrl, ...sizes };
  } catch (err) {
    logger.warn({ err, sourceUrl: url }, 'Variante d’image de marque en échec');
    return ignored(url, 'erreur', { error: err?.message || String(err) });
  }
}

/**
 * Passe les images d'une marque (`platform.brand`, objet brut du réglage) par
 * `ensureGlBrandVariant`. L'objet reçu n'est pas modifié ; seuls `slots.<id>.imageUrl` et
 * `logoUrl` changent dans la copie rendue, tout le reste est recopié tel quel.
 *
 * @param {object} rawBrand
 * @param {{ dryRun?: boolean }} [options]
 * @returns {Promise<{ brand: object, changed: boolean, items: Array<object> }>}
 */
async function optimizeGlBrandImages(rawBrand, options = {}) {
  const source =
    rawBrand && typeof rawBrand === 'object' && !Array.isArray(rawBrand) ? rawBrand : {};
  const dryRun = options.dryRun === true;
  const brand = { ...source };
  const items = [];
  let changed = false;

  const slots = source.slots && typeof source.slots === 'object' ? source.slots : null;
  if (slots) {
    brand.slots = { ...slots };
    for (const slotId of GL_BRAND_IMAGE_SLOT_IDS) {
      const slot = slots[slotId];
      if (!slot || typeof slot !== 'object') continue;
      const result = await ensureGlBrandVariant(slot.imageUrl, { profile: 'slot', dryRun });
      items.push({ field: `slots.${slotId}.imageUrl`, ...result });
      if (result.url && result.url !== String(slot.imageUrl || '').trim()) {
        brand.slots[slotId] = { ...slot, imageUrl: result.url };
        changed = true;
      }
    }
  }

  const logo = await ensureGlBrandVariant(source.logoUrl, { profile: 'logo', dryRun });
  items.push({ field: 'logoUrl', ...logo });
  if (logo.url && logo.url !== String(source.logoUrl || '').trim()) {
    brand.logoUrl = logo.url;
    changed = true;
  }

  return { brand, changed, items };
}

module.exports = {
  GL_BRAND_VARIANT_DIR,
  GL_BRAND_VARIANT_PROFILES,
  GL_BRAND_IMAGE_SLOT_IDS,
  uploadsRelativePathFromUrl,
  isGlBrandVariantUrl,
  ensureGlBrandVariant,
  optimizeGlBrandImages,
};
