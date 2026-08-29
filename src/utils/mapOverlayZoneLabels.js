/**
 * Heuristiques d'affichage des libellés de zone (masquage adaptatif).
 */
import {
  MAP_OVERLAY_LABEL_COMPRESS_CHARS,
  MAP_OVERLAY_LABEL_MAX_SCREEN_PX,
  MAP_OVERLAY_LABEL_MAX_SCREEN_PX_COARSE,
  MAP_ZONE_LABEL_EMOJI_SIDE_FACTOR_RATIO,
  MAP_ZONE_LABEL_MIN_SIDE_FACTOR_DEFAULT,
  MAP_ZONE_LABEL_MIN_SIDE_FACTOR_MAX,
  MAP_ZONE_LABEL_MIN_SIDE_FACTOR_MIN,
} from '../shared/typographyTokens.js';

/**
 * Aire d'un polygone (coordonnées quelconques, signe conservé).
 * @param {Array<{ cx: number, cy: number }>} pts
 */
export function polygonAreaAbs(pts) {
  if (!pts || pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.cx * b.cy - b.cx * a.cy;
  }
  return Math.abs(sum) / 2;
}

/**
 * Borne le facteur « côté minimal en × hauteur de libellé » pour le masquage des noms de zone.
 * @param {unknown} raw
 * @param {number} [fallback]
 */
export function clampZoneLabelMinSideFactor(
  raw,
  fallback = MAP_ZONE_LABEL_MIN_SIDE_FACTOR_DEFAULT,
) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n * 10) / 10;
  return Math.min(
    MAP_ZONE_LABEL_MIN_SIDE_FACTOR_MAX,
    Math.max(MAP_ZONE_LABEL_MIN_SIDE_FACTOR_MIN, rounded),
  );
}

/**
 * Lit le réglage public `zone_label_min_side_factor` (admin).
 * @param {Record<string, unknown>|null|undefined} mapSettings
 */
export function resolveZoneLabelMinSideFactor(mapSettings) {
  const m = mapSettings && typeof mapSettings === 'object' ? mapSettings : {};
  return clampZoneLabelMinSideFactor(m.zone_label_min_side_factor);
}

/**
 * Aire apparente à l'écran (px²) d'une zone dont les points sont en % (xp, yp).
 * @param {{ pts: Array<{xp:number,yp:number}>, iw: number, ih: number, inv: number }} params
 */
export function computeZoneScreenArea({ pts, iw, ih, inv }) {
  if (!pts || pts.length < 3 || !(iw > 0) || !(ih > 0)) return 0;
  const wp = pts.map((p) => ({ cx: (p.xp / 100) * iw, cy: (p.yp / 100) * ih }));
  const areaWorld = polygonAreaAbs(wp);
  const worldScale = inv > 0 ? 1 / inv : 1;
  return areaWorld * worldScale * worldScale;
}

/**
 * @param {number} areaScreen
 * @param {number} apparentPx taille apparente (px écran)
 * @param {number} sideFactor côté minimal ≈ facteur × apparentPx
 */
function meetsMinLabelArea(areaScreen, apparentPx, sideFactor) {
  if (!(areaScreen > 0) || !(apparentPx > 0) || !(sideFactor > 0)) return false;
  const minArea = (apparentPx * sideFactor) ** 2;
  return areaScreen >= minArea;
}

/**
 * Indique si le nom de zone doit s'afficher (zone assez grande à l'écran).
 *
 * @param {{ pts: Array<{xp:number,yp:number}>, iw: number, ih: number, inv: number, labelFontPx: number, minSideFactor?: number }} params
 */
export function shouldShowZoneNameLabel({
  pts,
  iw,
  ih,
  inv,
  labelFontPx,
  minSideFactor = MAP_ZONE_LABEL_MIN_SIDE_FACTOR_DEFAULT,
}) {
  if (!pts || pts.length < 3 || !(iw > 0) || !(ih > 0)) return false;
  const factor = clampZoneLabelMinSideFactor(minSideFactor);
  const areaScreen = computeZoneScreenArea({ pts, iw, ih, inv });
  const labelApparentPx = Math.max(1, labelFontPx * (inv > 0 ? 1 / inv : 1));
  return meetsMinLabelArea(areaScreen, labelApparentPx, factor);
}

/**
 * Indique si l'emoji de zone doit s'afficher (seuil plus bas que le nom).
 *
 * @param {{ pts: Array<{xp:number,yp:number}>, iw: number, ih: number, inv: number, emojiFontPx: number, minSideFactor?: number }} params
 */
export function shouldShowZoneEmojiLabel({
  pts,
  iw,
  ih,
  inv,
  emojiFontPx,
  minSideFactor = MAP_ZONE_LABEL_MIN_SIDE_FACTOR_DEFAULT,
}) {
  if (!pts || pts.length < 3 || !(iw > 0) || !(ih > 0)) return false;
  const factor = clampZoneLabelMinSideFactor(minSideFactor);
  const emojiFactor = Math.max(1, factor * MAP_ZONE_LABEL_EMOJI_SIDE_FACTOR_RATIO);
  const areaScreen = computeZoneScreenArea({ pts, iw, ih, inv });
  const emojiApparentPx = Math.max(1, emojiFontPx * (inv > 0 ? 1 / inv : 1));
  return meetsMinLabelArea(areaScreen, emojiApparentPx, emojiFactor);
}

/**
 * Largeur max (unités monde) pour un libellé long.
 * @param {number} inv inverse échelle monde
 * @param {number} [maxScreenPx]
 */
export function zoneLabelMaxTextLengthWorld(inv, maxScreenPx = MAP_OVERLAY_LABEL_MAX_SCREEN_PX) {
  const screenPx = Number(maxScreenPx) > 0 ? Number(maxScreenPx) : MAP_OVERLAY_LABEL_MAX_SCREEN_PX;
  return Math.max(24, screenPx * (inv > 0 ? inv : 1));
}

/**
 * Paramètres communs libellés zones + repères (compression, largeur max).
 * @param {Record<string, unknown>|null|undefined} mapSettings
 * @param {{ inv?: number, isCoarsePointer?: boolean }} [options]
 */
export function resolveMapOverlayLabelLayout(mapSettings, options = {}) {
  const inv = Number(options.inv) > 0 ? Number(options.inv) : 1;
  const maxScreenPx = options.isCoarsePointer
    ? MAP_OVERLAY_LABEL_MAX_SCREEN_PX_COARSE
    : MAP_OVERLAY_LABEL_MAX_SCREEN_PX;
  return {
    minSideFactor: resolveZoneLabelMinSideFactor(mapSettings),
    compressChars: MAP_OVERLAY_LABEL_COMPRESS_CHARS,
    maxScreenPx,
    maxWorldLength: zoneLabelMaxTextLengthWorld(inv, maxScreenPx),
  };
}

/**
 * @param {string} text
 * @param {number} [threshold]
 */
export function shouldCompressOverlayLabel(text, threshold = MAP_OVERLAY_LABEL_COMPRESS_CHARS) {
  return String(text || '').length > threshold;
}
