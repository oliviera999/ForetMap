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

/**
 * Masquage adaptatif des noms de zone : côté minimal ≈ facteur × hauteur du libellé (px écran).
 * 2,5 = défaut (moins agressif que l'ancien 4) ; plus bas = noms visibles sur des zones plus petites.
 */
export const MAP_ZONE_LABEL_MIN_SIDE_FACTOR_DEFAULT = 2.5;
export const MAP_ZONE_LABEL_MIN_SIDE_FACTOR_MIN = 1;
export const MAP_ZONE_LABEL_MIN_SIDE_FACTOR_MAX = 6;

/** Seuil emoji : facteur nom × ce ratio (emoji visible sur des zones plus petites que le nom). */
export const MAP_ZONE_LABEL_EMOJI_SIDE_FACTOR_RATIO = 0.55;

/** Au-delà de ce nombre de caractères, le libellé est compressé / ellipsé (zones et repères). */
export const MAP_OVERLAY_LABEL_COMPRESS_CHARS = 12;

/** Largeur max apparente des noms (px écran) — repères HTML et compression SVG. */
export const MAP_OVERLAY_LABEL_MAX_SCREEN_PX = 96;
export const MAP_OVERLAY_LABEL_MAX_SCREEN_PX_COARSE = 128;
