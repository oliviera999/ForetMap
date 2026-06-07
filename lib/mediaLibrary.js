const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { UPLOADS_DIR, ensureDir } = require('./uploads');
const {
  deriveMediaStableKey,
  loadMediaKeyIndex,
  registerMediaStableKey,
  resolveMediaByStableKey,
  removeMediaStableKeysForRelativePath,
  isSidecarFileName,
  syncAssetManifests,
  warnAlphaAssetIfNeeded,
} = require('./glAssetManifest');

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

const MIME_BY_EXT = new Map([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
  ['gif', 'image/gif'],
  ['svg', 'image/svg+xml'],
  ['mp3', 'audio/mpeg'],
  ['wav', 'audio/wav'],
  ['ogg', 'audio/ogg'],
  ['webm', 'audio/webm'],
  ['m4a', 'audio/mp4'],
  ['mp4', 'video/mp4'],
  ['ogv', 'video/ogg'],
  ['mov', 'video/quicktime'],
]);

function mediaLibraryError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

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

function extensionFromFileName(fileName) {
  const base = String(fileName || '').trim().toLowerCase();
  const dot = base.lastIndexOf('.');
  if (dot < 0) return '';
  return base.slice(dot + 1);
}

function detectMimeFromBuffer(buffer, fileName = '') {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.alloc(0);
  if (buf.length >= 4) {
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.length >= 12 && buf.slice(8, 12).toString('ascii') === 'WEBP') {
      return 'image/webp';
    }
    if (buf.slice(0, 3).toString('ascii') === 'GIF') return 'image/gif';
    if (buf.slice(0, 4).toString('ascii') === 'ftyp') return 'video/mp4';
    if (buf.slice(0, 4).toString('ascii') === 'OggS') return 'audio/ogg';
    if (buf.slice(0, 3).toString('ascii') === 'ID3') return 'audio/mpeg';
  }
  const ext = extensionFromFileName(fileName);
  return MIME_BY_EXT.get(ext) || null;
}

function resolveMediaBufferMeta(buffer, mimeHint = null, fileName = '') {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw mediaLibraryError('Fichier média vide');
  }
  const mimeType = String(mimeHint || detectMimeFromBuffer(buffer, fileName) || '').toLowerCase();
  const mediaType = detectMediaType(mimeType);
  if (!mediaType) {
    throw mediaLibraryError('Type MIME non autorisé (images/audio/vidéo)');
  }
  return { mimeType, mediaType, size: buffer.length };
}

function buildSavedMediaResponse(meta, relativePath, label, stableKey) {
  return {
    mediaType: meta.mediaType,
    mimeType: meta.mimeType,
    size: meta.size,
    relativePath,
    url: `/${relativePath.replace(/\\/g, '/')}`.replace(/^\/+/, '/uploads/'),
    label,
    stableKey,
  };
}

function registerUploadedMedia(relativePath, originalName, mimeType, options = {}) {
  const stableKey = normalizeOptionalString(options.stableKey)
    || deriveMediaStableKey(originalName);
  const warnings = [];
  const alphaWarn = warnAlphaAssetIfNeeded(originalName, mimeType);
  if (alphaWarn) warnings.push(alphaWarn);
  if (stableKey) {
    registerMediaStableKey(stableKey, relativePath, originalName);
  }
  let manifest = null;
  if (!options.skipManifestSync) {
    manifest = syncAssetManifests();
    if (manifest.warnings?.length) warnings.push(...manifest.warnings);
  }
  return { stableKey, warnings, manifest };
}

function previewMediaFromBuffer(buffer, mimeHint = null, fileName = '') {
  const meta = resolveMediaBufferMeta(buffer, mimeHint, fileName);
  const relativePath = mediaLibraryRelativePath(meta.mediaType, meta.mimeType);
  const label = normalizeOptionalString(path.basename(fileName || relativePath));
  return {
    ...meta,
    relativePath,
    url: `/${relativePath.replace(/\\/g, '/')}`.replace(/^\/+/, '/uploads/'),
    label,
    stableKey: deriveMediaStableKey(fileName),
    dryRun: true,
  };
}

function saveMediaFromBuffer(buffer, mimeHint = null, fileName = '', options = {}) {
  const meta = resolveMediaBufferMeta(buffer, mimeHint, fileName);
  const relativePath = mediaLibraryRelativePath(meta.mediaType, meta.mimeType);
  const absolutePath = path.resolve(UPLOADS_DIR, relativePath);
  ensureDir(path.dirname(absolutePath));
  fs.writeFileSync(absolutePath, buffer);
  const label = normalizeOptionalString(path.basename(fileName || relativePath));
  const registration = registerUploadedMedia(relativePath, fileName || label, meta.mimeType, options);
  return {
    ...buildSavedMediaResponse(meta, relativePath, label, registration.stableKey),
    assetWarnings: registration.warnings,
  };
}

function mediaLibraryRelativePath(mediaType, mimeType) {
  const date = new Date();
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const token = `${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
  const ext = EXT_BY_MIME.get(mimeType) || ALLOWED_MEDIA_TYPES[mediaType].defaultExt;
  return `${MEDIA_LIBRARY_ROOT}/${mediaType}/${yyyy}/${mm}/${token}.${ext}`;
}

function saveMediaFromDataUrl(dataUrl, options = {}) {
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

  const originalName = normalizeOptionalString(options.originalName)
    || normalizeOptionalString(options.original_name)
    || path.basename(relativePath);
  const label = originalName;
  const registration = registerUploadedMedia(relativePath, originalName, parsed.mimeType, options);
  return {
    mediaType,
    mimeType: parsed.mimeType,
    size: buffer.length,
    relativePath,
    url: `/${relativePath.replace(/\\/g, '/')}`.replace(/^\/+/, '/uploads/'),
    label,
    stableKey: registration.stableKey,
    assetWarnings: registration.warnings,
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
    if (isSidecarFileName(entry.name)) continue;
    out.push(fullPath);
  }
  return out;
}

function enrichItemWithStableKey(item, keyIndex) {
  const stableKey = Object.entries(keyIndex).find(([, entry]) => entry.relativePath === item.relativePath)?.[0] || null;
  return {
    ...item,
    stableKey,
    label: stableKey ? (keyIndex[stableKey]?.originalName || item.filename) : item.filename,
  };
}

function listMediaLibraryItems(limit = 300) {
  const keyIndex = loadMediaKeyIndex();
  const files = walkFiles(MEDIA_LIBRARY_DIR);
  const items = files.map((filePath) => {
    const stat = fs.statSync(filePath);
    const relFromUploads = path.relative(UPLOADS_DIR, filePath).replace(/\\/g, '/');
    const mediaType = mediaTypeFromRelativePath(relFromUploads);
    return enrichItemWithStableKey({
      relativePath: relFromUploads,
      url: `/uploads/${relFromUploads}`,
      filename: path.basename(relFromUploads),
      mediaType,
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
    }, keyIndex);
  });
  items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return items.slice(0, Math.max(1, Math.min(Number(limit) || 300, 800)));
}

function listMediaLibraryItemsWithKeys(limit = 300) {
  return listMediaLibraryItems(limit);
}

function resolveMediaLibraryItemPath(relativePath) {
  const rel = String(relativePath || '').replace(/^\/+/, '').replace(/\\/g, '/');
  if (!rel.startsWith(`${MEDIA_LIBRARY_ROOT}/`)) {
    throw mediaLibraryError('Chemin média invalide');
  }
  if (rel.split('/').some((part) => part === '..')) {
    throw mediaLibraryError('Chemin média invalide');
  }

  const absolutePath = path.resolve(UPLOADS_DIR, rel);
  const rootWithSeparator = MEDIA_LIBRARY_DIR + path.sep;
  if (absolutePath !== MEDIA_LIBRARY_DIR && !absolutePath.startsWith(rootWithSeparator)) {
    throw mediaLibraryError('Chemin média invalide');
  }
  return absolutePath;
}

function deleteMediaLibraryItem(relativePath, options = {}) {
  const absolutePath = resolveMediaLibraryItemPath(relativePath);
  if (fs.existsSync(absolutePath)) {
    const stat = fs.statSync(absolutePath);
    if (!stat.isFile()) {
      throw mediaLibraryError('Chemin média invalide');
    }
    fs.unlinkSync(absolutePath);
  }
  removeMediaStableKeysForRelativePath(relativePath);
  if (!options.skipManifestSync) {
    syncAssetManifests();
  }
  return { ok: true };
}

const MAX_BULK_DELETE_COUNT = 800;

function parseMediaLibraryDeleteRequest(body = {}) {
  if (body?.clear_all === true) {
    return { mode: 'clear_all' };
  }
  if (Array.isArray(body?.relative_paths)) {
    const paths = body.relative_paths
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    if (paths.length === 0) throw mediaLibraryError('relative_paths requis');
    if (paths.length > MAX_BULK_DELETE_COUNT) {
      throw mediaLibraryError(`Trop de fichiers à supprimer (max ${MAX_BULK_DELETE_COUNT})`);
    }
    return { mode: 'bulk', paths };
  }
  const relativePath = String(body?.relative_path || '').trim();
  if (!relativePath) throw mediaLibraryError('relative_path requis');
  return { mode: 'single', relativePath };
}

function deleteMediaLibraryItems(relativePaths = [], options = {}) {
  const paths = Array.isArray(relativePaths) ? relativePaths : [];
  const results = [];
  for (const relativePath of paths) {
    const result = { relativePath, ok: false, error: null };
    try {
      deleteMediaLibraryItem(relativePath, { skipManifestSync: true });
      result.ok = true;
    } catch (err) {
      result.error = err.message || 'Suppression impossible';
    }
    results.push(result);
  }
  if (!options.skipManifestSync && results.some((row) => row.ok)) {
    syncAssetManifests();
  }
  return {
    total: results.length,
    deleted: results.filter((row) => row.ok).length,
    failed: results.filter((row) => !row.ok).length,
    results,
  };
}

function clearMediaLibraryItems() {
  const items = listMediaLibraryItems(MAX_BULK_DELETE_COUNT);
  if (items.length === 0) {
    syncAssetManifests();
    return { total: 0, deleted: 0, failed: 0, results: [] };
  }
  return deleteMediaLibraryItems(items.map((item) => item.relativePath));
}

function executeMediaLibraryDeleteRequest(body = {}) {
  const parsed = parseMediaLibraryDeleteRequest(body);
  if (parsed.mode === 'clear_all') {
    return { ok: true, ...clearMediaLibraryItems() };
  }
  if (parsed.mode === 'bulk') {
    return { ok: true, ...deleteMediaLibraryItems(parsed.paths) };
  }
  deleteMediaLibraryItem(parsed.relativePath);
  return {
    ok: true,
    total: 1,
    deleted: 1,
    failed: 0,
    results: [{ relativePath: parsed.relativePath, ok: true, error: null }],
  };
}

module.exports = {
  saveMediaFromDataUrl,
  saveMediaFromBuffer,
  previewMediaFromBuffer,
  detectMimeFromBuffer,
  detectMediaType,
  deriveMediaStableKey,
  loadMediaKeyIndex,
  resolveMediaByStableKey,
  syncAssetManifests,
  listMediaLibraryItems,
  listMediaLibraryItemsWithKeys,
  deleteMediaLibraryItem,
  deleteMediaLibraryItems,
  clearMediaLibraryItems,
  parseMediaLibraryDeleteRequest,
  executeMediaLibraryDeleteRequest,
  MAX_BULK_DELETE_COUNT,
};
