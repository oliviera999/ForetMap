const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads');

function assertInsideUploads(absolutePath) {
  const resolved = path.resolve(absolutePath);
  const base = UPLOADS_DIR + path.sep;
  if (resolved !== UPLOADS_DIR && !resolved.startsWith(base)) {
    throw new Error('Chemin invalide : accès hors du dossier uploads interdit');
  }
}

function getAbsolutePath(relativePath) {
  const resolved = path.resolve(UPLOADS_DIR, relativePath);
  assertInsideUploads(resolved);
  return resolved;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Taille maximale d'un fichier écrit sous `uploads/` (octets **décodés**).
 *
 * Sans cette borne, la seule limite était celle du corps JSON : une image de 18 Mo était
 * décodée puis écrite d'un bloc. Surcharge : `FORETMAP_MAX_UPLOAD_BYTES`.
 */
function maxUploadBytes() {
  const raw = parseInt(process.env.FORETMAP_MAX_UPLOAD_BYTES, 10);
  if (Number.isFinite(raw) && raw >= 64 * 1024) return raw;
  return 8 * 1024 * 1024;
}

/** Erreur porteuse d'un message utilisateur (les routes la relaient en 400). */
function assertUploadSize(byteLength) {
  const max = maxUploadBytes();
  if (byteLength > max) {
    const mb = Math.round((max / 1024 / 1024) * 10) / 10;
    const err = new Error(`Fichier trop volumineux (maximum ${mb} Mo après décodage)`);
    err.code = 'UPLOAD_TOO_LARGE';
    throw err;
  }
}

/**
 * Enregistre un contenu base64 (data URL ou raw base64) dans un fichier sous uploads/.
 *
 * **Asynchrone** : l'écriture passait par `fs.writeFileSync`, qui bloque la boucle
 * d'événements — donc tout le serveur, y compris `/api/health` et les pings Socket.IO —
 * le temps d'écrire plusieurs mégaoctets sur le disque partagé d'un mutualisé.
 * @param {string} relativePath - Chemin relatif sous uploads/ (ex: zones/zone-id/123.jpg)
 * @param {string} base64Data - Chaîne base64 ou data URL (data:image/jpeg;base64,...)
 */
async function saveBase64ToDisk(relativePath, base64Data) {
  const absolutePath = path.resolve(UPLOADS_DIR, relativePath);
  assertInsideUploads(absolutePath);
  ensureDir(path.dirname(absolutePath));
  const raw = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  const buf = Buffer.from(raw, 'base64');
  assertUploadSize(buf.length);
  await fs.promises.writeFile(absolutePath, buf);
}

/** Écrit un buffer binaire sous uploads/ (chemin relatif, ex. tasks/uuid.jpg). */
async function writeBufferToDisk(relativePath, buffer) {
  const absolutePath = path.resolve(UPLOADS_DIR, relativePath);
  assertInsideUploads(absolutePath);
  ensureDir(path.dirname(absolutePath));
  assertUploadSize(buffer?.length || 0);
  await fs.promises.writeFile(absolutePath, buffer);
}

function deleteFile(relativePath) {
  try {
    const absolutePath = getAbsolutePath(relativePath);
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }
  } catch (e) {
    logger.warn({ err: e }, 'Suppression fichier upload en échec');
  }
}

module.exports = {
  UPLOADS_DIR,
  maxUploadBytes,
  assertUploadSize,
  getAbsolutePath,
  ensureDir,
  saveBase64ToDisk,
  writeBufferToDisk,
  deleteFile,
};
