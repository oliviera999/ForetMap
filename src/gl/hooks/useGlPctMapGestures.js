import { useCallback, useMemo, useRef } from 'react';
import { pointToRenderedImagePct } from '../../shared/pct-map/pctMapPointer.js';

export function useGlPctMapGestures() {
  const containerRef = useRef(null);
  const imageRef = useRef(null);

  const toImagePct = useCallback((clientX, clientY) => {
    const point = pointToRenderedImagePct(clientX, clientY, imageRef.current);
    if (!point || point.x == null || point.y == null) return null;
    return point;
  }, []);

  const api = useMemo(() => ({
    containerRef,
    imageRef,
    toImagePct,
  }), [toImagePct]);

  return api;
}
