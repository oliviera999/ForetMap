import React from 'react';
import { GLButton } from './ui/GLButton.jsx';

/**
 * Indicateur de tour et action « nouveau tour » superposés à la carte plateau.
 */
export function GLBoardTurnHud({
  turnsEnabled = false,
  roundNumber = 0,
  canManageTurn = false,
  onNextTurn = null,
  nextTurnBusy = false,
  activeTeamRolled = false,
  activeTeamName = null,
}) {
  if (!turnsEnabled) return null;

  const round = Number(roundNumber) || 0;
  const roundLabel = round > 0 ? `Tour n°${round}` : 'Aucun tour';

  return (
    <div className="gl-board-turn-hud" data-testid="gl-board-turn-hud" role="status">
      <span className="gl-board-turn-hud__counter" data-testid="gl-board-turn-counter">
        {roundLabel}
      </span>
      {canManageTurn ? (
        <GLButton
          type="button"
          size="sm"
          onClick={() => onNextTurn?.()}
          disabled={nextTurnBusy}
          data-testid="gl-board-turn-next"
        >
          {round > 0 ? 'Nouveau tour' : 'Lancer le tour'}
        </GLButton>
      ) : null}
      {activeTeamRolled ? (
        <span className="gl-board-turn-hud__hint" data-testid="gl-board-turn-dice-done">
          {activeTeamName ? `Dés lancés — ${activeTeamName}` : 'Dés déjà lancés ce tour'}
        </span>
      ) : null}
    </div>
  );
}
