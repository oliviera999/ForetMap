/** Constantes par défaut (zones SVG + repères HTML, `inv = 1/scale`). */
const DEFAULT_GAP = 14;
const BASE_EMOJI_MIN = 13;
const BASE_EMOJI_INV = 19;
const BASE_LABEL_MIN = 10;
const BASE_LABEL_INV = 14;

/**
 * Dérive tailles et espacement carte depuis `publicSettings.map` (fusion de `ui.map` côté App).
 * @param {Record<string, unknown>|null|undefined} mapSettings
 * @param {number} inv
 */
export function resolveMapOverlayTypography(mapSettings, inv) {
  const m = mapSettings && typeof mapSettings === 'object' ? mapSettings : {};
  const gapRaw = Number(m.emoji_label_center_gap);
  const gap = Number.isFinite(gapRaw)
    ? Math.min(32, Math.max(6, Math.round(gapRaw)))
    : DEFAULT_GAP;
  const emPctRaw = Number(m.overlay_emoji_size_percent);
  const emPct = Number.isFinite(emPctRaw)
    ? Math.min(150, Math.max(70, Math.round(emPctRaw))) / 100
    : 1;
  const lbPctRaw = Number(m.overlay_label_size_percent);
  const lbPct = Number.isFinite(lbPctRaw)
    ? Math.min(150, Math.max(70, Math.round(lbPctRaw))) / 100
    : 1;
  const mapEmojiLabelCenterGap = gap * inv;
  const mapEmojiFontPx = Math.max(
    8,
    Math.round(BASE_EMOJI_MIN * emPct),
    Math.round(BASE_EMOJI_INV * inv * emPct)
  );
  const mapLabelFontPx = Math.max(
    6,
    Math.round(BASE_LABEL_MIN * lbPct),
    Math.round(BASE_LABEL_INV * inv * lbPct)
  );
  const markerLabelMarginTop = mapEmojiLabelCenterGap - mapEmojiFontPx / 2 - mapLabelFontPx / 2;
  return {
    mapEmojiLabelCenterGap,
    mapEmojiFontPx,
    mapLabelFontPx,
    markerLabelMarginTop,
  };
}
