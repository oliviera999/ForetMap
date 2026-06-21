import React, { useMemo } from 'react';
import { GLGameBoard } from './GLGameBoard.jsx';

export function GLMapView({
  gameState,
  onMoveMascot,
  onMoveMascotToPct,
  onPlayerActionRequest,
  onSelectTeam,
  onOpenGlossaryTerm,
  glossaryLinkItems = [],
  onOpenLoreTerm,
  loreGlossaryLinkItems = [],
  loreCarnetEnabled = false,
  onQcmAnswered,
  canMoveMascot,
  boardMovement = null,
  onDiceRollResult = null,
  canRequestAction,
  markerArrivalEnabled = true,
  selectedTeamId,
  currentTeamId,
  playerTeamId,
  mascotStateMachine,
  kingdomZones = [],
  zoneMusicEnabled = false,
  zoneMusicMuted = false,
  onZoneMusicToggle,
  onWatchTeamPctChange,
  onZoneMusicUnlock,
  brandThemeStyle = null,
  canSpellCast = false,
  onLaunchSpell,
  virtualDiceEnabled = false,
  feuilletZones = [],
  feuilletZoneEditMode = false,
  showPlateauMarkers = true,
  showPlateauZones = false,
  roster = [],
  vitalityEnabled = false,
  vitalityByPlayerId = null,
  playerId = null,
}) {
  const mjTeamSelection = canMoveMascot || boardMovement?.isNumberedPath;
  const watchTeamId = useMemo(() => {
    if (mjTeamSelection) {
      if (selectedTeamId != null) return Number(selectedTeamId);
      const teams = gameState?.teams || [];
      return teams.length > 0 ? Number(teams[0].id) : null;
    }
    if (playerTeamId != null) return Number(playerTeamId);
    return null;
  }, [mjTeamSelection, selectedTeamId, playerTeamId, gameState?.teams]);

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
      glossaryLinkItems={glossaryLinkItems}
      onOpenLoreTerm={onOpenLoreTerm}
      loreGlossaryLinkItems={loreGlossaryLinkItems}
      loreCarnetEnabled={loreCarnetEnabled}
      onQcmAnswered={onQcmAnswered}
      canMoveMascot={canMoveMascot}
      boardMovement={boardMovement}
      onDiceRollResult={onDiceRollResult}
      canRequestAction={canRequestAction}
      markerArrivalEnabled={markerArrivalEnabled}
      selectedTeamId={selectedTeamId}
      currentTeamId={currentTeamId}
      mascotStateMachine={mascotStateMachine}
      kingdomZones={kingdomZones}
      zoneMusicEnabled={zoneMusicEnabled}
      zoneMusicMuted={zoneMusicMuted}
      onZoneMusicToggle={onZoneMusicToggle}
      onWatchTeamPctChange={onWatchTeamPctChange}
      onZoneMusicUnlock={onZoneMusicUnlock}
      brandThemeStyle={brandThemeStyle}
      canSpellCast={canSpellCast}
      onLaunchSpell={onLaunchSpell}
      virtualDiceEnabled={virtualDiceEnabled}
      feuilletZones={feuilletZones}
      feuilletZoneEditMode={feuilletZoneEditMode}
      showPlateauMarkers={showPlateauMarkers}
      showPlateauZones={showPlateauZones}
      roster={roster}
      vitalityEnabled={vitalityEnabled}
      vitalityByPlayerId={vitalityByPlayerId}
      playerId={playerId}
    />
  );
}
