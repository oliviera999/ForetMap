import React from 'react';
import { resolveMarkerAppearance } from '../../utils/glMarkerAppearance.js';
import { useResolveGlMarkerIconDisplayUrl } from '../hooks/useResolveGlMarkerIconDisplayUrl.js';

/**
 * Visuel (emoji ou icône) d'un repère dans la liste du studio de carte de
 * chapitre GL. Composant feuille prop-driven, sans état.
 * Couvert par `tests-ui/gl/GLChapterMarkerListVisual.test.jsx`.
 */
export function GLChapterMarkerListVisual({ marker }) {
  const resolveIconUrl = useResolveGlMarkerIconDisplayUrl();
  const appearance = resolveMarkerAppearance(marker);
  if (appearance.displayMode === 'emoji' && appearance.emoji) {
    return (
      <span className="gl-markers-list__visual foretmap-emoji-text-mixed" aria-hidden>
        {appearance.emoji}{' '}
      </span>
    );
  }
  const resolvedIconUrl =
    appearance.displayMode === 'icon' && appearance.iconUrl
      ? resolveIconUrl(appearance.iconUrl)
      : null;
  if (appearance.displayMode === 'icon' && resolvedIconUrl) {
    return (
      <img
        className="gl-markers-list__visual gl-markers-list__visual--icon"
        src={resolvedIconUrl}
        alt=""
        aria-hidden
      />
    );
  }
  return null;
}
