/**
 * Préparation d'un fichier avant envoi à la médiathèque (`POST /api/media-library`).
 *
 * Motivation (bug mobile) : sur Android, le sélecteur de fichiers renvoie très souvent
 * un `File` dont le `type` est **vide** ou `application/octet-stream` (Google Photos,
 * Fichiers, Drive, gestionnaires tiers). `FileReader.readAsDataURL` produit alors une
 * data URL `data:application/octet-stream;base64,…` que le serveur refuse
 * (« Type MIME non autorisé »), alors que le fichier est bien un JPEG. Les photos
 * d'un capteur récent dépassent par ailleurs facilement la limite de corps HTTP une
 * fois encodées en base64 (+33 %), et certains appareils enregistrent en HEIC/HEIF.
 *
 * Ce module normalise le type MIME (alias + extension), décide s'il faut ré-encoder
 * l'image, et produit un message d'erreur explicite en français plutôt qu'un 400/413.
 */

import { fileToDataUrl } from './fileToDataUrl.js';
import { compressImage, fileToPngDataUrl } from './image.js';

/** Types acceptés par le serveur — miroir de `ALLOWED_MEDIA_TYPES` (`lib/mediaLibrary.js`). */
export const SERVER_MEDIA_MIMES = Object.freeze({
  image: Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']),
  audio: Object.freeze(['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4']),
  video: Object.freeze(['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']),
});

/**
 * Plafond côté client : 15 Mo binaires ≈ 20 Mo une fois en base64, sous la limite de
 * corps HTTP du serveur (25 Mo par défaut, `FORETMAP_JSON_BODY_LIMIT`). Aligné sur le
 * plafond historique de `compressImage`.
 */
export const MEDIA_IMPORT_MAX_BYTES = 15 * 1024 * 1024;

/** Au-delà, une image est ré-encodée (sinon la base64 fait exploser la requête). */
export const IMAGE_TRANSCODE_THRESHOLD_BYTES = 4 * 1024 * 1024;
export const IMAGE_TRANSCODE_MAX_PX = 2400;
export const IMAGE_TRANSCODE_QUALITY = 0.85;

/** Types « je ne sais pas » renvoyés par les sélecteurs mobiles. */
const GENERIC_MIMES = new Set([
  '',
  '*/*',
  'application/octet-stream',
  'binary/octet-stream',
  'application/download',
  'application/unknown',
]);

const MIME_ALIASES = new Map([
  ['image/jpg', 'image/jpeg'],
  ['image/pjpeg', 'image/jpeg'],
  ['image/x-png', 'image/png'],
  ['image/svg', 'image/svg+xml'],
  ['audio/mp3', 'audio/mpeg'],
  ['audio/x-mpeg', 'audio/mpeg'],
  ['audio/m4a', 'audio/mp4'],
  ['audio/x-m4a', 'audio/mp4'],
  ['audio/x-wav', 'audio/wav'],
  ['audio/wave', 'audio/wav'],
  ['audio/vnd.wave', 'audio/wav'],
  ['video/mpeg4', 'video/mp4'],
  ['video/x-quicktime', 'video/quicktime'],
]);

/** Extension → MIME. Inclut des formats *non* acceptés par le serveur (HEIC…) pour pouvoir les nommer. */
const MIME_BY_EXT = new Map([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
  ['gif', 'image/gif'],
  ['svg', 'image/svg+xml'],
  ['heic', 'image/heic'],
  ['heif', 'image/heif'],
  ['avif', 'image/avif'],
  ['bmp', 'image/bmp'],
  ['tif', 'image/tiff'],
  ['tiff', 'image/tiff'],
  ['mp3', 'audio/mpeg'],
  ['wav', 'audio/wav'],
  ['ogg', 'audio/ogg'],
  ['oga', 'audio/ogg'],
  ['opus', 'audio/ogg'],
  ['m4a', 'audio/mp4'],
  ['aac', 'audio/aac'],
  ['mp4', 'video/mp4'],
  ['m4v', 'video/mp4'],
  ['webm', 'video/webm'],
  ['ogv', 'video/ogg'],
  ['mov', 'video/quicktime'],
  ['3gp', 'video/3gpp'],
  ['mkv', 'video/x-matroska'],
]);

/** Images qu'aucun navigateur mobile ne sait décoder de façon fiable dans un `<canvas>`. */
const HARD_IMAGE_FORMATS = new Set(['image/heic', 'image/heif', 'image/avif', 'image/tiff']);

function extensionOf(fileName) {
  const base = String(fileName || '')
    .trim()
    .toLowerCase();
  const dot = base.lastIndexOf('.');
  if (dot < 0) return '';
  return base.slice(dot + 1);
}

/**
 * Type MIME canonique d'un fichier : `file.type` nettoyé (paramètres, alias), avec
 * repli sur l'extension du nom quand le sélecteur n'a rien renvoyé d'exploitable.
 * @returns {string} MIME canonique, ou `''` si indéterminable.
 */
export function normalizeMediaMimeType(rawType, fileName = '') {
  const raw = String(rawType || '')
    .trim()
    .toLowerCase()
    .split(';')[0]
    .trim();
  const aliased = MIME_ALIASES.get(raw) || raw;
  if (aliased && !GENERIC_MIMES.has(aliased)) return aliased;
  return MIME_BY_EXT.get(extensionOf(fileName)) || '';
}

/** @returns {'image'|'audio'|'video'|null} */
export function detectMediaKind(mimeType) {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return null;
}

export function isServerSupportedMediaMime(mimeType) {
  const mime = String(mimeType || '').toLowerCase();
  return Object.values(SERVER_MEDIA_MIMES).some((list) => list.includes(mime));
}

export function formatMediaSize(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} Mo`;
  return `${Math.max(1, Math.round(value / 1024))} Ko`;
}

/**
 * Réécrit l'en-tête d'une data URL base64 avec le type MIME résolu.
 * Indispensable sur Android : `readAsDataURL` recopie le `type` vide du `File`.
 */
export function retagDataUrlMimeType(dataUrl, mimeType) {
  const text = String(dataUrl || '');
  const mime = String(mimeType || '')
    .trim()
    .toLowerCase();
  if (!mime) return text;
  const match = text.match(/^data:([^,]*),/);
  if (!match) return text;
  const params = match[1] || '';
  if (!/(^|;)base64$/.test(params)) return text;
  const current = params.split(';')[0].toLowerCase();
  if (current === mime) return text;
  return `data:${mime};base64,${text.slice(text.indexOf(',') + 1)}`;
}

/**
 * Décide comment envoyer un fichier : tel quel, ré-encodé en JPEG, ou refusé.
 * Fonction pure (testable sans DOM) : la lecture du fichier reste dans `prepareMediaImport`.
 *
 * @param {File|Blob} file
 * @returns {{ok: true, action: 'raw'|'transcode', kind: string, mimeType: string, uncertain?: boolean}
 *          |{ok: false, error: string}}
 */
export function planMediaImport(file) {
  if (!file || !Number(file.size)) {
    return { ok: false, error: 'Fichier vide ou illisible — réessaie depuis la galerie.' };
  }
  const name = String(file.name || '').trim();
  const label = name || 'fichier';
  const mimeType = normalizeMediaMimeType(file.type, name);
  const kind = detectMediaKind(mimeType);
  const tooLarge = file.size > MEDIA_IMPORT_MAX_BYTES;
  const sizeError = `« ${label} » pèse ${formatMediaSize(file.size)} : maximum ${formatMediaSize(
    MEDIA_IMPORT_MAX_BYTES,
  )} par média.`;

  // Type indéterminé (cas Android le plus fréquent) : on tente un décodage image,
  // qui tranchera. `prepareMediaImport` produit un message clair en cas d'échec.
  if (!kind) {
    if (tooLarge) return { ok: false, error: sizeError };
    return { ok: true, action: 'transcode', kind: 'image', mimeType: '', uncertain: true };
  }

  if (kind !== 'image') {
    if (!isServerSupportedMediaMime(mimeType)) {
      return {
        ok: false,
        error:
          `Format ${kind === 'audio' ? 'audio' : 'vidéo'} non pris en charge (${mimeType}) : ` +
          `${SERVER_MEDIA_MIMES[kind].join(', ')}.`,
      };
    }
    if (tooLarge) return { ok: false, error: sizeError };
    return { ok: true, action: 'raw', kind, mimeType };
  }

  // SVG (vectoriel) et GIF (animation) ne survivraient pas à un passage par canvas.
  if (mimeType === 'image/svg+xml' || mimeType === 'image/gif') {
    if (tooLarge) return { ok: false, error: sizeError };
    return { ok: true, action: 'raw', kind, mimeType };
  }

  if (tooLarge) return { ok: false, error: sizeError };
  if (!isServerSupportedMediaMime(mimeType))
    return { ok: true, action: 'transcode', kind, mimeType };
  if (file.size > IMAGE_TRANSCODE_THRESHOLD_BYTES) {
    return { ok: true, action: 'transcode', kind, mimeType };
  }
  return { ok: true, action: 'raw', kind, mimeType };
}

function base64PrefixBytes(dataUrl, wantedBytes = 24) {
  const text = String(dataUrl || '');
  const marker = text.indexOf(';base64,');
  if (marker < 0) return null;
  const chunk = text
    .slice(marker + 8, marker + 8 + Math.ceil(wantedBytes / 3) * 4 + 4)
    .replace(/[^A-Za-z0-9+/]/g, '');
  const usable = chunk.slice(0, Math.floor(chunk.length / 4) * 4);
  if (!usable) return null;
  try {
    const binary = atob(usable);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch (_) {
    return null;
  }
}

function ascii(bytes, from, to) {
  let out = '';
  for (let i = from; i < to && i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

/**
 * Devine le type d'un média à partir des premiers octets de sa data URL.
 * Pendant client de `detectMimeFromBuffer` (`lib/mediaLibrary.js`) : c'est le seul moyen
 * fiable d'identifier un fichier dont le sélecteur Android n'a pas renseigné le `type`.
 * @returns {string} MIME reconnu, ou `''`.
 */
export function sniffMediaMimeFromDataUrl(dataUrl) {
  const bytes = base64PrefixBytes(dataUrl, 24);
  if (!bytes || bytes.length < 4) return '';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (ascii(bytes, 0, 3) === 'GIF') return 'image/gif';
  if (ascii(bytes, 0, 4) === 'RIFF' && bytes.length >= 12) {
    const container = ascii(bytes, 8, 12);
    if (container === 'WEBP') return 'image/webp';
    if (container === 'WAVE') return 'audio/wav';
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12).trim().toUpperCase();
    if (brand === 'QT') return 'video/quicktime';
    if (brand.startsWith('M4A')) return 'audio/mp4';
    if (brand === 'HEIC' || brand === 'HEIX' || brand === 'HEIF' || brand === 'MIF1')
      return 'image/heic';
    return 'video/mp4';
  }
  if (ascii(bytes, 0, 4) === 'OggS') return 'audio/ogg';
  if (ascii(bytes, 0, 3) === 'ID3') return 'audio/mpeg';
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'audio/mpeg';
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3)
    return 'video/webm';
  const head = ascii(bytes, 0, 5).toLowerCase();
  if (head === '<svg ' || head.startsWith('<?xml')) return 'image/svg+xml';
  return '';
}

/** Message d'échec de décodage : nomme le format quand il est connu pour être hostile. */
export function describeImageDecodeFailure(mimeType, fileName = '') {
  const label = String(fileName || '').trim() || 'ce fichier';
  const mime = String(mimeType || '').toLowerCase();
  if (HARD_IMAGE_FORMATS.has(mime)) {
    const shortName = mime.replace('image/', '').toUpperCase();
    return (
      `« ${label} » est au format ${shortName}, que le navigateur ne sait pas convertir. ` +
      'Sur Android : Appareil photo → Réglages → Format des photos → JPEG (ou « Compatibilité maximale »), ' +
      'puis réimporte la photo.'
    );
  }
  return `« ${label} » n’a pas pu être lu comme image, audio ou vidéo (format non pris en charge).`;
}

/** Le ré-encodage d'un PNG/WebP passe par PNG : un JPEG aplatirait la transparence. */
function transcodeKeepsAlpha(mimeType) {
  const mime = String(mimeType || '').toLowerCase();
  return mime === 'image/png' || mime === 'image/webp';
}

/** Faut-il alléger cette image avant l'envoi ? (jamais SVG ni GIF : vectoriel / animation) */
function imageNeedsShrink(mimeType, size) {
  const mime = String(mimeType || '').toLowerCase();
  if (detectMediaKind(mime) !== 'image') return false;
  if (mime === 'image/svg+xml' || mime === 'image/gif') return false;
  return Number(size) > IMAGE_TRANSCODE_THRESHOLD_BYTES;
}

async function transcodeImage(file, sourceMime, originalName, options) {
  const maxPx = Number(options.maxPx) || IMAGE_TRANSCODE_MAX_PX;
  const quality = Number(options.quality) || IMAGE_TRANSCODE_QUALITY;
  const keepAlpha = transcodeKeepsAlpha(sourceMime);
  let dataUrl = '';
  try {
    dataUrl = keepAlpha
      ? await fileToPngDataUrl(file, maxPx)
      : await compressImage(file, maxPx, quality);
  } catch (_) {
    throw new Error(describeImageDecodeFailure(sourceMime, originalName));
  }
  if (!String(dataUrl).startsWith('data:image/')) {
    throw new Error(describeImageDecodeFailure(sourceMime, originalName));
  }
  return {
    dataUrl,
    originalName,
    mimeType: keepAlpha ? 'image/png' : 'image/jpeg',
    transcoded: true,
  };
}

/**
 * Lit un fichier et renvoie la data URL prête pour l'API médiathèque.
 *
 * @param {File} file
 * @param {{maxPx?: number, quality?: number}} [options]
 * @returns {Promise<{dataUrl: string, originalName: string|null, mimeType: string, transcoded: boolean}>}
 * @throws {Error} message en français, directement affichable.
 */
export async function prepareMediaImport(file, options = {}) {
  const plan = planMediaImport(file);
  if (!plan.ok) throw new Error(plan.error);

  const originalName = String(file?.name || '').trim() || null;

  if (plan.action === 'raw') {
    const dataUrl = await fileToDataUrl(file);
    if (!dataUrl) throw new Error('Lecture du fichier impossible');
    return {
      dataUrl: retagDataUrlMimeType(dataUrl, plan.mimeType),
      originalName,
      mimeType: plan.mimeType,
      transcoded: false,
    };
  }

  // Type non renseigné par le sélecteur : les octets tranchent avant tout ré-encodage,
  // pour ne pas dégrader inutilement une image déjà acceptable.
  if (plan.uncertain) {
    const dataUrl = await fileToDataUrl(file);
    if (!dataUrl) throw new Error('Lecture du fichier impossible');
    const sniffed = sniffMediaMimeFromDataUrl(dataUrl);
    if (isServerSupportedMediaMime(sniffed) && !imageNeedsShrink(sniffed, file.size)) {
      return {
        dataUrl: retagDataUrlMimeType(dataUrl, sniffed),
        originalName,
        mimeType: sniffed,
        transcoded: false,
      };
    }
    return transcodeImage(file, sniffed || plan.mimeType, originalName, options);
  }

  return transcodeImage(file, plan.mimeType, originalName, options);
}
