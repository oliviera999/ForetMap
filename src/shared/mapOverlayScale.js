/** Hauteur affichée du plan à laquelle 100 % correspond au rendu de référence. */
export const MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX = 480;

export const MAP_OVERLAY_SIZE_PERCENT_DEFAULT = 100;
export const MAP_OVERLAY_SIZE_PERCENT_MIN = 50;
export const MAP_OVERLAY_SIZE_PERCENT_MAX = 200;

/**
 * Borne un pourcentage de taille overlay (repères / zones carte).
 * @param {unknown} raw
 * @param {number} [fallback]
 */
export function clampMapOverlaySizePercent(
  raw,
  fallback = MAP_OVERLAY_SIZE_PERCENT_DEFAULT,
) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(
    MAP_OVERLAY_SIZE_PERCENT_MAX,
    Math.max(MAP_OVERLAY_SIZE_PERCENT_MIN, Math.round(n)),
  );
}

/**
 * Facteur d’échelle repère/plateau : ratio constant taille repère / hauteur affichée du plan.
 * @param {{ fitHeightPx?: number, sizePercent?: unknown, referenceHeightPx?: number }} options
 */
export function resolveMapOverlayBoardScale({
  fitHeightPx = 0,
  sizePercent = MAP_OVERLAY_SIZE_PERCENT_DEFAULT,
  referenceHeightPx = MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX,
} = {}) {
  const ref = referenceHeightPx > 0 ? referenceHeightPx : MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX;
  const fit = fitHeightPx > 0 ? fitHeightPx : ref;
  const pct = clampMapOverlaySizePercent(sizePercent) / 100;
  return (fit / ref) * pct;
}

/**
 * Valeur CSS pour `--map-overlay-scale` (nombre, sans unité).
 * @param {Parameters<typeof resolveMapOverlayBoardScale>[0]} options
 */
export function resolveMapOverlayScaleCssValue(options) {
  const scale = resolveMapOverlayBoardScale(options);
  return String(Math.max(0.25, Math.min(3, scale)));
}

/**
 * Lit le pourcentage plateau depuis les réglages publics carte (ForetMap + GL).
 * @param {Record<string, unknown>|null|undefined} mapSettings
 */
export function readPlateauMarkerSizePercent(mapSettings) {
  const m = mapSettings && typeof mapSettings === 'object' ? mapSettings : {};
  const raw =
    m.plateau_marker_size_percent ??
    m.overlay_emoji_size_percent ??
    MAP_OVERLAY_SIZE_PERCENT_DEFAULT;
  return clampMapOverlaySizePercent(raw);
}
