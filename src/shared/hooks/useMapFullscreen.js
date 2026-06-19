import { useCallback, useEffect, useState } from 'react';

import { safeLocalStorageGetItem, safeLocalStorageSetItem } from '../../utils/browserStorage.js';

const FM_MAP_FULLSCREEN_BODY_CLASS = 'fm-map-fullscreen-active';

/**
 * État plein écran carte (portail body + classe document), aligné sur le plateau GL.
 * @param {{ persistKey?: string|null, escapeBlocked?: boolean }} [options]
 */
export function useMapFullscreen({ persistKey = null, escapeBlocked = false } = {}) {
  const [mapFullscreen, setMapFullscreen] = useState(() => {
    if (!persistKey) return false;
    return safeLocalStorageGetItem(persistKey, null) === '1';
  });

  useEffect(() => {
    if (!persistKey) return;
    safeLocalStorageSetItem(persistKey, mapFullscreen ? '1' : '0');
  }, [mapFullscreen, persistKey]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const body = document.body;
    if (mapFullscreen) {
      body.classList.add(FM_MAP_FULLSCREEN_BODY_CLASS);
    } else {
      body.classList.remove(FM_MAP_FULLSCREEN_BODY_CLASS);
    }
    return () => {
      body.classList.remove(FM_MAP_FULLSCREEN_BODY_CLASS);
    };
  }, [mapFullscreen]);

  useEffect(() => {
    if (!mapFullscreen || escapeBlocked) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setMapFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mapFullscreen, escapeBlocked]);

  const openMapFullscreen = useCallback(() => setMapFullscreen(true), []);
  const closeMapFullscreen = useCallback(() => setMapFullscreen(false), []);
  const toggleMapFullscreen = useCallback(() => setMapFullscreen((v) => !v), []);

  return {
    mapFullscreen,
    setMapFullscreen,
    openMapFullscreen,
    closeMapFullscreen,
    toggleMapFullscreen,
  };
}

export { FM_MAP_FULLSCREEN_BODY_CLASS };
