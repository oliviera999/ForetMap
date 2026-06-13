import React from 'react';
import { resolveMarkerAppearance } from '../../utils/glMarkerAppearance.js';

/**
 * Visuel (emoji ou icône) d'un repère dans la liste du studio de carte de
 * chapitre GL. Composant feuille prop-driven, sans état.
 * Couvert par `tests-ui/gl/GLChapterMarkerListVisual.test.jsx`.
 */
export function GLChapterMarkerListVisual({ marker }) {
  const appearance = resolveMarkerAppearance(marker);
  if (appearance.displayMode === 'emoji' && appearance.emoji) {
    return (
      <span className="gl-markers-list__visual foretmap-emoji-text-mixed" aria-hidden>
        {appearance.emoji}
        {' '}
      </span>
    );
  }
  if (appearance.displayMode === 'icon' && appearance.iconUrl) {
    return (
      <img
        className="gl-markers-list__visual gl-markers-list__visual--icon"
        src={appearance.iconUrl}
        alt=""
        aria-hidden
      />
    );
  }
  return null;
}
