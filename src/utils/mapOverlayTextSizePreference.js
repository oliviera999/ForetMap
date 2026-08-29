import {
  MAP_TEXT_SIZE_LEVEL_ORDER,
  MAP_TEXT_SIZE_LEVELS,
  MAP_TEXT_SIZE_STORAGE_KEY,
} from '../shared/typographyTokens.js';
import { safeLocalStorageGetItem, safeLocalStorageSetItem } from './browserStorage.js';

/**
 * @returns {keyof typeof MAP_TEXT_SIZE_LEVELS}
 */
export function readMapOverlayTextSizeLevel() {
  const raw = safeLocalStorageGetItem(MAP_TEXT_SIZE_STORAGE_KEY);
  if (raw && MAP_TEXT_SIZE_LEVEL_ORDER.includes(raw)) return raw;
  return 'normal';
}

/**
 * @param {keyof typeof MAP_TEXT_SIZE_LEVELS} level
 */
export function writeMapOverlayTextSizeLevel(level) {
  if (!MAP_TEXT_SIZE_LEVEL_ORDER.includes(level)) return;
  safeLocalStorageSetItem(MAP_TEXT_SIZE_STORAGE_KEY, level);
}

/** @returns {number} pourcentage 100 | 125 | 150 */
export function readMapOverlayTextSizePercent() {
  return MAP_TEXT_SIZE_LEVELS[readMapOverlayTextSizeLevel()] ?? 100;
}

/**
 * @param {keyof typeof MAP_TEXT_SIZE_LEVELS} [level]
 * @returns {keyof typeof MAP_TEXT_SIZE_LEVELS}
 */
export function cycleMapOverlayTextSizeLevel(level = readMapOverlayTextSizeLevel()) {
  const idx = MAP_TEXT_SIZE_LEVEL_ORDER.indexOf(level);
  const next = MAP_TEXT_SIZE_LEVEL_ORDER[(idx + 1) % MAP_TEXT_SIZE_LEVEL_ORDER.length];
  writeMapOverlayTextSizeLevel(next);
  return next;
}

/** Libellé court pour la toolbar. */
export function mapOverlayTextSizeLevelLabel(level) {
  if (level === 'large') return 'Aa+';
  if (level === 'xlarge') return 'Aa++';
  return 'Aa';
}
