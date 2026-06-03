import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useDialogA11y } from '../../hooks/useDialogA11y.js';
import { useOverlayHistoryBack } from '../../hooks/useOverlayHistoryBack.js';
import { lockBodyScroll } from '../../utils/body-scroll-lock.js';

/**
 * Lightbox image partagée (ForetMap + GL) avec overlay fade + popIn.
 * @param {{ src: string, caption?: string, onClose: () => void, useOverlayHistory?: boolean }} props
 */
export function ImageLightbox({ src, caption = '', onClose, useOverlayHistory = false }) {
  const el = useMemo(() => document.createElement('div'), []);
  const dialogRef = useDialogA11y(onClose);
  useOverlayHistoryBack(useOverlayHistory, onClose);

  useEffect(() => {
    const releaseBodyScroll = lockBodyScroll();
    document.body.appendChild(el);
    return () => {
      try {
        if (document.body.contains(el)) document.body.removeChild(el);
      } finally {
        releaseBodyScroll();
      }
    };
  }, [el]);

  const content = (
    <div className="fm-lightbox-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="fm-lightbox-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Aperçu image"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <img
          src={src}
          alt={caption || ''}
          className="fm-lightbox-image"
          decoding="async"
          onClick={(event) => event.stopPropagation()}
        />
        {caption ? <p className="fm-lightbox-caption">{caption}</p> : null}
        <button
          type="button"
          className="fm-lightbox-close"
          aria-label="Fermer l'aperçu"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
    </div>
  );

  return createPortal(content, el);
}
