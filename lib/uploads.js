const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

function getAbsolutePath(relativePath) {
  const resolved = path.join(UPLOADS_DIR, relativePath);
  if (!resolved.startsWith(path.resolve(UPLOADS_DIR))) {
    throw new Error('Chemin invalide');
  }
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
  const absolutePath = path.join(UPLOADS_DIR, relativePath);
  ensureDir(path.dirname(absolutePath));
  const raw = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  const buf = Buffer.from(raw, 'base64');
  fs.writeFileSync(absolutePath, buf);
}

function deleteFile(relativePath) {
  try {
    const absolutePath = getAbsolutePath(relativePath);
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }
  } catch (e) {
    console.warn('Suppression fichier upload:', e.message);
  }
}

module.exports = { UPLOADS_DIR, getAbsolutePath, ensureDir, saveBase64ToDisk, deleteFile };
