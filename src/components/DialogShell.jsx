import React from 'react';
import { createPortal } from 'react-dom';
import { useDialogA11y } from '../hooks/useDialogA11y';

function joinClassNames(...values) {
  return values.map((v) => String(v || '').trim()).filter(Boolean).join(' ');
}

/**
 * Shell unifié pour toutes les modales ForetMap.
 * - portal sous body (évite les problèmes de clipping parent)
 * - fermeture overlay + Escape
 * - focus trap / restauration du focus via useDialogA11y
 */
export function DialogShell({
  open = true,
  onClose,
  overlayClassName = 'modal-overlay',
  dialogClassName = 'log-modal fade-in',
  dialogStyle,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  closeButtonLabel = 'Fermer',
  showCloseButton = false,
  closeButtonClassName = 'modal-close',
  closeButtonDisabled = false,
  closeOnOverlay = true,
  dialogRef: externalDialogRef = null,
  children,
}) {
  const internalDialogRef = useDialogA11y(() => {
    onClose?.();
  });
  const dialogRef = externalDialogRef || internalDialogRef;

  if (!open || typeof document === 'undefined' || !document.body) return null;

  return createPortal(
    <div
      className={overlayClassName}
      role="presentation"
      onClick={(e) => {
        if (!closeOnOverlay) return;
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        className={joinClassNames(dialogClassName)}
        style={dialogStyle}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {showCloseButton ? (
          <button
            type="button"
            className={closeButtonClassName}
            onClick={onClose}
            aria-label={closeButtonLabel}
            disabled={closeButtonDisabled}
          >
            ✕
          </button>
        ) : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}
