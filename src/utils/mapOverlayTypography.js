import {
  MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX,
  clampMapOverlaySizePercent,
  resolveMapOverlayBoardScale,
} from '../shared/mapOverlayScale.js';

/** Constantes par défaut (zones SVG + repères HTML). */
const DEFAULT_GAP = 16;
/** Marge minimale entre le bas visuel de l’emoji et le haut du libellé (px), une fois les demi-hauteurs retirées. */
const MIN_CENTER_GAP_EXTRA_PX = 4;
/** Tailles de référence à hauteur plateau {@link MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX} px et 100 %. */
const BASE_EMOJI_AT_REF = 19;
const BASE_LABEL_AT_REF = 14;

/**
 * Dérive tailles et espacement carte depuis `publicSettings.map` et la hauteur affichée du plan.
 * @param {Record<string, unknown>|null|undefined} mapSettings
 * @param {number} fitHeightPx hauteur affichée de l’image du plan (px)
 * @param {{ worldScale?: number }} [options] worldScale : facteur transform monde (carte tâches) ; défaut 1
 */
export function resolveMapOverlayTypography(mapSettings, fitHeightPx, options = {}) {
  const worldScale = Number(options.worldScale) > 0 ? Number(options.worldScale) : 1;
  const fit =
    Number(fitHeightPx) > 0 ? Number(fitHeightPx) : MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX;
  const m = mapSettings && typeof mapSettings === 'object' ? mapSettings : {};
  const gapRaw = Number(m.emoji_label_center_gap);
  const gap = Number.isFinite(gapRaw) ? Math.min(32, Math.max(6, Math.round(gapRaw))) : DEFAULT_GAP;
  const emPct = clampMapOverlaySizePercent(m.overlay_emoji_size_percent);
  const lbPct = clampMapOverlaySizePercent(m.overlay_label_size_percent);
  const emScale = resolveMapOverlayBoardScale({ fitHeightPx: fit, sizePercent: emPct });
  const lbScale = resolveMapOverlayBoardScale({ fitHeightPx: fit, sizePercent: lbPct });
  const gapScale = resolveMapOverlayBoardScale({ fitHeightPx: fit, sizePercent: 100 });

  const mapEmojiFontPx = Math.max(
    8,
    Math.round((BASE_EMOJI_AT_REF * emScale) / worldScale),
  );
  const mapLabelFontPx = Math.max(
    6,
    Math.round((BASE_LABEL_AT_REF * lbScale) / worldScale),
  );
  const minCenterGapPx = mapEmojiFontPx / 2 + mapLabelFontPx / 2 + MIN_CENTER_GAP_EXTRA_PX;
  const mapEmojiLabelCenterGap = Math.max(
    (gap * gapScale) / worldScale,
    minCenterGapPx,
  );
  const markerLabelMarginTop = mapEmojiLabelCenterGap - mapEmojiFontPx / 2 - mapLabelFontPx / 2;
  return {
    mapEmojiLabelCenterGap,
    mapEmojiFontPx,
    mapLabelFontPx,
    markerLabelMarginTop,
  };
}
