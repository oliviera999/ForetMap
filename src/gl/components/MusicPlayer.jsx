import React, { useEffect } from 'react';
import { useGLPlateauMusic } from '../hooks/useGLPlateauMusic.js';
import { GLZoneMusicMuteButton } from './GLZoneMusicMuteButton.jsx';

/**
 * Musique de plateau (intro + plateaux 1–5) — distincte de la musique de zone carte.
 */
export function MusicPlayer({
  enabled = true,
  plateauNumber = null,
  introActive = false,
  biomeSlug = null,
  biomeSaison = null,
  className = '',
}) {
  const { userMuted, toggleMuted, primeAudio } = useGLPlateauMusic({
    enabled,
    plateauNumber,
    introActive,
    biomeSlug,
    biomeSaison,
  });

  useEffect(() => {
    const unlock = () => primeAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, [primeAudio]);

  if (!enabled) return null;

  return (
    <div className={`gl-plateau-music ${className}`.trim()} aria-hidden>
      <GLZoneMusicMuteButton
        muted={userMuted}
        onToggle={toggleMuted}
        className="gl-plateau-music__toggle"
      />
    </div>
  );
}
