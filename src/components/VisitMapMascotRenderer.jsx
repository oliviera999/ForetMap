import React from 'react';
import { VISIT_MASCOT_STATE } from '../utils/visitMascotState.js';
import {
  getVisitMascotById,
  getDefaultVisitMascotId,
} from '../utils/visitMascotCatalog.js';
import VisitMapMascotRive from './VisitMapMascotRive.jsx';
import VisitMascotFallbackSvg from './VisitMascotFallbackSvg.jsx';
import VisitMapMascotSpritesheet from './VisitMapMascotSpritesheet.jsx';
import VisitMapMascotSpriteCut from './VisitMapMascotSpriteCut.jsx';

function VisitMapMascotRenderer({
  mascotState = VISIT_MASCOT_STATE.IDLE,
  mascotId = '',
}) {
  const selectedMascot = getVisitMascotById(mascotId) || getVisitMascotById(getDefaultVisitMascotId());
  const selectedMascotId = selectedMascot?.id || getDefaultVisitMascotId();
  const fallbackSilhouette = selectedMascot?.fallbackSilhouette || 'gnome';
  const fallbackVariant = selectedMascot?.fallbackVariant || 'forest';
  const fallback = (
    <VisitMascotFallbackSvg silhouette={fallbackSilhouette} variant={fallbackVariant} />
  );
  const renderer = selectedMascot?.renderer;

  if (renderer === 'spritesheet') {
    return (
      <VisitMapMascotSpritesheet
        mascotState={mascotState}
        mascotConfig={selectedMascot}
        fallback={fallback}
        mascotId={selectedMascotId}
      />
    );
  }

  if (renderer === 'sprite_cut') {
    return (
      <VisitMapMascotSpriteCut
        mascotState={mascotState}
        mascotConfig={selectedMascot}
        fallback={fallback}
        mascotId={selectedMascotId}
      />
    );
  }

  return (
    <VisitMapMascotRive
      mascotState={mascotState}
      mascotConfig={selectedMascot}
      fallback={fallback}
      mascotId={selectedMascotId}
    />
  );
}

export default VisitMapMascotRenderer;
