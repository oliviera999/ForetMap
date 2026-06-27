import {
  MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX,
  clampMapOverlaySizePercent,
  resolveMapOverlayBoardScale,
} from '../shared/mapOverlayScale.js';

/** Constantes par défaut (zones SVG + repères HTML). */
const DEFAULT_GAP = 16;
/** Marge minimale entre le bas visuel de l’emoji et le haut du libellé (px-écran), une fois les demi-hauteurs retirées. */
const MIN_CENTER_GAP_EXTRA_PX = 4;
/**
 * Tailles de référence (px-écran) à hauteur plateau {@link MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX} px et 100 %.
 * Volontairement réduites (≈ −10 %) pour des étiquettes plus discrètes et lisibles sur les plans denses.
 */
const BASE_EMOJI_AT_REF = 17;
const BASE_LABEL_AT_REF = 12;
/** Planchers de taille apparente (px-écran) : garantissent un texte lisible même sur un petit plateau. */
const MIN_ONSCREEN_EMOJI_PX = 8;
const MIN_ONSCREEN_LABEL_PX = 6;

/**
 * Dérive tailles et espacement carte depuis `publicSettings.map` et la hauteur affichée du plan.
 *
 * Toutes les tailles sont d’abord calculées en **px-écran** (indépendantes du zoom),
 * puis contre-échelonnées par `worldScale` pour obtenir les unités du calque monde.
 * Résultat : la taille apparente des étiquettes reste **constante quel que soit le zoom**
 * (elles ne « gonflent » plus en zoomant), tandis que les planchers protègent la lisibilité
 * sur les petits plateaux sans réintroduire ce gonflement.
 *
 * @param {Record<string, unknown>|null|undefined} mapSettings
 * @param {number} fitHeightPx hauteur affichée de l’image du plan (px)
 * @param {{ worldScale?: number }} [options] worldScale : facteur transform monde (carte tâches) ; défaut 1
 */
export function resolveMapOverlayTypography(mapSettings, fitHeightPx, options = {}) {
  const worldScale = Number(options.worldScale) > 0 ? Number(options.worldScale) : 1;
  const fit = Number(fitHeightPx) > 0 ? Number(fitHeightPx) : MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX;
  const m = mapSettings && typeof mapSettings === 'object' ? mapSettings : {};
  const gapRaw = Number(m.emoji_label_center_gap);
  const gap = Number.isFinite(gapRaw) ? Math.min(32, Math.max(6, Math.round(gapRaw))) : DEFAULT_GAP;
  const emPct = clampMapOverlaySizePercent(m.overlay_emoji_size_percent);
  const lbPct = clampMapOverlaySizePercent(m.overlay_label_size_percent);
  const emScale = resolveMapOverlayBoardScale({ fitHeightPx: fit, sizePercent: emPct });
  const lbScale = resolveMapOverlayBoardScale({ fitHeightPx: fit, sizePercent: lbPct });
  const gapScale = resolveMapOverlayBoardScale({ fitHeightPx: fit, sizePercent: 100 });

  // Tailles apparentes (px-écran), bornées par les planchers de lisibilité.
  const onScreenEmoji = Math.max(MIN_ONSCREEN_EMOJI_PX, Math.round(BASE_EMOJI_AT_REF * emScale));
  const onScreenLabel = Math.max(MIN_ONSCREEN_LABEL_PX, Math.round(BASE_LABEL_AT_REF * lbScale));
  const minCenterGapPx = onScreenEmoji / 2 + onScreenLabel / 2 + MIN_CENTER_GAP_EXTRA_PX;
  const onScreenGap = Math.max(Math.round(gap * gapScale), minCenterGapPx);

  // Contre-échelonnage : on divise par worldScale pour repasser en unités du calque monde.
  const mapEmojiFontPx = onScreenEmoji / worldScale;
  const mapLabelFontPx = onScreenLabel / worldScale;
  const mapEmojiLabelCenterGap = onScreenGap / worldScale;
  const markerLabelMarginTop = mapEmojiLabelCenterGap - mapEmojiFontPx / 2 - mapLabelFontPx / 2;
  return {
    mapEmojiLabelCenterGap,
    mapEmojiFontPx,
    mapLabelFontPx,
    markerLabelMarginTop,
  };
}
