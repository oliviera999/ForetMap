import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  decorateLightboxImagesIn,
  handleImageLightboxClick,
  handleImageLightboxKeyDown,
} from '../utils/imageLightboxClick.js';
import { ImageLightbox } from './ImageLightbox.jsx';

const ImageLightboxContext = createContext(null);

/**
 * Ouverture programmatique de la lightbox globale (vignette dans un bouton, galerie…).
 * `null` hors fournisseur : l'appelant garde alors sa propre lightbox.
 * @returns {((payload: { src: string, caption?: string, gallery?: object[], index?: number }) => void) | null}
 */
export function useImageLightbox() {
  return useContext(ImageLightboxContext);
}

/**
 * Écoute les clics sur les `<img>` (sauf zones exclues) et ouvre {@link ImageLightbox}.
 * Les images agrandissables deviennent focalisables : Entrée / Espace ouvrent l'aperçu.
 * Monter une fois autour de l’app ForetMap ou GL.
 */
export function ImageLightboxProvider({ children }) {
  const [active, setActive] = useState(null);

  const close = useCallback(() => setActive(null), []);
  const open = useCallback((payload) => {
    if (payload && String(payload.src || '').trim()) setActive(payload);
  }, []);

  useEffect(() => {
    const onClick = (event) => {
      handleImageLightboxClick(event, setActive);
    };
    const onKeyDown = (event) => {
      handleImageLightboxKeyDown(event, setActive);
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (typeof MutationObserver === 'undefined' || !document.body) return undefined;
    decorateLightboxImagesIn(document.body);
    let frame = 0;
    const pending = new Set();
    const flush = () => {
      frame = 0;
      for (const node of pending) decorateLightboxImagesIn(node);
      pending.clear();
    };
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) pending.add(node);
        }
      }
      if (pending.size && !frame) {
        frame =
          typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame(flush)
            : setTimeout(flush, 16);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
    };
  }, []);

  const contextValue = useMemo(() => open, [open]);

  return (
    <ImageLightboxContext.Provider value={contextValue}>
      {children}
      {active ? (
        <ImageLightbox
          src={active.src}
          caption={active.caption}
          gallery={active.gallery}
          index={active.index}
          onClose={close}
          useOverlayHistory
        />
      ) : null}
    </ImageLightboxContext.Provider>
  );
}
