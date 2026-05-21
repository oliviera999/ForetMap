import React from 'react';
import { GLGameBoard } from './GLGameBoard.jsx';

export function GLMapView({
  gameState,
  onMoveMascot,
  onMoveMascotToPct,
  onPlayerActionRequest,
  onSelectTeam,
  canMoveMascot,
  canRequestAction,
  selectedTeamId,
  currentTeamId,
  mascotStateMachine,
}) {
  return (
    <GLGameBoard
      chapter={gameState?.game}
      markers={gameState?.markers || []}
      teams={gameState?.teams || []}
      onMarkerClick={onMoveMascot}
      onBoardClick={onMoveMascotToPct}
      onPlayerActionRequest={onPlayerActionRequest}
      onSelectTeam={onSelectTeam}
      canMoveMascot={canMoveMascot}
      canRequestAction={canRequestAction}
      selectedTeamId={selectedTeamId}
      currentTeamId={currentTeamId}
      mascotStateMachine={mascotStateMachine}
    />
  );
}
