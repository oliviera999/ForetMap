import React from 'react';
import { GLBoardActionButton } from './GLBoardActionButton.jsx';
import { GLVirtualDiceDock } from './GLVirtualDiceDock.jsx';
import { GLZoneMusicMuteButton } from './GLZoneMusicMuteButton.jsx';
import { GLBoardTurnHud } from './GLBoardTurnHud.jsx';

/**
 * Chrome superposé à la carte plateau : outils (coins), barre mobile (actions),
 * bouton fermer plein écran.
 */
export function GLBoardChrome({
  mapFullscreen = false,
  onCloseFullscreen,
  canSpellCast = false,
  onLaunchSpell,
  onOpenFullscreen,
  virtualDiceEnabled = false,
  onRollResult = null,
  gameId = null,
  themeStyle = null,
  boardShellRef = null,
  zoneMusicEnabled = false,
  zoneMusicMuted = false,
  onZoneMusicToggle,
  turnsEnabled = false,
  roundNumber = 0,
  canManageTurn = false,
  onNextTurn = null,
  nextTurnBusy = false,
  activeTeamRolled = false,
  activeTeamName = null,
  canRollDice = true,
  disableDiceReroll = false,
  onRecordDiceRoll = null,
  arrivalPopoverOpen = false,
}) {
  return (
    <>
      {mapFullscreen ? (
        <GLBoardActionButton
          role="display"
          className="gl-map-fullscreen-close"
          icon="✕"
          label="Fermer"
          testId="gl-map-fullscreen-close"
          ariaLabel="Quitter le plein écran"
          onClick={onCloseFullscreen}
        />
      ) : null}

      {virtualDiceEnabled && gameId ? (
        <GLVirtualDiceDock
          themeStyle={themeStyle}
          enabled
          canRoll={canRollDice}
          disableReroll={disableDiceReroll}
          onRecordRoll={onRecordDiceRoll}
          onRollResult={onRollResult}
          boardShellRef={boardShellRef}
          forceClose={arrivalPopoverOpen}
        />
      ) : null}

      <GLBoardTurnHud
        turnsEnabled={turnsEnabled}
        roundNumber={roundNumber}
        canManageTurn={canManageTurn}
        onNextTurn={onNextTurn}
        nextTurnBusy={nextTurnBusy}
        activeTeamRolled={activeTeamRolled}
        activeTeamName={activeTeamName}
      />

      {!mapFullscreen ? (
        <div className="gl-board-chrome-bar" role="toolbar" aria-label="Actions carte">
          {canSpellCast ? (
            <GLBoardActionButton
              role="primary"
              icon="✨"
              label="Lancer un sortilège"
              labelShort="Sortilège"
              testId="gl-board-hud-spell"
              ariaLabel="Lancer un sortilège"
              onClick={() => onLaunchSpell?.()}
            />
          ) : null}
          <GLBoardActionButton
            role="display"
            icon="⛶"
            label="Plein écran"
            testId="gl-board-hud-fullscreen"
            ariaLabel="Afficher la carte en plein écran"
            onClick={onOpenFullscreen}
          />
        </div>
      ) : null}

      {zoneMusicEnabled ? (
        <div className="gl-board-chrome-dock gl-board-chrome-dock--right">
          <GLZoneMusicMuteButton visible muted={zoneMusicMuted} onToggle={onZoneMusicToggle} />
        </div>
      ) : null}
    </>
  );
}
