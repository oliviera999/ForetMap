import React from 'react';
import { VISIT_MASCOT_STATE } from '../utils/visitMascotState.js';
import {
  getVisitMascotById,
  getDefaultVisitMascotId,
} from '../utils/visitMascotCatalog.js';
import VisitMapMascotRive, { DefaultVisitMascotStaticSvg } from './VisitMapMascotRive.jsx';
import VisitMapMascotSpritesheet from './VisitMapMascotSpritesheet.jsx';

function VisitMapMascotRenderer({
  mascotState = VISIT_MASCOT_STATE.IDLE,
  mascotId = '',
}) {
  const selectedMascot = getVisitMascotById(mascotId) || getVisitMascotById(getDefaultVisitMascotId());
  const fallbackVariant = selectedMascot?.fallbackVariant || 'forest';
  const fallback = <DefaultVisitMascotStaticSvg variant={fallbackVariant} />;
  const renderer = selectedMascot?.renderer;

  if (renderer === 'spritesheet') {
    return (
      <VisitMapMascotSpritesheet
        mascotState={mascotState}
        mascotConfig={selectedMascot}
        fallback={fallback}
      />
    );
  }

  return (
    <VisitMapMascotRive
      mascotState={mascotState}
      mascotConfig={selectedMascot}
      fallback={fallback}
    />
  );
}

export default VisitMapMascotRenderer;
