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
 *
 * **Ce que le retrait coûte** : un ré-encodage. Pour un JPEG il est légèrement destructeur
 * (qualité 90, mozjpeg) ; pour un PNG il ne l'est pas. C'est le prix admis d'un scrubbing
 * fiable, et il s'accompagne d'un gain : `.rotate()` applique l'orientation EXIF **avant** de
 * la jeter, donc une photo prise de côté cesse d'arriver couchée — ce que faisait déjà la
 * vignette, et que l'original ne faisait pas.
 *
 * **Ce qui n'est pas traité, volontairement** :
 * - les **images animées** (GIF, WebP/PNG animés) : les ré-encoder risque de les aplatir sur
 *   leur première image, et aucun appareil photo ne produit d'animation géolocalisée ;
 * - le **SVG** : `sharp` le rastériserait, ce qui détruirait le fichier. Il est par ailleurs
 *   déjà neutralisé au service (`Content-Disposition: attachment` + CSP `sandbox`, `server.js`) ;
 * - tout ce que `sharp` ne sait pas lire (JSON, archives…) : rendu tel quel.
 */

const logger = require('./logger');

// Chargé à la première image, comme `lib/imageThumb.js` : ~+23 Mo de RSS au boot sinon.
// Optionnel — un hébergeur sans binaires `sharp` garde une application fonctionnelle. Mais
// l'échec est journalisé en **warn** et non en debug : sans `sharp`, les métadonnées ne sont
// plus retirées, et c'est une information d'exploitation, pas un détail.
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
      'Module sharp indisponible : métadonnées EXIF NON retirées des images téléversées',
    );
  }
  return sharpLazy;
}

/** Formats jamais retraités (voir l'en-tête). */
const SKIPPED_FORMATS = Object.freeze(['svg', 'gif']);

/**
 * Qualité de ré-encodage par format. Le JPEG est le seul cas réellement destructeur : 90 en
 * mozjpeg reste au-dessus de ce que produisent les appareils grand public, et au-dessus de la
 * vignette du dépôt (82).
 */
function encodeForFormat(pipeline, format) {
  if (format === 'jpeg') return pipeline.jpeg({ quality: 90, mozjpeg: true });
  if (format === 'png') return pipeline.png({ compressionLevel: 9 });
  if (format === 'webp') return pipeline.webp({ quality: 92 });
  // tiff / heif / avif… : `sharp` conserve le format d'entrée et laisse tomber les
  // métadonnées. Si l'encodeur manque à la compilation de libvips, l'appel lève et
  // `stripImageMetadata` rend l'original — jamais un fichier cassé.
  return pipeline;
}

/**
 * Image débarrassée de ses métadonnées (EXIF, GPS, IPTC, XMP), orientation appliquée.
 *
 * Ne lève **jamais** : un buffer qui n'est pas une image traitable est rendu tel quel. Un
 * téléversement ne doit pas échouer parce que le scrubbing n'a pas su faire — il doit
 * échouer sur ses propres règles (taille, type, droits), pas sur celle-ci.
 *
 * @param {Buffer} buffer contenu du fichier.
 * @param {{ relativePath?: string }} [context] chemin, pour la journalisation seulement.
 * @returns {Promise<Buffer>} le buffer nettoyé, ou l'original si rien n'a pu être fait.
 */
async function stripImageMetadata(buffer, { relativePath = '' } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return buffer;
  const sharp = getSharp();
  if (!sharp) return buffer;

  let metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch (_) {
    // Pas une image que `sharp` sache lire (JSON, archive, fichier tronqué…).
    return buffer;
  }

  const format = String(metadata?.format || '').toLowerCase();
  if (!format || SKIPPED_FORMATS.includes(format)) return buffer;
  // Image animée : `pages` vaut le nombre d'images. La ré-encoder image par image sort du
  // périmètre, et l'aplatir serait une régression visible.
  if (Number(metadata?.pages) > 1) return buffer;

  try {
    // `.rotate()` sans argument : applique l'orientation EXIF puis la jette. `sharp` ne
    // réécrit aucune métadonnée en sortie tant qu'on ne le lui demande pas (`withExif`).
    return await encodeForFormat(sharp(buffer).rotate(), format).toBuffer();
  } catch (err) {
    logger.warn(
      { err, relativePath, format },
      'Retrait des métadonnées en échec : image écrite telle quelle',
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

module.exports = {
  SKIPPED_FORMATS,
  stripImageMetadata,
  describeImageMetadata,
};
