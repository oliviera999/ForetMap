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
  selectable = false,
  isSelected = false,
  onSelect = null,
}) {
  const animationState = useMemo(() => {
    // L'état transitoire (déclenché par `triggerTransient`) peut être un état personnalisé
    // du pack (clé hors palette canonique) : on le respecte tel quel plutôt que de le
    // normaliser vers `idle`. Le reste passe par la résolution standard.
    const transient = String(motion?.transientState || '').trim();
    if (transient) return transient;
    return resolveVisitMascotState({
      state: mascotState,
      walking: motion?.walking,
      happy: motion?.happy,
    });
  }, [mascotState, motion?.walking, motion?.happy, motion?.transientState]);

  const walking = Boolean(motion?.walking);
  const happy = Boolean(motion?.happy);
  const faceRight = motion?.faceRight !== false;
  const snapCenter = Boolean(motion?.snapCenter);

  const className = [
    'visit-map-mascot',
    'gl-board-mascot',
    walking ? 'visit-map-mascot--walking' : '',
    happy ? 'visit-map-mascot--happy' : '',
    prefersReducedMotion ? 'visit-map-mascot--reduced-motion' : '',
    snapCenter ? 'gl-board-mascot--on-marker' : '',
    selectable ? 'gl-board-mascot--selectable' : '',
    isSelected ? 'is-selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const sharedProps = {
    className,
    style: { left: `${position.xp}%`, top: `${position.yp}%`, zIndex },
    'data-team-id': team.id,
    'data-gl-board-mascot': '',
  };

  const inner = (
    <div
      className="visit-map-mascot-inner"
      style={{
        transform: snapCenter
          ? `translate(-50%, -50%) scaleX(${faceRight ? 1 : -1})`
          : `translate(-50%, -100%) scaleX(${faceRight ? 1 : -1})`,
      }}
    >
      <GLMascotRenderer mascotId={team.mascot_id} mascotState={animationState} boardMode />
    </div>
  );

  if (selectable && onSelect) {
    return (
      <button
        type="button"
        {...sharedProps}
        aria-label={`Sélectionner ${team.name}`}
        aria-pressed={isSelected}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(Number(team.id));
        }}
      >
        {inner}
      </button>
    );
  }

  return (
    <div {...sharedProps} aria-hidden="true">
      {inner}
    </div>
  );
}
