import React from 'react';

export function GLGameBoardHud({
  chapterTitle,
  canSpellCast,
  onLaunchSpell,
  onOpenFullscreen,
}) {
  return (
    <>
      <div className="gl-game-board-head">
        <h2>{chapterTitle || 'Carte de jeu'}</h2>
        <div className="gl-game-board-head__actions">
          {canSpellCast ? (
            <button
              type="button"
              className="gl-btn gl-btn--secondary"
              onClick={() => onLaunchSpell?.()}
            >
              Lancer un sortilège
            </button>
          ) : null}
          <button
            type="button"
            className="gl-map-fullscreen-open"
            data-testid="gl-map-fullscreen-open"
            aria-label="Afficher la carte en plein écran"
            onClick={onOpenFullscreen}
          >
            <span aria-hidden>⛶</span> Plein écran
          </button>
        </div>
      </div>
      <div className="gl-board-hud" role="toolbar" aria-label="Actions carte">
        {canSpellCast ? (
          <button
            type="button"
            className="gl-board-hud__btn gl-board-hud__btn--primary"
            aria-label="Lancer un sortilège"
            onClick={() => onLaunchSpell?.()}
          >
            <span aria-hidden>✨</span>
            <span className="gl-board-hud__label--long">Sortilège</span>
          </button>
        ) : null}
        <button
          type="button"
          className="gl-board-hud__btn"
          data-testid="gl-board-hud-fullscreen"
          aria-label="Afficher la carte en plein écran"
          onClick={onOpenFullscreen}
        >
          <span aria-hidden>⛶</span>
          <span>Plein écran</span>
        </button>
      </div>
    </>
  );
}
