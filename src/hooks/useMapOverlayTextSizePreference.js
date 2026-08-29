import { useCallback, useState } from 'react';
import { MAP_TEXT_SIZE_LEVELS } from '../shared/typographyTokens.js';
import {
  cycleMapOverlayTextSizeLevel,
  mapOverlayTextSizeLevelLabel,
  readMapOverlayTextSizeLevel,
} from '../utils/mapOverlayTextSizePreference.js';

/**
 * Préférence locale « taille du texte sur la carte » (localStorage).
 */
export function useMapOverlayTextSizePreference() {
  const [level, setLevel] = useState(() => readMapOverlayTextSizeLevel());
  const percent = MAP_TEXT_SIZE_LEVELS[level] ?? 100;
  const cycle = useCallback(() => {
    setLevel(cycleMapOverlayTextSizeLevel());
  }, []);
  const label = mapOverlayTextSizeLevelLabel(level);
  return { level, percent, label, cycle };
}
