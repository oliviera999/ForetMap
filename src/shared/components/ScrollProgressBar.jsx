import React from 'react';
import { useScrollProgress } from '../hooks/useScrollProgress.js';

/** Barre de progression de scroll en haut de page (pattern index_olution). */
export function ScrollProgressBar({ className = 'scroll-progress' }) {
  const { progress } = useScrollProgress('window');
  const widthPct = `${Math.round(progress * 10000) / 100}%`;

  return (
    <div
      className={className}
      style={{ width: widthPct }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      aria-label="Progression de lecture"
    />
  );
}
