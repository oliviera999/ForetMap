import React from 'react';
import { GLGameBoard } from './GLGameBoard.jsx';

export function GLMapView({
  gameState,
  onMoveMascot,
  onPlayerActionRequest,
  canMoveMascot,
  canRequestAction,
  selectedTeamId,
  currentTeamId,
}) {
  return (
    <GLGameBoard
      chapter={gameState?.game}
      markers={gameState?.markers || []}
      teams={gameState?.teams || []}
      onMarkerClick={onMoveMascot}
      onPlayerActionRequest={onPlayerActionRequest}
      canMoveMascot={canMoveMascot}
      canRequestAction={canRequestAction}
      selectedTeamId={selectedTeamId}
      currentTeamId={currentTeamId}
    />
  );
}
