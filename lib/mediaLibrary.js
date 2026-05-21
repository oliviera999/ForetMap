const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { UPLOADS_DIR, ensureDir, deleteFile } = require('./uploads');

const MEDIA_LIBRARY_ROOT = 'media-library';
const MEDIA_LIBRARY_DIR = path.resolve(UPLOADS_DIR, MEDIA_LIBRARY_ROOT);

const ALLOWED_MEDIA_TYPES = {
  image: {
    mimes: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']),
    defaultExt: 'jpg',
  },
  audio: {
    mimes: new Set(['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4']),
    defaultExt: 'mp3',
  },
  video: {
    mimes: new Set(['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']),
    defaultExt: 'mp4',
  },
};

const EXT_BY_MIME = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
  ['image/svg+xml', 'svg'],
  ['audio/mpeg', 'mp3'],
  ['audio/wav', 'wav'],
  ['audio/ogg', 'ogg'],
  ['audio/webm', 'webm'],
  ['audio/mp4', 'm4a'],
  ['video/mp4', 'mp4'],
  ['video/webm', 'webm'],
  ['video/ogg', 'ogv'],
  ['video/quicktime', 'mov'],
]);

function normalizeOptionalString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function parseDataUrl(input) {
  const raw = String(input || '');
  const match = raw.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: String(match[1] || '').toLowerCase(), base64: match[2] || '' };
}

function detectMediaType(mimeType) {
  const mime = String(mimeType || '').toLowerCase();
  for (const [type, conf] of Object.entries(ALLOWED_MEDIA_TYPES)) {
    if (conf.mimes.has(mime)) return type;
  }
  return null;
}

function mediaLibraryRelativePath(mediaType, mimeType) {
  const date = new Date();
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const token = `${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
  const ext = EXT_BY_MIME.get(mimeType) || ALLOWED_MEDIA_TYPES[mediaType].defaultExt;
  return `${MEDIA_LIBRARY_ROOT}/${mediaType}/${yyyy}/${mm}/${token}.${ext}`;
}

function saveMediaFromDataUrl(dataUrl) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    const err = new Error('media_data invalide (data URL base64 attendue)');
    err.status = 400;
    throw err;
  }
  const mediaType = detectMediaType(parsed.mimeType);
  if (!mediaType) {
    const err = new Error('Type MIME non autorisé (images/audio/vidéo)');
    err.status = 400;
    throw err;
  }

  const buffer = Buffer.from(parsed.base64, 'base64');
  if (!buffer || buffer.length === 0) {
    const err = new Error('media_data vide');
    err.status = 400;
    throw err;
  }

  const relativePath = mediaLibraryRelativePath(mediaType, parsed.mimeType);
  const absolutePath = path.resolve(UPLOADS_DIR, relativePath);
  ensureDir(path.dirname(absolutePath));
  fs.writeFileSync(absolutePath, buffer);

  const label = normalizeOptionalString(path.basename(relativePath));
  return {
    mediaType,
    mimeType: parsed.mimeType,
    size: buffer.length,
    relativePath,
    url: `/${relativePath.replace(/\\/g, '/')}`.replace(/^\/+/, '/uploads/'),
    label,
  };
}

function mediaTypeFromRelativePath(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  if (normalized.startsWith(`${MEDIA_LIBRARY_ROOT}/image/`)) return 'image';
  if (normalized.startsWith(`${MEDIA_LIBRARY_ROOT}/audio/`)) return 'audio';
  if (normalized.startsWith(`${MEDIA_LIBRARY_ROOT}/video/`)) return 'video';
  return 'other';
}

function walkFiles(dirPath, out = []) {
  if (!fs.existsSync(dirPath)) return out;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, out);
      continue;
    }
    out.push(fullPath);
  }
  return out;
}

function listMediaLibraryItems(limit = 300) {
  const files = walkFiles(MEDIA_LIBRARY_DIR);
  const items = files.map((filePath) => {
    const stat = fs.statSync(filePath);
    const relFromUploads = path.relative(UPLOADS_DIR, filePath).replace(/\\/g, '/');
    const mediaType = mediaTypeFromRelativePath(relFromUploads);
    return {
      relativePath: relFromUploads,
      url: `/uploads/${relFromUploads}`,
      filename: path.basename(relFromUploads),
      mediaType,
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
    };
  });
  items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return items.slice(0, Math.max(1, Math.min(Number(limit) || 300, 800)));
}

function deleteMediaLibraryItem(relativePath) {
  const rel = String(relativePath || '').replace(/^\/+/, '').replace(/\\/g, '/');
  if (!rel.startsWith(`${MEDIA_LIBRARY_ROOT}/`)) {
    const err = new Error('Chemin média invalide');
    err.status = 400;
    throw err;
  }
  deleteFile(rel);
  return { ok: true };
}

module.exports = {
  saveMediaFromDataUrl,
  listMediaLibraryItems,
  deleteMediaLibraryItem,
};
