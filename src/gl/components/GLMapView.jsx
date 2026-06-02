import React, { useMemo } from 'react';
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
  playerTeamId,
  mascotStateMachine,
  zoneMusicEnabled = false,
  zoneMusicMuted = false,
  onZoneMusicToggle,
  onWatchTeamPctChange,
  onZoneMusicUnlock,
  brandThemeStyle = null,
  canSpellCast = false,
  onLaunchSpell,
  virtualDiceEnabled = false,
}) {
  const watchTeamId = useMemo(() => {
    if (canMoveMascot) {
      if (selectedTeamId != null) return Number(selectedTeamId);
      const teams = gameState?.teams || [];
      return teams.length > 0 ? Number(teams[0].id) : null;
    }
    if (playerTeamId != null) return Number(playerTeamId);
    return null;
  }, [canMoveMascot, selectedTeamId, playerTeamId, gameState?.teams]);

  return (
    <GLGameBoard
      chapter={gameState?.game}
      markers={gameState?.markers || []}
      teams={gameState?.teams || []}
      gameId={gameState?.game?.id}
      watchTeamId={watchTeamId}
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
      zoneMusicEnabled={zoneMusicEnabled}
      zoneMusicMuted={zoneMusicMuted}
      onZoneMusicToggle={onZoneMusicToggle}
      onWatchTeamPctChange={onWatchTeamPctChange}
      onZoneMusicUnlock={onZoneMusicUnlock}
      brandThemeStyle={brandThemeStyle}
      canSpellCast={canSpellCast}
      onLaunchSpell={onLaunchSpell}
      virtualDiceEnabled={virtualDiceEnabled}
    />
  );
}
