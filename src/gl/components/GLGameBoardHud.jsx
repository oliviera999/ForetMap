import React from 'react';
import { GLBoardActionButton } from './GLBoardActionButton.jsx';

export function GLGameBoardHud({ chapterTitle, canSpellCast, onLaunchSpell, onOpenFullscreen }) {
  return (
    <div className="gl-game-board-head">
      <h2>{chapterTitle || 'Carte de jeu'}</h2>
      <div className="gl-game-board-head__actions">
        {canSpellCast ? (
          <GLBoardActionButton
            role="primary"
            icon="✨"
            label="Lancer un sortilège"
            testId="gl-board-header-spell"
            ariaLabel="Lancer un sortilège"
            onClick={() => onLaunchSpell?.()}
          />
        ) : null}
        <GLBoardActionButton
          role="display"
          icon="⛶"
          label="Plein écran"
          testId="gl-map-fullscreen-open"
          ariaLabel="Afficher la carte en plein écran"
          onClick={onOpenFullscreen}
        />
      </div>
    </div>
  );
}
