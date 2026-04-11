const { writeBufferToDisk, deleteFile } = require('./uploads');

const MAX_USER_CONTENT_IMAGES = 3;

function userContentImageExtensionFromBuffer(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** Décode une data URL / base64 ; vérifie la signature (JPEG, PNG, WebP). Pas de plafond de taille côté appli (rester sous la limite du corps JSON HTTP). */
function decodeUserContentImageBuffer(imageData) {
  if (imageData == null) return { error: 'Image invalide' };
  const str = String(imageData);
  const raw = str.includes(',') ? str.split(',')[1] : str;
  if (!raw || !String(raw).trim()) return { error: 'Image invalide' };
  let buf;
  try {
    buf = Buffer.from(raw, 'base64');
  } catch (_) {
    return { error: 'Image invalide' };
  }
  if (!buf.length) return { error: 'Image invalide' };
  const ext = userContentImageExtensionFromBuffer(buf);
  if (!ext) return { error: 'Format image non supporté (JPEG, PNG ou WebP)' };
  return { buffer: buf, ext };
}

function normalizeImagesInput(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x || '').trim()).filter(Boolean).slice(0, MAX_USER_CONTENT_IMAGES);
}

/** Valide le champ `images` du corps JSON (tableau de data URLs / base64). */
function validateImagesPayload(raw) {
  if (raw == null || raw === undefined) return { images: [] };
  if (!Array.isArray(raw)) return { error: 'Le champ images doit être un tableau' };
  const nonempty = raw.map((x) => String(x || '').trim()).filter(Boolean);
  if (nonempty.length > MAX_USER_CONTENT_IMAGES) {
    return { error: `Trop d'images (maximum ${MAX_USER_CONTENT_IMAGES})` };
  }
  return { images: nonempty };
}

/**
 * Écrit les images sous uploads/{prefix}/{entityId}/N.ext
 * @returns {{ pathsJson: string } | { error: string }}
 */
function persistUserContentImages(prefix, entityId, imageDataList) {
  const list = normalizeImagesInput(imageDataList);
  if (list.length === 0) return { pathsJson: null };
  const safePrefix = String(prefix || '').replace(/[^a-z0-9-]/gi, '');
  const safeId = String(entityId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safePrefix || !safeId) return { error: 'Identifiant invalide pour stockage des images' };
  const paths = [];
  for (let i = 0; i < list.length; i += 1) {
    const decoded = decodeUserContentImageBuffer(list[i]);
    if (decoded.error) return { error: decoded.error };
    const rel = `${safePrefix}/${safeId}/${i}.${decoded.ext}`;
    try {
      writeBufferToDisk(rel, decoded.buffer);
    } catch (e) {
      for (const p of paths) {
        try {
          deleteFile(p);
        } catch (_) {
          /* ignore */
        }
      }
      return { error: e.message || 'Enregistrement image impossible' };
    }
    paths.push(rel);
  }
  return { pathsJson: JSON.stringify(paths) };
}

function deleteUserContentImagesFromJson(jsonStr, allowedPrefix) {
  const prefix = String(allowedPrefix || '').trim();
  if (!prefix || jsonStr == null || jsonStr === '') return;
  let arr;
  try {
    arr = JSON.parse(String(jsonStr));
  } catch (_) {
    return;
  }
  if (!Array.isArray(arr)) return;
  for (const p of arr) {
    const s = typeof p === 'string' ? p.trim() : '';
    if (!s || s.includes('..') || s.includes('\\') || !s.startsWith(`${prefix}/`)) continue;
    deleteFile(s);
  }
}

/**
 * Ajoute `image_urls` (/uploads/...) et retire `image_paths_json` du row exposé API.
 * @param {object} row
 * @param {string} allowedPrefix - ex. `context-comments` ou `forum-posts`
 */
function attachPublicImageUrls(row, allowedPrefix) {
  if (!row) return;
  const raw = row.image_paths_json;
  delete row.image_paths_json;
  const urls = [];
  const prefix = String(allowedPrefix || '').trim();
  if (prefix && raw != null && raw !== '') {
    try {
      const arr = JSON.parse(String(raw));
      if (Array.isArray(arr)) {
        for (const p of arr) {
          const s = typeof p === 'string' ? p.trim() : '';
          if (!s || s.includes('..') || s.includes('\\') || !s.startsWith(`${prefix}/`)) continue;
          urls.push(`/uploads/${s}`);
        }
      }
    } catch (_) {
      /* ignore */
    }
  }
  row.image_urls = urls;
}

module.exports = {
  MAX_USER_CONTENT_IMAGES,
  normalizeImagesInput,
  validateImagesPayload,
  decodeUserContentImageBuffer,
  persistUserContentImages,
  deleteUserContentImagesFromJson,
  attachPublicImageUrls,
};
