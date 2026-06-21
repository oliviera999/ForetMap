import React, { useCallback, useEffect, useState } from 'react';
import { handleImageLightboxClick } from '../utils/imageLightboxClick.js';
import { ImageLightbox } from './ImageLightbox.jsx';

/**
 * Écoute les clics sur les `<img>` (sauf zones exclues) et ouvre {@link ImageLightbox}.
 * Monter une fois autour de l’app ForetMap ou GL.
 */
export function ImageLightboxProvider({ children }) {
  const [active, setActive] = useState(null);

  const close = useCallback(() => setActive(null), []);

  useEffect(() => {
    const onClick = (event) => {
      handleImageLightboxClick(event, setActive);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return (
    <>
      {children}
      {active ? (
        <ImageLightbox
          src={active.src}
          caption={active.caption}
          onClose={close}
          useOverlayHistory
        />
      ) : null}
    </>
  );
}
