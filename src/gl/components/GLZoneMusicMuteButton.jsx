import React from 'react';
import { GLBoardActionButton } from './GLBoardActionButton.jsx';

export function GLZoneMusicMuteButton({ visible = true, muted = false, onToggle, className = '' }) {
  if (!visible) return null;
  return (
    <GLBoardActionButton
      role="tool"
      muted={muted}
      icon={muted ? '🔇' : '🎵'}
      label={muted ? 'Son off' : 'Son on'}
      testId="gl-zone-music-toggle"
      className={className}
      ariaPressed={muted}
      ariaLabel={muted ? 'Activer la musique des zones' : 'Couper la musique des zones'}
      title={muted ? 'Activer la musique des zones' : 'Couper la musique des zones'}
      onClick={onToggle}
    />
  );
}
