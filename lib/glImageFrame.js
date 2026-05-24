const ALLOWED_ASPECT_RATIOS = new Set(['auto', '1/1', '4/3', '16/9', '21/9']);
const ALLOWED_OBJECT_FIT = new Set(['cover', 'contain']);

const CONTEXT_DEFAULTS = Object.freeze({
  default: { aspectRatio: 'auto', objectFit: 'cover', focalX: 50, focalY: 50, maxWidthPx: null, maxHeightPx: null, crop: null },
  'brand-hero': { aspectRatio: '21/9', objectFit: 'cover', focalX: 50, focalY: 50, maxWidthPx: null, maxHeightPx: null, crop: null },
  'brand-card': { aspectRatio: '4/3', objectFit: 'cover', focalX: 50, focalY: 50, maxWidthPx: null, maxHeightPx: null, crop: null },
  'brand-banner': { aspectRatio: '16/9', objectFit: 'cover', focalX: 50, focalY: 50, maxWidthPx: null, maxHeightPx: 280, crop: null },
  markdown: { aspectRatio: 'auto', objectFit: 'cover', focalX: 50, focalY: 50, maxWidthPx: null, maxHeightPx: null, crop: null },
  'chapter-map': { aspectRatio: 'auto', objectFit: 'contain', focalX: 50, focalY: 50, maxWidthPx: null, maxHeightPx: null, crop: null },
  avatar: { aspectRatio: '1/1', objectFit: 'cover', focalX: 50, focalY: 50, maxWidthPx: 512, maxHeightPx: 512, crop: null },
});

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

function getGlImageFrameDefaults(context = 'default') {
  return CONTEXT_DEFAULTS[context] || CONTEXT_DEFAULTS.default;
}

function normalizeGlImageFrame(raw, context = 'default') {
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
    maxWidthPx: normalizeDimension(source.maxWidthPx, defaults.maxWidthPx),
    maxHeightPx: normalizeDimension(source.maxHeightPx, defaults.maxHeightPx),
    crop: normalizeCrop(source.crop),
  };
}

function parseGlImageFrameAttr(rawValue, context = 'default') {
  if (!rawValue) return normalizeGlImageFrame(null, context);
  try {
    const parsed = JSON.parse(String(rawValue));
    return normalizeGlImageFrame(parsed, context);
  } catch (_) {
    return normalizeGlImageFrame(null, context);
  }
}

module.exports = {
  getGlImageFrameDefaults,
  normalizeGlImageFrame,
  parseGlImageFrameAttr,
};
