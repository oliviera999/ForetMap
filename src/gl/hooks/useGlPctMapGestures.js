import { useCallback, useMemo, useRef } from 'react';

function clampPercent(value) {
  if (!Number.isFinite(value)) return null;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function readRenderedImageRect(imageEl) {
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
  if (imageRatio > boxRatio) {
    renderedH = width / imageRatio;
  } else {
    renderedW = height * imageRatio;
  }
  return {
    left: rect.left + (width - renderedW) / 2,
    top: rect.top + (height - renderedH) / 2,
    width: renderedW,
    height: renderedH,
  };
}

export function useGlPctMapGestures() {
  const containerRef = useRef(null);
  const imageRef = useRef(null);

  const toImagePct = useCallback((clientX, clientY) => {
    const imageRect = readRenderedImageRect(imageRef.current);
    if (!imageRect) return null;
    const x = clampPercent(((clientX - imageRect.left) / imageRect.width) * 100);
    const y = clampPercent(((clientY - imageRect.top) / imageRect.height) * 100);
    if (x == null || y == null) return null;
    return { x, y };
  }, []);

  const api = useMemo(() => ({
    containerRef,
    imageRef,
    toImagePct,
  }), [toImagePct]);

  return api;
}
