import { useCallback } from 'react';

import { PctPlaceFocusFx } from '../../shared/pct-map/PctPlaceFocusFx.jsx';
import { resolveMarkerAppearance } from '../utils/glMarkerAppearance.js';

/**
 * Effets du zoom sur le repère / la zone d'arrivée (état : `useGLBoardFocus().fx`), à poser
 * parmi les calques du plateau (`GLPctMapCanvas`). Seul un repère affiché en emoji a un emoji
 * à faire s'envoler ; les autres lieux gardent le projecteur et les étincelles.
 */
export function GLBoardFocusFx({ fx, mapGestures }) {
  const emojiOf = useCallback((place) => {
    const hasPoints = Array.isArray(place?.points) ? place.points.length > 0 : !!place?.points;
    if (hasPoints) return '';
    const appearance = resolveMarkerAppearance(place);
    return appearance?.displayMode === 'emoji' ? appearance.emoji || '' : '';
  }, []);
  if (!fx) return null;
  const fitRect = mapGestures?.fitRect || {};
  return (
    <PctPlaceFocusFx
      fx={fx}
      fitWidth={fitRect.width}
      fitHeight={fitRect.height}
      emojiOf={emojiOf}
    />
  );
}
