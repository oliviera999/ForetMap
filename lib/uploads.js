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
 * Enregistre un contenu base64 (data URL ou raw base64) dans un fichier sous uploads/.
 * @param {string} relativePath - Chemin relatif sous uploads/ (ex: zones/zone-id/123.jpg)
 * @param {string} base64Data - Chaîne base64 ou data URL (data:image/jpeg;base64,...)
 */
function saveBase64ToDisk(relativePath, base64Data) {
  const absolutePath = path.resolve(UPLOADS_DIR, relativePath);
  assertInsideUploads(absolutePath);
  ensureDir(path.dirname(absolutePath));
  const raw = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  const buf = Buffer.from(raw, 'base64');
  fs.writeFileSync(absolutePath, buf);
}

/** Écrit un buffer binaire sous uploads/ (chemin relatif, ex. tasks/uuid.jpg). */
function writeBufferToDisk(relativePath, buffer) {
  const absolutePath = path.resolve(UPLOADS_DIR, relativePath);
  assertInsideUploads(absolutePath);
  ensureDir(path.dirname(absolutePath));
  fs.writeFileSync(absolutePath, buffer);
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

module.exports = { UPLOADS_DIR, getAbsolutePath, ensureDir, saveBase64ToDisk, writeBufferToDisk, deleteFile };
