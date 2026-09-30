'use strict';

/**
 * Retrait des métadonnées des images téléversées — lot F du plan de correction de
 * `docs/AUDIT_SECURITE_2026-09-22.md` §7 (constat **S7**).
 *
 * Le constat : une recherche de `exif` sur tout le dépôt ne rendait **aucune** occurrence.
 * Les originaux étaient écrits octet pour octet (`lib/uploads.js`), et seule la *vignette*
 * passait par `sharp` — qui, lui, supprime les métadonnées en sortie. Les familles `zones/`,
 * `markers/`, `students/` et `tasks/` étant servies publiquement sous `/uploads`, une photo
 * prise au téléphone conservait ses **coordonnées GPS**, son horodatage et son modèle
 * d'appareil, téléchargeables sans authentification. Sur un établissement où les photos sont
 * prises par des élèves mineurs sur le terrain, c'est le constat P1 le plus concret.
 *
 * Le retrait est posé sur les **deux points de passage** de l'écriture (`saveBase64ToDisk` et
 * `writeBufferToDisk`) plutôt que sur chaque appelant : il y en a vingt, et un vingt-et-unième
 * ajouté demain n'aurait aucune raison d'y penser. C'est la même logique que la garde de
 * surface du lot D — la règle vit au point de passage, pas dans la discipline des appelants.
 * Les packs mascotte G&L (`routes/gl/mascots.js`) et l'envoi à Pl@ntNet
 * (`lib/speciesAutofillPlantnet.js`) passent par la même fonction.
 *
 * **Ce que le retrait coûte** : un ré-encodage. Pour un JPEG il est légèrement destructeur
 * (qualité 90, mozjpeg) ; pour un PNG il ne l'est pas. C'est le prix admis d'un scrubbing
 * fiable, et il s'accompagne d'un gain : `.rotate()` applique l'orientation EXIF **avant** de
 * la jeter, donc une photo prise de côté cesse d'arriver couchée — ce que faisait déjà la
 * vignette, et que l'original ne faisait pas.
 *
 * **Échec FERMÉ** (RG7 de `docs/AUDIT_SECURITE_RGPD_2026-09-30.md`) : jusqu'au 30/09/2026,
 * sans `sharp` ou sur un échec de ré-encodage, l'original était écrit tel quel — GPS compris.
 * Désormais, un contenu qui se présente comme une image matricielle (JPEG, PNG, WebP, GIF,
 * TIFF, HEIF/AVIF) est **refusé** (`ImageNotSanitizableError`, HTTP 422 « Image illisible ou
 * non nettoyable ») quand :
 *   - `sharp` est indisponible (rien ne peut être vérifié) ;
 *   - `sharp` ne sait pas le lire (fichier tronqué, corrompu) ;
 *   - il porte des métadonnées (EXIF, IPTC, XMP, commentaires) et le ré-encodage échoue.
 * Une image **sans** métadonnées que l'encodeur ne sait pas réécrire (un PNG aux sommes de
 * contrôle fantaisistes, par exemple) reste acceptée telle quelle : il n'y a rien à retirer.
 *
 * **Images animées** (GIF, WebP animé) : réécrites image par image (`animated: true`)
 * **seulement si** elles portent des métadonnées — toutes les images sont conservées. Une
 * animation propre ressort intacte : la ré-encoder dégraderait sa palette sans rien gagner.
 *
 * **Ce qui n'est pas traité, volontairement** :
 * - le **SVG** : `sharp` le rastériserait, ce qui détruirait le fichier. Il est par ailleurs
 *   déjà neutralisé au service (`Content-Disposition: attachment` + CSP `sandbox`, `server.js`) ;
 * - les **vidéos et l'audio** de la médiathèque : aucun outil de nettoyage (ffmpeg) n'est
 *   embarqué — limite documentée dans `docs/reference/foretmap/stats-forum-et-suivi.md`
 *   (section « L'audit et la médiathèque ») ;
 * - tout ce qui n'est pas une image (JSON, archives…) : rendu tel quel.
 */

const logger = require('./logger');

// Chargé à la première image, comme `lib/imageThumb.js` : ~+23 Mo de RSS au boot sinon.
// Sans binaires `sharp`, l'application démarre mais **refuse** les images (échec fermé) :
// `npm run check:runtime` le signale en erreur.
let sharpLazy = null;
let sharpLoadFailed = false;
function getSharp() {
  if (sharpLazy) return sharpLazy;
  if (sharpLoadFailed) return null;
  try {
    sharpLazy = require('sharp');
  } catch (err) {
    sharpLoadFailed = true;
    logger.warn(
      { err },
      'Module sharp indisponible : les images téléversées seront REFUSÉES (métadonnées non retirables)',
    );
  }
  return sharpLazy;
}

/** Formats jamais retraités (voir l'en-tête). */
const SKIPPED_FORMATS = Object.freeze(['svg']);

/** Formats animés que `sharp` sait réécrire image par image. */
const ANIMATED_FORMATS = Object.freeze(['gif', 'webp']);

/** Message métier renvoyé au client (HTTP 422). */
const IMAGE_NOT_SANITIZABLE_MESSAGE = 'Image illisible ou non nettoyable';

/**
 * Refus d'une image que l'on ne peut pas garantir débarrassée de ses métadonnées. Porte
 * `status = 422` et `expose = true` : le gestionnaire d'erreurs central (`server.js`) relaie
 * le message tel quel, comme les routes qui lisent `err.status`.
 */
class ImageNotSanitizableError extends Error {
  constructor(reason, { cause } = {}) {
    super(IMAGE_NOT_SANITIZABLE_MESSAGE);
    this.name = 'ImageNotSanitizableError';
    this.code = 'IMAGE_NOT_SANITIZABLE';
    this.status = 422;
    this.statusCode = 422;
    this.expose = true;
    this.reason = reason;
    if (cause) this.cause = cause;
  }
}

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);
const AVIF_BRANDS = new Set(['avif', 'avis']);

/**
 * Format matriciel reconnu à sa signature binaire, ou `null`. Seul un contenu qui **se
 * présente** comme une image est soumis à l'échec fermé.
 * @param {Buffer} buf
 * @returns {'jpeg'|'png'|'gif'|'webp'|'tiff'|'heif'|null}
 */
function detectRasterFormat(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  if (
    (buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00) ||
    (buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a)
  ) {
    return 'tiff';
  }
  if (buf.length < 12) return null;
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp';
  }
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (HEIF_BRANDS.has(brand) || AVIF_BRANDS.has(brand)) return 'heif';
  }
  return null;
}

/** Vrai si `sharp` a relevé une métadonnée identifiante (EXIF, IPTC, XMP, commentaire). */
function carriesMetadata(metadata) {
  if (!metadata) return false;
  if (metadata.exif || metadata.iptc || metadata.xmp || metadata.tifftagPhotoshop) return true;
  return Array.isArray(metadata.comments) && metadata.comments.length > 0;
}

/**
 * Qualité de ré-encodage par format. Le JPEG est le seul cas réellement destructeur : 90 en
 * mozjpeg reste au-dessus de ce que produisent les appareils grand public, et au-dessus de la
 * vignette du dépôt (82).
 */
function encodeForFormat(pipeline, format) {
  if (format === 'jpeg') return pipeline.jpeg({ quality: 90, mozjpeg: true });
  if (format === 'png') return pipeline.png({ compressionLevel: 9 });
  if (format === 'webp') return pipeline.webp({ quality: 92 });
  if (format === 'gif') return pipeline.gif();
  // tiff / heif / avif… : `sharp` conserve le format d'entrée et laisse tomber les
  // métadonnées. Si l'encodeur manque à la compilation de libvips, l'appel lève : l'image est
  // alors refusée si elle porte des métadonnées, rendue telle quelle sinon.
  return pipeline;
}

/**
 * Image débarrassée de ses métadonnées (EXIF, GPS, IPTC, XMP), orientation appliquée.
 *
 * Un contenu qui n'est pas une image est rendu tel quel. Une image que l'on ne peut pas
 * garantir propre **lève** `ImageNotSanitizableError` (échec fermé, voir l'en-tête).
 *
 * @param {Buffer} buffer contenu du fichier.
 * @param {{ relativePath?: string }} [context] chemin, pour la journalisation seulement.
 * @returns {Promise<Buffer>} le buffer nettoyé, ou l'original s'il n'y avait rien à retirer.
 * @throws {ImageNotSanitizableError}
 */
async function stripImageMetadata(buffer, { relativePath = '' } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return buffer;
  const raster = detectRasterFormat(buffer);
  const sharp = getSharp();
  if (!sharp) {
    if (!raster) return buffer;
    logger.warn({ relativePath, format: raster }, 'Image refusée : module sharp indisponible');
    throw new ImageNotSanitizableError('sharp_unavailable');
  }

  let metadata;
  try {
    metadata = await sharp(buffer, { animated: true }).metadata();
  } catch (err) {
    // Pas une image que `sharp` sache lire. Si le contenu se présente comme une photo, ce
    // qu'il transporte ne peut pas être vérifié : refus. Sinon (JSON, archive…), tel quel.
    if (!raster) return buffer;
    logger.warn({ err, relativePath, format: raster }, 'Image refusée : illisible par sharp');
    throw new ImageNotSanitizableError('unreadable', { cause: err });
  }

  const format = String(metadata?.format || '').toLowerCase();
  if (!format || SKIPPED_FORMATS.includes(format)) return buffer;
  const hasMetadata = carriesMetadata(metadata);
  const animated = Number(metadata?.pages) > 1;

  try {
    if (animated || format === 'gif') {
      // Animation (ou GIF) propre : rien à retirer, la ré-encoder dégraderait la palette.
      if (!hasMetadata) return buffer;
      const pipeline = sharp(buffer, { animated: true });
      const encoded = ANIMATED_FORMATS.includes(format)
        ? encodeForFormat(pipeline, format)
        : pipeline;
      return await encoded.toBuffer();
    }
    // `.rotate()` sans argument : applique l'orientation EXIF puis la jette. `sharp` ne
    // réécrit aucune métadonnée en sortie tant qu'on ne le lui demande pas (`withExif`).
    return await encodeForFormat(sharp(buffer).rotate(), format).toBuffer();
  } catch (err) {
    if (hasMetadata) {
      logger.warn(
        { err, relativePath, format },
        'Image refusée : métadonnées présentes et ré-encodage en échec',
      );
      throw new ImageNotSanitizableError('reencode_failed', { cause: err });
    }
    logger.warn(
      { err, relativePath, format },
      'Ré-encodage en échec sur une image sans métadonnées : écrite telle quelle',
    );
    return buffer;
  }
}

/**
 * Métadonnées résiduelles d'un buffer — utilitaire de vérification (tests, script de
 * nettoyage). `null` si le buffer n'est pas une image lisible.
 * @returns {Promise<{ format: string, hasExif: boolean, hasIptc: boolean, hasXmp: boolean } | null>}
 */
async function describeImageMetadata(buffer) {
  const sharp = getSharp();
  if (!sharp || !Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  try {
    const meta = await sharp(buffer).metadata();
    return {
      format: String(meta?.format || ''),
      hasExif: !!meta?.exif,
      hasIptc: !!meta?.iptc,
      hasXmp: !!meta?.xmp,
    };
  } catch (_) {
    return null;
  }
}

/** Vrai si `sharp` se charge (diagnostic `npm run check:runtime`). */
function isSharpAvailable() {
  return !!getSharp();
}

/** Tests seulement : simule l'absence de `sharp` (`true`) ou la rétablit (`false`). */
function __setSharpUnavailableForTests(unavailable) {
  if (unavailable) {
    sharpLazy = null;
    sharpLoadFailed = true;
  } else {
    sharpLoadFailed = false;
  }
}

module.exports = {
  SKIPPED_FORMATS,
  ANIMATED_FORMATS,
  IMAGE_NOT_SANITIZABLE_MESSAGE,
  ImageNotSanitizableError,
  detectRasterFormat,
  carriesMetadata,
  stripImageMetadata,
  describeImageMetadata,
  isSharpAvailable,
  __setSharpUnavailableForTests,
};
