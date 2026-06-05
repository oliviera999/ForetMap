import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { GLGlossaryMarkdown } from './GLGlossaryMarkdown.jsx';
import { GLButton } from './ui/GLButton.jsx';

export function GLZoneContentPopover({
  open = false,
  zone = null,
  popoverMarkdown = null,
  popoverImages = [],
  loading = false,
  error = '',
  onClose,
  onOpenGlossaryTerm,
  glossaryLinkItems = [],
  themeStyle = null,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const images = Array.isArray(popoverImages) ? popoverImages : [];
  const hasMarkdown = String(popoverMarkdown || '').trim().length > 0;

  return createPortal(
    <div
      className="gl-zone-content-popover-overlay"
      role="presentation"
      style={themeStyle || undefined}
      onClick={() => onClose?.()}
    >
      <div
        className="gl-zone-content-popover"
        role="dialog"
        aria-label={zone?.label ? `Zone : ${zone.label}` : 'Contenu de zone'}
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="gl-zone-content-popover__head">
          <h3>{zone?.label || 'Zone'}</h3>
          <button
            type="button"
            className="gl-zone-content-popover__close"
            onClick={() => onClose?.()}
            aria-label="Fermer"
          >
            ✕
          </button>
        </header>

        {error ? <p className="gl-error">{error}</p> : null}

        {loading ? (
          <p className="gl-hint">Chargement…</p>
        ) : (
          <div className="gl-zone-content-popover__body">
            {hasMarkdown ? (
              <GLGlossaryMarkdown
                markdown={popoverMarkdown}
                glossaryItems={glossaryLinkItems}
                onOpenGlossaryTerm={onOpenGlossaryTerm}
                className="gl-zone-content-popover__markdown"
                allowImages
              />
            ) : null}
            {images.length > 0 ? (
              <div className="gl-zone-content-popover__gallery">
                {images.map((img) => (
                  <figure key={img.url} className="gl-zone-content-popover__figure">
                    <img src={img.url} alt={img.caption || zone?.label || 'Illustration zone'} loading="lazy" />
                    {img.caption ? <figcaption>{img.caption}</figcaption> : null}
                  </figure>
                ))}
              </div>
            ) : null}
          </div>
        )}

        <footer className="gl-zone-content-popover__foot">
          <GLButton type="button" variant="secondary" onClick={() => onClose?.()}>
            Fermer
          </GLButton>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
