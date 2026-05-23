import React from 'react';
import VisitMapMascotRenderer from '../../components/VisitMapMascotRenderer.jsx';
import { GLMascotAvatar } from './GLMascotAvatar.jsx';

function isGlMascotId(id) {
  return typeof id === 'string' && id.startsWith('gl-');
}

/** Mascotte catalogue GL dans le même shell que ForetMap (sans fond blanc). */
function GLMascotBoardFallback({ mascotId, size = 48 }) {
  return (
    <div
      className="visit-map-mascot-rive-shell"
      data-renderer="gl-fallback"
      data-mascot-id={mascotId || ''}
      aria-hidden="true"
    >
      <div className="visit-map-mascot-static">
        <GLMascotAvatar mascotId={mascotId} size={size} />
      </div>
    </div>
  );
}

export function GLMascotRenderer({ mascotId, mascotState, size = 48, boardMode = false }) {
  if (isGlMascotId(mascotId)) {
    if (boardMode) {
      return <GLMascotBoardFallback mascotId={mascotId} size={size} />;
    }
    return <GLMascotAvatar mascotId={mascotId} size={size} />;
  }
  return <VisitMapMascotRenderer mascotState={mascotState} mascotId={mascotId} />;
}
