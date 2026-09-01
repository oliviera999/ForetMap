import {
  MAP_OVERLAY_BASE_EMOJI_AT_REF,
  MAP_OVERLAY_BASE_LABEL_AT_REF,
  MAP_OVERLAY_CHROME_LABEL_MIN_RATIO,
  MAP_OVERLAY_COARSE_POINTER_MULTIPLIER,
  MAP_OVERLAY_LABEL_MAX_SCREEN_PX,
  MAP_OVERLAY_LABEL_MAX_SCREEN_PX_COARSE,
  MAP_OVERLAY_MIN_ONSCREEN_EMOJI_PX,
  MAP_OVERLAY_MIN_ONSCREEN_LABEL_PX,
  MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX,
  MAP_TOOLBAR_REF_FONT_PX,
} from '../shared/typographyTokens.js';
import {
  clampMapOverlaySizePercent,
  readPlateauMarkerSizePercent,
  resolveMapOverlayBoardScale,
  resolveMapOverlayScaleCssValue,
} from '../shared/mapOverlayScale.js';

/** Constantes par défaut (zones SVG + repères HTML). */
const DEFAULT_GAP = 16;
/** Marge minimale entre le bas visuel de l'emoji et le haut du libellé (px-écran), une fois les demi-hauteurs retirées. */
const MIN_CENTER_GAP_EXTRA_PX = 4;
/** Grossissement par défaut des étiquettes au zoom (%) : 0 = taille apparente constante, 100 = linéaire. */
export const DEFAULT_ZOOM_GROWTH_PERCENT = 35;

export {
  MAP_OVERLAY_BASE_EMOJI_AT_REF,
  MAP_OVERLAY_BASE_LABEL_AT_REF,
  MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX,
};

/**
 * Borne le pourcentage de grossissement au zoom dans [0, 100] (→ exposant `g` ∈ [0, 1]).
 * @param {unknown} raw
 * @param {number} [fallback]
 */
export function clampZoomGrowthPercent(raw, fallback = DEFAULT_ZOOM_GROWTH_PERCENT) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * Facteur plateau tenant compte hauteur et largeur affichées (prend le plus contraignant).
 * @param {number} fitHeightPx
 * @param {number} [fitWidthPx]
 * @param {number} sizePercent
 */
function resolveOverlayBoardScaleMinAxis(fitHeightPx, fitWidthPx, sizePercent) {
  const heightScale = resolveMapOverlayBoardScale({ fitHeightPx, sizePercent });
  if (!(Number(fitWidthPx) > 0)) return heightScale;
  const widthScale = resolveMapOverlayBoardScale({
    fitHeightPx: fitWidthPx,
    sizePercent,
  });
  return Math.min(heightScale, widthScale);
}

/**
 * Dérive tailles et espacement carte depuis `publicSettings.map` et la hauteur affichée du plan.
 *
 * @param {Record<string, unknown>|null|undefined} mapSettings
 * @param {number} fitHeightPx hauteur affichée du plan **au repos** (px)
 * @param {{ worldScale?: number, zoomRatio?: number, fitWidthPx?: number, isCoarsePointer?: boolean, userTextSizePercent?: number }} [options]
 */
export function resolveMapOverlayTypography(mapSettings, fitHeightPx, options = {}) {
  const worldScale = Number(options.worldScale) > 0 ? Number(options.worldScale) : 1;
  const zoomRatio = Number(options.zoomRatio) > 0 ? Number(options.zoomRatio) : worldScale;
  const fit = Number(fitHeightPx) > 0 ? Number(fitHeightPx) : MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX;
  const fitWidthPx = Number(options.fitWidthPx) > 0 ? Number(options.fitWidthPx) : 0;
  const coarseMult = options.isCoarsePointer ? MAP_OVERLAY_COARSE_POINTER_MULTIPLIER : 1;
  const userMult =
    Number(options.userTextSizePercent) > 0 ? Number(options.userTextSizePercent) / 100 : 1;
  const m = mapSettings && typeof mapSettings === 'object' ? mapSettings : {};
  const gapRaw = Number(m.emoji_label_center_gap);
  const gap = Number.isFinite(gapRaw) ? Math.min(32, Math.max(6, Math.round(gapRaw))) : DEFAULT_GAP;
  const emPct = clampMapOverlaySizePercent(m.overlay_emoji_size_percent);
  const lbPct = clampMapOverlaySizePercent(m.overlay_label_size_percent);

  const emScale = resolveOverlayBoardScaleMinAxis(fit, fitWidthPx, emPct) * coarseMult * userMult;
  const lbScale = resolveOverlayBoardScaleMinAxis(fit, fitWidthPx, lbPct) * coarseMult * userMult;
  const gapScale = resolveOverlayBoardScaleMinAxis(fit, fitWidthPx, 100);

  const minLabelFromChrome = Math.ceil(
    MAP_TOOLBAR_REF_FONT_PX * MAP_OVERLAY_CHROME_LABEL_MIN_RATIO,
  );

  // Plancher appliqué au couple (facteur commun) : le ratio emoji/libellé reste constant
  // sur les petits plans. Pas d'arrondi ici : arrondir avant la division par worldScale
  // faisait sauter les tailles d'1 px monde entier à chaque redimensionnement.
  const rawEmoji = Math.max(0.001, MAP_OVERLAY_BASE_EMOJI_AT_REF * emScale);
  const rawLabel = Math.max(0.001, MAP_OVERLAY_BASE_LABEL_AT_REF * lbScale);
  const floorFactor = Math.max(
    1,
    MAP_OVERLAY_MIN_ONSCREEN_EMOJI_PX / rawEmoji,
    MAP_OVERLAY_MIN_ONSCREEN_LABEL_PX / rawLabel,
    minLabelFromChrome / rawLabel,
  );
  const baseEmoji = rawEmoji * floorFactor;
  const baseLabel = rawLabel * floorFactor;
  const minCenterGapPx = baseEmoji / 2 + baseLabel / 2 + MIN_CENTER_GAP_EXTRA_PX;
  const baseGap = Math.max(gap * gapScale, minCenterGapPx);

  const growth = clampZoomGrowthPercent(m.overlay_zoom_growth_percent) / 100;
  const zoomFactor = zoomRatio > 0 ? zoomRatio ** growth : 1;

  const mapEmojiFontPx = (baseEmoji * zoomFactor) / worldScale;
  const mapLabelFontPx = (baseLabel * zoomFactor) / worldScale;
  const mapEmojiLabelCenterGap = (baseGap * zoomFactor) / worldScale;
  const markerLabelMarginTop = mapEmojiLabelCenterGap - mapEmojiFontPx / 2 - mapLabelFontPx / 2;
  return {
    mapEmojiLabelCenterGap,
    mapEmojiFontPx,
    mapLabelFontPx,
    markerLabelMarginTop,
    baseEmojiApparentPx: baseEmoji * zoomFactor,
    baseLabelApparentPx: baseLabel * zoomFactor,
    /** Facteur px-écran → px-monde dans un calque zoomé (croissance douce incluse). */
    zoomCompensation: zoomFactor / worldScale,
    worldScale,
  };
}

/**
 * Typo pour repères HTML sur calque fit (Visite / GL) : font-size local + `--map-overlay-scale`.
 * Évite le double grossissement plateau (scale CSS × font).
 *
 * @param {Record<string, unknown>|null|undefined} mapSettings
 * @param {number} fitHeightPx
 * @param {Parameters<typeof resolveMapOverlayTypography>[2] & { compensateWorldScale?: boolean }} [options]
 */
export function resolveMapOverlayMarkerCssTypography(mapSettings, fitHeightPx, options = {}) {
  const fit = Number(fitHeightPx) > 0 ? Number(fitHeightPx) : MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX;
  const sizePercent = readPlateauMarkerSizePercent(mapSettings);
  const overlayScale = resolveMapOverlayScaleCssValue({ fitHeightPx: fit, sizePercent });
  const scaleNum = Math.max(0.001, parseFloat(overlayScale) || 1);
  // `compensateWorldScale` : les repères vivent DANS le calque zoomé (Visite) — on divise
  // par l'échelle monde et on applique la même croissance douce que les noms de zones,
  // au lieu de laisser les repères doubler linéairement pendant que les zones font ×1,27.
  const compensate = Boolean(options.compensateWorldScale);
  const t = resolveMapOverlayTypography(mapSettings, fit, {
    ...options,
    worldScale: compensate && Number(options.worldScale) > 0 ? Number(options.worldScale) : 1,
    zoomRatio: compensate ? options.zoomRatio : 1,
  });
  return {
    overlayScale,
    emojiFontSizePx: t.mapEmojiFontPx / scaleNum,
    labelFontSizePx: t.mapLabelFontPx / scaleNum,
    labelGapPx: t.mapEmojiLabelCenterGap / scaleNum,
    labelMarginTopPx: t.markerLabelMarginTop / scaleNum,
    zoomCompensation: t.zoomCompensation,
    worldInv: t.worldScale > 0 ? 1 / t.worldScale : 1,
  };
}

/**
 * Variables CSS `--map-overlay-*` pour calques fit (ForetMap repères optionnels, Visite, GL).
 * @param {Record<string, unknown>|null|undefined} mapSettings
 * @param {number} fitHeightPx
 * @param {Parameters<typeof resolveMapOverlayMarkerCssTypography>[2]} [options]
 */
export function resolveMapOverlayCssVariables(mapSettings, fitHeightPx, options = {}) {
  const css = resolveMapOverlayMarkerCssTypography(mapSettings, fitHeightPx, options);
  const maxScreenPx = options.isCoarsePointer
    ? MAP_OVERLAY_LABEL_MAX_SCREEN_PX_COARSE
    : MAP_OVERLAY_LABEL_MAX_SCREEN_PX;
  // Dans un calque zoomé, la largeur max et les éléments à taille fixe (pastilles) suivent
  // la même compensation que les polices, sinon leurs rapports changent pendant le zoom.
  const maxWidthPx = options.compensateWorldScale
    ? maxScreenPx * css.zoomCompensation
    : maxScreenPx;
  return {
    '--map-overlay-scale': css.overlayScale,
    '--map-overlay-emoji-font-size': `${css.emojiFontSizePx}px`,
    '--map-overlay-label-font-size': `${css.labelFontSizePx}px`,
    '--map-overlay-label-gap': `${css.labelGapPx}px`,
    '--map-overlay-label-margin-top': `${css.labelMarginTopPx}px`,
    '--map-overlay-label-max-width': `${maxWidthPx}px`,
    '--map-overlay-world-inv': String(css.worldInv),
  };
}
