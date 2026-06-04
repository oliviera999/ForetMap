import {
  getGlImageFrameDefaults,
  normalizeGlImageFrame,
  parseGlImageFrameAttr,
} from '../shared/image-frame/glImageFrameCore.js';

export { getGlImageFrameDefaults, normalizeGlImageFrame };

/** Style du conteneur cadre (ratio / bornes max). */
export function glImageFrameToWrapStyle(frame, context = 'default') {
  const normalized = normalizeGlImageFrame(frame, context);
  const style = {};
  if (normalized.aspectRatio !== 'auto') style.aspectRatio = normalized.aspectRatio;
  if (normalized.maxWidthPx != null) style.maxWidth = `${normalized.maxWidthPx}px`;
  if (normalized.maxHeightPx != null) style.maxHeight = `${normalized.maxHeightPx}px`;
  return style;
}

/** Style de remplissage image à l'intérieur d'un cadre. */
export function glImageFrameToImgFillStyle(frame, context = 'default') {
  const normalized = normalizeGlImageFrame(frame, context);
  return {
    width: '100%',
    height: '100%',
    maxWidth: '100%',
    objectFit: normalized.objectFit,
    objectPosition: `${normalized.focalX}% ${normalized.focalY}%`,
  };
}

export function glImageFrameToStyle(frame, context = 'default') {
  const normalized = normalizeGlImageFrame(frame, context);
  const style = {
    ...glImageFrameToImgFillStyle(frame, context),
    display: 'block',
  };
  if (normalized.aspectRatio !== 'auto') {
    style.aspectRatio = normalized.aspectRatio;
    style.width = '100%';
    style.maxWidth = '100%';
    style.height = 'auto';
  }
  if (normalized.maxWidthPx != null) style.maxWidth = `${normalized.maxWidthPx}px`;
  if (normalized.maxHeightPx != null) style.maxHeight = `${normalized.maxHeightPx}px`;
  return style;
}

export function serializeGlImageFrameAttr(frame, context = 'default') {
  return JSON.stringify(normalizeGlImageFrame(frame, context));
}

export { parseGlImageFrameAttr };

function normalizeCrop(rawCrop) {
  return normalizeGlImageFrame({ crop: rawCrop }, 'default').crop;
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
