import React from 'react';
import { GLGameBoard } from './GLGameBoard.jsx';

export function GLMapView({
  gameState,
  onMoveMascot,
  onMoveMascotToPct,
  onPlayerActionRequest,
  onSelectTeam,
  onOpenGlossaryTerm,
  onQcmAnswered,
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
      gameId={gameState?.game?.id}
      biomeSlug={gameState?.game?.biome_slug}
      onMarkerClick={onMoveMascot}
      onBoardClick={onMoveMascotToPct}
      onPlayerActionRequest={onPlayerActionRequest}
      onSelectTeam={onSelectTeam}
      onOpenGlossaryTerm={onOpenGlossaryTerm}
      onQcmAnswered={onQcmAnswered}
      canMoveMascot={canMoveMascot}
      canRequestAction={canRequestAction}
      selectedTeamId={selectedTeamId}
      currentTeamId={currentTeamId}
      mascotStateMachine={mascotStateMachine}
    />
  );
}
