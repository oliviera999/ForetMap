import { useCallback } from 'react';
import { useBodyScrollLock } from '../../shared/platform/bodyScrollLock.js';
import { useDialogA11y } from '../../shared/platform/useDialogA11y.js';
import { useExitAnimation } from '../../shared/hooks/useExitAnimation.js';
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
  const { closing, runExit, onAnimationEnd } = useExitAnimation({
    animationName: 'fmExitFadeShrink',
  });
  const closeAnimated = useCallback(() => runExit(onClose), [runExit, onClose]);
  // Échap par la pile des surcouches, focus initial, piège de tabulation, focus rendu au
  // plateau à la fermeture, retour navigateur.
  const dialogRef = useDialogA11y(closeAnimated, { active: open });

  useBodyScrollLock(open);

  if (!open) return null;

  const images = Array.isArray(popoverImages) ? popoverImages : [];
  const hasMarkdown = String(popoverMarkdown || '').trim().length > 0;

  return createPortal(
    <div
      className={`gl-zone-content-popover-overlay${closing ? ' fm-is-exiting' : ''}`}
      role="presentation"
      style={themeStyle || undefined}
      onClick={closeAnimated}
    >
      <div
        ref={dialogRef}
        className={`gl-zone-content-popover${closing ? ' fm-is-exiting' : ''}`}
        role="dialog"
        aria-label={zone?.label ? `Zone : ${zone.label}` : 'Contenu de zone'}
        aria-modal="true"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onAnimationEnd={onAnimationEnd}
      >
        <header className="gl-zone-content-popover__head">
          <h3>{zone?.label || 'Zone'}</h3>
          <button
            type="button"
            className="gl-zone-content-popover__close"
            onClick={closeAnimated}
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
                    <img
                      src={img.url}
                      alt={img.caption || zone?.label || 'Illustration zone'}
                      loading="lazy"
                    />
                    {img.caption ? <figcaption>{img.caption}</figcaption> : null}
                  </figure>
                ))}
              </div>
            ) : null}
          </div>
        )}

        <footer className="gl-zone-content-popover__foot">
          <GLButton type="button" variant="secondary" onClick={closeAnimated}>
            Fermer
          </GLButton>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
