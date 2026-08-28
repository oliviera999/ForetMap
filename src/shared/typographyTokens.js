/**
 * Tokens typographiques partagés (UI + overlays carte).
 * Les valeurs px overlay sont liées à {@link MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX}.
 */
import { MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX } from './mapOverlayScale.js';

export { MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX };

/** Tailles de référence (px-écran) à hauteur plateau 480 px et 100 %. */
export const MAP_OVERLAY_BASE_EMOJI_AT_REF = 19;
export const MAP_OVERLAY_BASE_LABEL_AT_REF = 14;

/** Planchers de taille apparente (px-écran). */
export const MAP_OVERLAY_MIN_ONSCREEN_EMOJI_PX = 13;
export const MAP_OVERLAY_MIN_ONSCREEN_LABEL_PX = 11;

/** Taille de référence toolbar compacte (px) pour le ratio chrome / overlay. */
export const MAP_TOOLBAR_REF_FONT_PX = 12;

/** Libellé carte ≥ toolbar × ce ratio (évite une hiérarchie inversée). */
export const MAP_OVERLAY_CHROME_LABEL_MIN_RATIO = 0.9;

/** Multiplicateur typo sur pointeur grossier (tablette / mobile). */
export const MAP_OVERLAY_COARSE_POINTER_MULTIPLIER = 1.2;

/** Niveaux préférence locale « taille du texte sur la carte » (%). */
export const MAP_TEXT_SIZE_LEVELS = Object.freeze({
  normal: 100,
  large: 125,
  xlarge: 150,
});

export const MAP_TEXT_SIZE_LEVEL_ORDER = Object.freeze(['normal', 'large', 'xlarge']);

export const MAP_TEXT_SIZE_STORAGE_KEY = 'foretmap.mapOverlayTextSizeLevel';
