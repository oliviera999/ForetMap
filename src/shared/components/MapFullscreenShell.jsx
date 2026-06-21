import React from 'react';
import { createPortal } from 'react-dom';

/**
 * Enveloppe plein écran : portail sur `document.body`, bouton Fermer, testids stables.
 * Hors plein écran, rend uniquement `children` (pas de wrapper superflu).
 */
export function MapFullscreenShell({
  active = false,
  onClose,
  children,
  layerClassName = '',
  layerTestId = 'fm-map-fullscreen-layer',
  closeTestId = 'fm-map-fullscreen-close',
}) {
  if (!active) {
    return children;
  }

  const shell = (
    <div
      className={`fm-map-fullscreen-layer${layerClassName ? ` ${layerClassName}` : ''}`}
      data-testid={layerTestId}
    >
      <button
        type="button"
        className="fm-map-fullscreen-close"
        data-testid={closeTestId}
        aria-label="Quitter le plein écran"
        onClick={onClose}
      >
        Fermer
      </button>
      {children}
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(shell, document.body);
  }

  return shell;
}
