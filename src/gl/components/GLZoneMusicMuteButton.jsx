import React from 'react';

export function GLZoneMusicMuteButton({
  visible = false,
  muted = false,
  onToggle,
  className = '',
}) {
  if (!visible) return null;
  return (
    <button
      type="button"
      className={`gl-zone-music-toggle ${muted ? 'is-muted' : ''} ${className}`.trim()}
      data-testid="gl-zone-music-toggle"
      aria-pressed={muted}
      aria-label={muted ? 'Activer la musique des zones' : 'Couper la musique des zones'}
      title={muted ? 'Activer la musique des zones' : 'Couper la musique des zones'}
      onClick={onToggle}
    >
      <span className="gl-zone-music-toggle-icon" aria-hidden>
        {muted ? '🔇' : '🎵'}
      </span>
      <span className="gl-zone-music-toggle-label">{muted ? 'Son off' : 'Son on'}</span>
    </button>
  );
}
