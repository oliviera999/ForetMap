import {
  MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX,
  clampMapOverlaySizePercent,
  resolveMapOverlayBoardScale,
} from '../shared/mapOverlayScale.js';

/** Constantes par défaut (zones SVG + repères HTML). */
const DEFAULT_GAP = 16;
/** Marge minimale entre le bas visuel de l’emoji et le haut du libellé (px-écran), une fois les demi-hauteurs retirées. */
const MIN_CENTER_GAP_EXTRA_PX = 4;
/** Tailles de référence (px-écran) à hauteur plateau {@link MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX} px et 100 %. */
const BASE_EMOJI_AT_REF = 19;
const BASE_LABEL_AT_REF = 14;
/** Planchers de taille apparente (px-écran) : garantissent un texte lisible même sur un petit plateau. */
const MIN_ONSCREEN_EMOJI_PX = 8;
const MIN_ONSCREEN_LABEL_PX = 6;
/** Grossissement par défaut des étiquettes au zoom (%) : 0 = taille apparente constante, 100 = linéaire. */
export const DEFAULT_ZOOM_GROWTH_PERCENT = 35;

/**
 * Borne le pourcentage de grossissement au zoom dans [0, 100] (→ exposant `g` ∈ [0, 1]).
 * Valeur non numérique → `fallback`.
 * @param {unknown} raw
 * @param {number} [fallback]
 */
export function clampZoomGrowthPercent(raw, fallback = DEFAULT_ZOOM_GROWTH_PERCENT) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * Dérive tailles et espacement carte depuis `publicSettings.map` et la hauteur affichée du plan.
 *
 * Les tailles sont calculées en **px-écran** à l’état « ajusté » (zoom au repos), puis :
 *  1. modulées par le **grossissement au zoom** : `apparent = base × zoomRatio^g`, où
 *     `g = overlay_zoom_growth_percent / 100` et `zoomRatio` = zoom courant / zoom au repos
 *     (`g = 0` → taille apparente constante ; `g = 1` → grossit linéairement avec le zoom) ;
 *  2. contre-échelonnées par `worldScale` pour repasser en unités du calque monde.
 * Les planchers protègent la lisibilité sur les petits plateaux.
 *
 * @param {Record<string, unknown>|null|undefined} mapSettings
 * @param {number} fitHeightPx hauteur affichée du plan **au repos** (px), indépendante du zoom
 * @param {{ worldScale?: number, zoomRatio?: number }} [options]
 *   worldScale : facteur transform du calque monde (défaut 1) ;
 *   zoomRatio : zoom courant / zoom au repos pour le grossissement (défaut = worldScale, repos = 1).
 */
export function resolveMapOverlayTypography(mapSettings, fitHeightPx, options = {}) {
  const worldScale = Number(options.worldScale) > 0 ? Number(options.worldScale) : 1;
  const zoomRatio = Number(options.zoomRatio) > 0 ? Number(options.zoomRatio) : worldScale;
  const fit = Number(fitHeightPx) > 0 ? Number(fitHeightPx) : MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX;
  const m = mapSettings && typeof mapSettings === 'object' ? mapSettings : {};
  const gapRaw = Number(m.emoji_label_center_gap);
  const gap = Number.isFinite(gapRaw) ? Math.min(32, Math.max(6, Math.round(gapRaw))) : DEFAULT_GAP;
  const emPct = clampMapOverlaySizePercent(m.overlay_emoji_size_percent);
  const lbPct = clampMapOverlaySizePercent(m.overlay_label_size_percent);
  const emScale = resolveMapOverlayBoardScale({ fitHeightPx: fit, sizePercent: emPct });
  const lbScale = resolveMapOverlayBoardScale({ fitHeightPx: fit, sizePercent: lbPct });
  const gapScale = resolveMapOverlayBoardScale({ fitHeightPx: fit, sizePercent: 100 });

  // Tailles apparentes de référence (px-écran au repos), bornées par les planchers de lisibilité.
  const baseEmoji = Math.max(MIN_ONSCREEN_EMOJI_PX, Math.round(BASE_EMOJI_AT_REF * emScale));
  const baseLabel = Math.max(MIN_ONSCREEN_LABEL_PX, Math.round(BASE_LABEL_AT_REF * lbScale));
  const minCenterGapPx = baseEmoji / 2 + baseLabel / 2 + MIN_CENTER_GAP_EXTRA_PX;
  const baseGap = Math.max(Math.round(gap * gapScale), minCenterGapPx);

  // Grossissement au zoom : taille apparente = base × zoomRatio^g.
  const growth = clampZoomGrowthPercent(m.overlay_zoom_growth_percent) / 100;
  const zoomFactor = zoomRatio > 0 ? zoomRatio ** growth : 1;

  // Contre-échelonnage vers les unités du calque monde : px-monde = px-écran / worldScale.
  const mapEmojiFontPx = (baseEmoji * zoomFactor) / worldScale;
  const mapLabelFontPx = (baseLabel * zoomFactor) / worldScale;
  const mapEmojiLabelCenterGap = (baseGap * zoomFactor) / worldScale;
  const markerLabelMarginTop = mapEmojiLabelCenterGap - mapEmojiFontPx / 2 - mapLabelFontPx / 2;
  return {
    mapEmojiLabelCenterGap,
    mapEmojiFontPx,
    mapLabelFontPx,
    markerLabelMarginTop,
  };
}
