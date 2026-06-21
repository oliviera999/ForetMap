'use strict';

const multer = require('multer');

function parseEnvInt(rawValue, fallback) {
  const raw = String(rawValue || '').trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function parseEnvBytes(rawValue, fallback) {
  const raw = String(rawValue || '').trim();
  if (!raw) return fallback;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber > 0) return Math.floor(asNumber);
  const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|mo|gb)?$/i.exec(raw);
  if (!match) return fallback;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return fallback;
  const unit = String(match[2] || 'b').toLowerCase();
  if (unit === 'kb') return Math.floor(amount * 1024);
  if (unit === 'mb' || unit === 'mo') return Math.floor(amount * 1024 * 1024);
  if (unit === 'gb') return Math.floor(amount * 1024 * 1024 * 1024);
  return Math.floor(amount);
}

const MAX_ARCHIVE_BYTES = parseEnvBytes(
  process.env.FORETMAP_CONTENT_LIBRARY_MAX_ARCHIVE_BYTES,
  50 * 1024 * 1024,
);
const MAX_FILE_BYTES = parseEnvBytes(
  process.env.FORETMAP_CONTENT_LIBRARY_MAX_FILE_BYTES,
  32 * 1024 * 1024,
);
const MAX_DECOMPRESSED_BYTES = parseEnvBytes(
  process.env.FORETMAP_CONTENT_LIBRARY_MAX_DECOMPRESSED_BYTES,
  100 * 1024 * 1024,
);
const MAX_FILE_COUNT = parseEnvInt(process.env.FORETMAP_CONTENT_LIBRARY_MAX_FILE_COUNT, 200);

const storage = multer.memoryStorage();

const contentLibraryUploadMiddleware = multer({
  storage,
  limits: {
    fileSize: MAX_ARCHIVE_BYTES,
    files: MAX_FILE_COUNT + 1,
  },
}).fields([
  { name: 'archive', maxCount: 1 },
  { name: 'files', maxCount: MAX_FILE_COUNT },
]);

function uploadError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function asTrimmedString(value) {
  if (value == null) return '';
  return String(value).trim();
}

/** Multer/busboy expose souvent les noms UTF-8 comme latin1 (forÃªt → forêt). */
function decodeMultipartFileName(rawName) {
  const trimmed = asTrimmedString(rawName);
  if (!trimmed) return 'fichier';
  if (!/[\u0080-\uffff]/.test(trimmed)) return trimmed;
  try {
    const fixed = Buffer.from(trimmed, 'latin1').toString('utf8');
    if (!fixed || fixed.includes('\uFFFD')) return trimmed;
    return fixed;
  } catch (_) {
    return trimmed;
  }
}

function isMultipartRequest(req) {
  return String(req.headers['content-type'] || '')
    .toLowerCase()
    .includes('multipart/form-data');
}

function mapMulterFile(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) return null;
  return {
    fileName: decodeMultipartFileName(file.originalname),
    buffer: file.buffer,
  };
}

function readAnalyzeUploadPayload(req) {
  if (isMultipartRequest(req)) {
    const archiveFiles = Array.isArray(req.files?.archive) ? req.files.archive : [];
    const rawFiles = Array.isArray(req.files?.files) ? req.files.files : [];
    if (archiveFiles.length > 0) {
      const archive = mapMulterFile(archiveFiles[0]);
      if (!archive) throw uploadError('Archive ZIP illisible');
      return {
        transport: 'multipart',
        archive: { fileName: archive.fileName, buffer: archive.buffer },
      };
    }
    const uploadedFiles = rawFiles.map(mapMulterFile).filter(Boolean);
    if (uploadedFiles.length === 0)
      throw uploadError('Aucun fichier reçu (champs archive ou files attendus)');
    if (uploadedFiles.length > MAX_FILE_COUNT) {
      throw uploadError(`Trop de fichiers (max ${MAX_FILE_COUNT})`);
    }
    return { transport: 'multipart', uploadedFiles };
  }
  return { transport: 'json', body: req.body && typeof req.body === 'object' ? req.body : {} };
}

function parseJsonField(value, label) {
  const raw = asTrimmedString(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('tableau attendu');
    return parsed;
  } catch (_) {
    throw uploadError(`${label} JSON invalide`);
  }
}

function readApplyUploadPayload(req) {
  if (isMultipartRequest(req)) {
    const entries = parseJsonField(req.body?.entries, 'entries');
    const archiveFiles = Array.isArray(req.files?.archive) ? req.files.archive : [];
    const rawFiles = Array.isArray(req.files?.files) ? req.files.files : [];
    const payload = {
      transport: 'multipart',
      entries,
      uploadedFiles: rawFiles.map(mapMulterFile).filter(Boolean),
    };
    if (archiveFiles.length > 0) {
      const archive = mapMulterFile(archiveFiles[0]);
      if (!archive) throw uploadError('Archive ZIP illisible');
      payload.archive = { fileName: archive.fileName, buffer: archive.buffer };
    }
    return payload;
  }
  return {
    transport: 'json',
    body: req.body && typeof req.body === 'object' ? req.body : {},
  };
}

function getContentLibraryLimits() {
  return {
    maxArchiveBytes: MAX_ARCHIVE_BYTES,
    maxFileBytes: MAX_FILE_BYTES,
    maxDecompressedBytes: MAX_DECOMPRESSED_BYTES,
    maxFileCount: MAX_FILE_COUNT,
  };
}

function handleContentLibraryUploadError(err, req, res, next) {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: `Fichier trop volumineux (max ${Math.round(MAX_ARCHIVE_BYTES / (1024 * 1024))} Mo par lot).`,
      code: 'PAYLOAD_TOO_LARGE',
    });
  }
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: err.message || 'Upload multipart invalide' });
  }
  if (Number.isFinite(err?.status)) {
    return res.status(err.status).json({ error: err.message || 'Upload refusé' });
  }
  return next(err);
}

function wrapContentLibraryUpload(middleware) {
  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (err) return handleContentLibraryUploadError(err, req, res, next);
      return next();
    });
  };
}

module.exports = {
  MAX_ARCHIVE_BYTES,
  MAX_FILE_BYTES,
  MAX_DECOMPRESSED_BYTES,
  MAX_FILE_COUNT,
  decodeMultipartFileName,
  contentLibraryUploadMiddleware: wrapContentLibraryUpload(contentLibraryUploadMiddleware),
  readAnalyzeUploadPayload,
  readApplyUploadPayload,
  getContentLibraryLimits,
  handleContentLibraryUploadError,
  formatBytesLabel(bytes) {
    const mb = (Number(bytes) || 0) / (1024 * 1024);
    if (mb >= 1) return `${Math.round(mb)} Mo`;
    return `${Math.round((Number(bytes) || 0) / 1024)} Ko`;
  },
};
