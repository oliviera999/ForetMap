function clampPct(value, decimals = null) {
  if (!Number.isFinite(value)) return null;
  const bounded = Math.max(0, Math.min(100, value));
  if (decimals == null) return bounded;
  return Number(bounded.toFixed(decimals));
}

export function readRenderedImageRect(imageEl) {
  if (!imageEl) return null;
  const rect = imageEl.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  if (!(width > 0) || !(height > 0)) return null;

  const naturalW = Number(imageEl.naturalWidth || 0);
  const naturalH = Number(imageEl.naturalHeight || 0);
  if (!(naturalW > 0) || !(naturalH > 0)) {
    return { left: rect.left, top: rect.top, width, height };
  }

  const imageRatio = naturalW / naturalH;
  const boxRatio = width / height;
  let renderedW = width;
  let renderedH = height;
  if (imageRatio > boxRatio) renderedH = width / imageRatio;
  else renderedW = height * imageRatio;

  return {
    left: rect.left + (width - renderedW) / 2,
    top: rect.top + (height - renderedH) / 2,
    width: renderedW,
    height: renderedH,
  };
}

export function pointToRenderedImagePct(clientX, clientY, imageEl, options = {}) {
  const rect = readRenderedImageRect(imageEl);
  if (!rect) return null;
  const x = ((clientX - rect.left) / rect.width) * 100;
  const y = ((clientY - rect.top) / rect.height) * 100;
  const decimals = options.decimals ?? null;
  return {
    x: clampPct(x, decimals),
    y: clampPct(y, decimals),
  };
}

export function pointToElementPct(clientX, clientY, elementOrRect, options = {}) {
  const rect =
    typeof elementOrRect?.getBoundingClientRect === 'function'
      ? elementOrRect.getBoundingClientRect()
      : elementOrRect;
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null;
  const x = ((clientX - rect.left) / rect.width) * 100;
  const y = ((clientY - rect.top) / rect.height) * 100;
  const decimals = options.decimals ?? null;
  const clamp = options.clamp !== false;
  return {
    x: clamp ? clampPct(x, decimals) : x,
    y: clamp ? clampPct(y, decimals) : y,
  };
}

export function pointToContainedRectPct(
  event,
  stageEl,
  transform = { x: 0, y: 0, s: 1 },
  fit = null,
  options = {},
) {
  const rect = stageEl?.getBoundingClientRect?.();
  if (!rect || !rect.width || !rect.height) return null;
  const scale = Number(transform?.s) > 0 ? Number(transform.s) : 1;
  const tx = Number(transform?.x) || 0;
  const ty = Number(transform?.y) || 0;
  const u = (event.clientX - rect.left - tx) / scale;
  const v = (event.clientY - rect.top - ty) / scale;
  const fw = fit && fit.width > 0 ? fit.width : rect.width;
  const fh = fit && fit.height > 0 ? fit.height : rect.height;
  const fox = fit && fit.width > 0 ? fit.offsetX : 0;
  const foy = fit && fit.height > 0 ? fit.offsetY : 0;
  const xp = ((u - fox) / fw) * 100;
  const yp = ((v - foy) / fh) * 100;
  if (!Number.isFinite(xp) || !Number.isFinite(yp)) return null;
  const decimals = options.decimals ?? null;
  const clamp = options.clamp !== false;
  return {
    xp: clamp ? clampPct(xp, decimals) : xp,
    yp: clamp ? clampPct(yp, decimals) : yp,
  };
}
