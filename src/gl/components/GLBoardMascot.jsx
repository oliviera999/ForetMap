import React, { useMemo } from 'react';
import { resolveVisitMascotState } from '../../utils/visitMascotState.js';
import { GLMascotRenderer } from './GLMascotRenderer.jsx';

/**
 * Mascotte d’équipe sur le plateau : même ancrage et classes CSS que la visite ForetMap.
 */
export function GLBoardMascot({
  team,
  position,
  motion,
  mascotState,
  prefersReducedMotion = false,
  zIndex = 8,
}) {
  const animationState = useMemo(
    () => resolveVisitMascotState({
      state: mascotState,
      walking: motion?.walking,
      happy: motion?.happy,
    }),
    [mascotState, motion?.walking, motion?.happy],
  );

  const walking = Boolean(motion?.walking);
  const happy = Boolean(motion?.happy);
  const faceRight = motion?.faceRight !== false;

  return (
    <div
      className={`visit-map-mascot gl-board-mascot${walking ? ' visit-map-mascot--walking' : ''}${happy ? ' visit-map-mascot--happy' : ''}${prefersReducedMotion ? ' visit-map-mascot--reduced-motion' : ''}`}
      style={{ left: `${position.xp}%`, top: `${position.yp}%`, zIndex }}
      aria-hidden="true"
      data-team-id={team.id}
      data-gl-board-mascot=""
    >
      <div
        className="visit-map-mascot-inner"
        style={{
          transform: `translate(-50%, -100%) scaleX(${faceRight ? 1 : -1})`,
        }}
      >
        <GLMascotRenderer
          mascotId={team.mascot_id}
          mascotState={animationState}
          boardMode
        />
      </div>
    </div>
  );
}
