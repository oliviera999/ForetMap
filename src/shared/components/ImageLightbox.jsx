import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialogA11y } from '../platform/useDialogA11y.js';
import { lockBodyScroll } from '../platform/bodyScrollLock.js';
import { IconClose } from '../icons.jsx';
import { resolveExternalImageUrl } from '../privacy/externalAssets.js';

/**
 * @typedef {{ src: string, caption?: string }} LightboxItem
 */

function normalizeGallery(src, caption, gallery, index) {
  const items = Array.isArray(gallery)
    ? gallery.filter((item) => item && String(item.src || '').trim())
    : [];
  if (items.length > 1) {
    const start = Number.isInteger(index) && index >= 0 && index < items.length ? index : 0;
    return { items, start };
  }
  return { items: [{ src, caption }], start: 0 };
}

/**
 * Lightbox image partagée (ForetMap + GL) avec overlay fade + popIn.
 * Avec `gallery` (≥ 2 images), boutons et flèches du clavier passent d'une image à l'autre ;
 * l'image suivante est préchargée. Toucher ou cliquer l'image bascule un zoom ×2.
 *
 * @param {{ src: string, caption?: string, onClose: () => void, useOverlayHistory?: boolean,
 *   gallery?: LightboxItem[], index?: number }} props
 */
export function ImageLightbox({
  src,
  caption = '',
  onClose,
  useOverlayHistory = true,
  gallery = null,
  index = 0,
}) {
  const el = useMemo(() => document.createElement('div'), []);
  const { items, start } = useMemo(
    () => normalizeGallery(src, caption, gallery, index),
    [src, caption, gallery, index],
  );
  const [position, setPosition] = useState(start);
  const [loadState, setLoadState] = useState({ src: '', status: 'loading' });
  const [zoomedSrc, setZoomedSrc] = useState('');
  const dialogRef = useDialogA11y(onClose, { historyBack: useOverlayHistory });

  const current = items[Math.min(position, items.length - 1)] || items[0];
  const currentCaption = String(current?.caption || '').trim();
  const currentSrc = resolveExternalImageUrl(current?.src || '');
  const hasGallery = items.length > 1;
  const status = loadState.src === currentSrc ? loadState.status : 'loading';
  const zoomed = zoomedSrc === currentSrc;

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

  useEffect(() => {
    if (!hasGallery || typeof Image === 'undefined') return;
    const next = items[(position + 1) % items.length];
    if (next?.src) {
      const preload = new Image();
      preload.src = resolveExternalImageUrl(next.src);
    }
  }, [hasGallery, items, position]);

  useEffect(() => {
    if (!hasGallery) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setPosition((p) => (p + 1) % items.length);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setPosition((p) => (p - 1 + items.length) % items.length);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [hasGallery, items.length]);

  const dialogLabel = currentCaption ? `Aperçu : ${currentCaption}` : 'Aperçu de l’image';
  const counter = hasGallery ? `${position + 1} / ${items.length}` : '';

  const content = (
    <div className="fm-lightbox-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="fm-lightbox-panel"
        role="dialog"
        aria-modal="true"
        aria-label={dialogLabel}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`fm-lightbox-stage${zoomed ? ' is-zoomed' : ''}`}>
          <img
            key={currentSrc}
            src={currentSrc}
            alt={currentCaption || 'Image agrandie'}
            className="fm-lightbox-image"
            decoding="async"
            data-status={status}
            onLoad={() => setLoadState({ src: currentSrc, status: 'ready' })}
            onError={() => setLoadState({ src: currentSrc, status: 'error' })}
            onClick={(event) => {
              event.stopPropagation();
              if (status === 'ready') setZoomedSrc(zoomed ? '' : currentSrc);
            }}
          />
          {status === 'loading' ? (
            <p className="fm-lightbox-status" role="status">
              Chargement…
            </p>
          ) : null}
          {status === 'error' ? (
            <p className="fm-lightbox-status" role="alert">
              Image indisponible.
            </p>
          ) : null}
        </div>
        {currentCaption || counter ? (
          <p className="fm-lightbox-caption" aria-hidden={currentCaption ? 'true' : undefined}>
            {currentCaption}
            {counter ? <span className="fm-lightbox-counter"> {counter}</span> : null}
          </p>
        ) : null}
        <button
          type="button"
          className="fm-lightbox-close"
          aria-label="Fermer l'aperçu"
          onClick={onClose}
        >
          <IconClose size={16} />
        </button>
        {hasGallery ? (
          <>
            <button
              type="button"
              className="fm-lightbox-nav fm-lightbox-nav--prev"
              aria-label="Image précédente"
              onClick={() => setPosition((p) => (p - 1 + items.length) % items.length)}
            >
              ‹
            </button>
            <button
              type="button"
              className="fm-lightbox-nav fm-lightbox-nav--next"
              aria-label="Image suivante"
              onClick={() => setPosition((p) => (p + 1) % items.length)}
            >
              ›
            </button>
          </>
        ) : null}
      </div>
    </div>
  );

  return createPortal(content, el);
}
