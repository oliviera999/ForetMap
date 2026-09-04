import { useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useDialogA11y } from '../platform/useDialogA11y.js';
import { useOverlayHistoryBack } from '../platform/useOverlayHistoryBack.js';
import { lockBodyScroll } from '../platform/bodyScrollLock.js';
import { IconClose } from '../icons.jsx';

/**
 * Lightbox image partagée (ForetMap + GL) avec overlay fade + popIn.
 * @param {{ src: string, caption?: string, onClose: () => void, useOverlayHistory?: boolean }} props
 */
export function ImageLightbox({ src, caption = '', onClose, useOverlayHistory = false }) {
  const el = useMemo(() => document.createElement('div'), []);
  const dialogRef = useDialogA11y(onClose);
  useOverlayHistoryBack(useOverlayHistory, onClose);

  // Effet de layout, pas d'effet passif : le conteneur doit être DANS le document avant que
  // l'effet passif de `useDialogA11y` ne pose le focus initial (un `.focus()` sur un élément
  // détaché est ignoré — le bouton « Fermer » ne recevait jamais le focus à l'ouverture).
  useLayoutEffect(() => {
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
          <IconClose size={16} />
        </button>
      </div>
    </div>
  );

  return createPortal(content, el);
}
