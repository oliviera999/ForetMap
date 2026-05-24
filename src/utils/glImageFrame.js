const ALLOWED_ASPECT_RATIOS = new Set(['auto', '1/1', '4/3', '16/9', '21/9']);
const ALLOWED_OBJECT_FIT = new Set(['cover', 'contain']);

const CONTEXT_DEFAULTS = Object.freeze({
  default: {
    aspectRatio: 'auto',
    objectFit: 'cover',
    focalX: 50,
    focalY: 50,
    maxWidthPx: null,
    maxHeightPx: null,
    crop: null,
  },
  'brand-hero': {
    aspectRatio: '21/9',
    objectFit: 'cover',
    focalX: 50,
    focalY: 50,
    maxWidthPx: null,
    maxHeightPx: null,
    crop: null,
  },
  'brand-card': {
    aspectRatio: '4/3',
    objectFit: 'cover',
    focalX: 50,
    focalY: 50,
    maxWidthPx: null,
    maxHeightPx: null,
    crop: null,
  },
  'brand-banner': {
    aspectRatio: '16/9',
    objectFit: 'cover',
    focalX: 50,
    focalY: 50,
    maxWidthPx: null,
    maxHeightPx: 280,
    crop: null,
  },
  markdown: {
    aspectRatio: 'auto',
    objectFit: 'cover',
    focalX: 50,
    focalY: 50,
    maxWidthPx: null,
    maxHeightPx: null,
    crop: null,
  },
  'chapter-map': {
    aspectRatio: 'auto',
    objectFit: 'contain',
    focalX: 50,
    focalY: 50,
    maxWidthPx: null,
    maxHeightPx: null,
    crop: null,
  },
  avatar: {
    aspectRatio: '1/1',
    objectFit: 'cover',
    focalX: 50,
    focalY: 50,
    maxWidthPx: 512,
    maxHeightPx: 512,
    crop: null,
  },
});

function toNumberOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeDimension(value, fallback = null, max = 4096) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n <= 0) return null;
  return Math.min(max, Math.round(n));
}

function normalizeCrop(rawCrop) {
  if (!rawCrop || typeof rawCrop !== 'object') return null;
  const x = clamp(rawCrop.x, 0, 1, 0);
  const y = clamp(rawCrop.y, 0, 1, 0);
  const w = clamp(rawCrop.w, 0, 1, 1);
  const h = clamp(rawCrop.h, 0, 1, 1);
  if (w <= 0 || h <= 0) return null;
  const safeW = Math.min(w, 1 - x);
  const safeH = Math.min(h, 1 - y);
  if (safeW <= 0 || safeH <= 0) return null;
  return {
    x: Number(x.toFixed(6)),
    y: Number(y.toFixed(6)),
    w: Number(safeW.toFixed(6)),
    h: Number(safeH.toFixed(6)),
  };
}

export function getGlImageFrameDefaults(context = 'default') {
  return CONTEXT_DEFAULTS[context] || CONTEXT_DEFAULTS.default;
}

export function normalizeGlImageFrame(raw, context = 'default') {
  const defaults = getGlImageFrameDefaults(context);
  const source = raw && typeof raw === 'object' ? raw : {};
  const aspectRatio = ALLOWED_ASPECT_RATIOS.has(String(source.aspectRatio || ''))
    ? String(source.aspectRatio)
    : defaults.aspectRatio;
  const objectFit = ALLOWED_OBJECT_FIT.has(String(source.objectFit || ''))
    ? String(source.objectFit)
    : defaults.objectFit;
  return {
    aspectRatio,
    objectFit,
    focalX: clamp(source.focalX, 0, 100, defaults.focalX),
    focalY: clamp(source.focalY, 0, 100, defaults.focalY),
    maxWidthPx: normalizeDimension(toNumberOrNull(source.maxWidthPx), defaults.maxWidthPx),
    maxHeightPx: normalizeDimension(toNumberOrNull(source.maxHeightPx), defaults.maxHeightPx),
    crop: normalizeCrop(source.crop),
  };
}

export function glImageFrameToStyle(frame) {
  const normalized = normalizeGlImageFrame(frame, 'default');
  const style = {
    objectFit: normalized.objectFit,
    objectPosition: `${normalized.focalX}% ${normalized.focalY}%`,
  };
  if (normalized.aspectRatio !== 'auto') style.aspectRatio = normalized.aspectRatio;
  if (normalized.maxWidthPx != null) style.maxWidth = `${normalized.maxWidthPx}px`;
  if (normalized.maxHeightPx != null) style.maxHeight = `${normalized.maxHeightPx}px`;
  return style;
}

export function serializeGlImageFrameAttr(frame, context = 'default') {
  return JSON.stringify(normalizeGlImageFrame(frame, context));
}

export function parseGlImageFrameAttr(rawValue, context = 'default') {
  if (!rawValue) return normalizeGlImageFrame(null, context);
  try {
    const parsed = JSON.parse(String(rawValue));
    return normalizeGlImageFrame(parsed, context);
  } catch (_) {
    return normalizeGlImageFrame(null, context);
  }
}

export function getCropRectPx(imgW, imgH, crop) {
  const safeW = Math.max(1, Math.round(Number(imgW) || 0));
  const safeH = Math.max(1, Math.round(Number(imgH) || 0));
  const normalizedCrop = normalizeCrop(crop);
  if (!normalizedCrop) return { x: 0, y: 0, w: safeW, h: safeH };
  const x = Math.round(normalizedCrop.x * safeW);
  const y = Math.round(normalizedCrop.y * safeH);
  const w = Math.max(1, Math.round(normalizedCrop.w * safeW));
  const h = Math.max(1, Math.round(normalizedCrop.h * safeH));
  return {
    x: Math.min(Math.max(0, x), safeW - 1),
    y: Math.min(Math.max(0, y), safeH - 1),
    w: Math.min(w, safeW - x),
    h: Math.min(h, safeH - y),
  };
}

export async function cropImageDataUrl(sourceDataUrl, crop, maxPx = 1200, quality = 0.85) {
  const src = String(sourceDataUrl || '').trim();
  if (!src.startsWith('data:image/')) throw new Error('Image source invalide');
  const img = await new Promise((resolve, reject) => {
    const node = new Image();
    node.onload = () => resolve(node);
    node.onerror = () => reject(new Error('Impossible de lire l’image'));
    node.src = src;
  });
  const rect = getCropRectPx(img.naturalWidth || img.width, img.naturalHeight || img.height, crop);
  const ratio = rect.w / rect.h;
  let targetW = rect.w;
  let targetH = rect.h;
  if (Number.isFinite(maxPx) && maxPx > 0) {
    if (targetW >= targetH && targetW > maxPx) {
      targetW = Math.round(maxPx);
      targetH = Math.max(1, Math.round(targetW / ratio));
    } else if (targetH > maxPx) {
      targetH = Math.round(maxPx);
      targetW = Math.max(1, Math.round(targetH * ratio));
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponible');
  ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, targetW, targetH);
  return canvas.toDataURL('image/jpeg', quality);
}
