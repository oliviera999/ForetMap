import { useCallback, useEffect, useState } from 'react';
import { computeMapImageContainRect } from '../../utils/mapImageFit.js';

/**
 * Rectangle px de l’image affichée (object-fit: contain) dans un conteneur carte GL.
 * Aligne repères, mascottes et zones SVG sur les mêmes % que l’image visible.
 */
export function useGlBoardImageFit(containerRef, imageRef) {
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [fit, setFit] = useState({ offsetX: 0, offsetY: 0, width: 0, height: 0 });

  const recalc = useCallback(() => {
    const el = containerRef?.current;
    if (!el) return;
    const cw = Math.max(1, el.clientWidth);
    const ch = Math.max(1, el.clientHeight);
    setFit(computeMapImageContainRect(natural.w, natural.h, cw, ch));
  }, [containerRef, natural.w, natural.h]);

  useEffect(() => {
    recalc();
  }, [recalc]);

  useEffect(() => {
    const el = containerRef?.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => recalc());
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef, recalc]);

  const onImageLoad = useCallback((event) => {
    const img = event?.currentTarget || imageRef?.current;
    if (!img) return;
    setNatural({
      w: Number(img.naturalWidth) || 0,
      h: Number(img.naturalHeight) || 0,
    });
  }, [imageRef]);

  const fitLayerStyle = fit.width > 0 && fit.height > 0
    ? {
      left: fit.offsetX,
      top: fit.offsetY,
      width: fit.width,
      height: fit.height,
    }
    : { left: 0, top: 0, width: '100%', height: '100%' };

  return {
    fit,
    fitLayerStyle,
    onImageLoad,
    fitHeightPx: fit.height,
  };
}
