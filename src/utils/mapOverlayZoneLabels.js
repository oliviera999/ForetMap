/**
 * Mise en page des libellés de zone et de repère (largeur maximale, ajustement d'un nom).
 *
 * Le masquage des noms ne se fait plus ici par seuil de surface : toutes les cartes passent par
 * le moteur d'anti-chevauchement du noyau (`src/shared/pct-map/pctMapLabels.js`).
 */
import {
  MAP_OVERLAY_LABEL_COMPRESS_CHARS,
  MAP_OVERLAY_LABEL_MAX_SCREEN_PX,
  MAP_OVERLAY_LABEL_MAX_SCREEN_PX_COARSE,
  MAP_ZONE_LABEL_MIN_SIDE_FACTOR_DEFAULT,
  MAP_ZONE_LABEL_MIN_SIDE_FACTOR_MAX,
  MAP_ZONE_LABEL_MIN_SIDE_FACTOR_MIN,
} from '../shared/typographyTokens.js';
import { AVG_CHAR_WIDTH_RATIO } from '../shared/pct-map/mapOverlayLabelCollision.js';

/**
 * Borne le facteur « côté minimal en × hauteur de libellé » (réglage admin conservé pour
 * compatibilité, sans effet sur l'affichage).
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

/**
 * Chasse moyenne estimée d'un caractère de libellé (em) — sans mesure DOM. Même valeur que le
 * moteur de collisions, sinon un nom jugé « tenant » par l'un était tronqué par l'autre.
 */
export const MAP_OVERLAY_LABEL_AVG_CHAR_EM = AVG_CHAR_WIDTH_RATIO;

/** Réduction maximale de la taille d'un nom trop long avant troncature (× la taille nominale). */
export const MAP_OVERLAY_LABEL_MIN_SHRINK = 0.8;

/**
 * Largeur estimée d'un libellé (mêmes unités que `fontSize`).
 * @param {string} text
 * @param {number} fontSize
 * @param {number} [avgCharEm]
 */
export function estimateOverlayLabelWidth(
  text,
  fontSize,
  avgCharEm = MAP_OVERLAY_LABEL_AVG_CHAR_EM,
) {
  const size = Number(fontSize) > 0 ? Number(fontSize) : 0;
  return Array.from(String(text || '')).length * size * avgCharEm;
}

/**
 * Ajuste un nom de zone à une largeur maximale **sans déformer les glyphes** :
 * 1) inchangé s'il tient ; 2) réduction de la taille, bornée à `minShrink` ;
 * 3) troncature avec « … » à la taille plancher.
 *
 * En SVG, `textLength` impose la longueur (ce n'est pas un maximum) : l'ancien couple
 * `textLength` + `lengthAdjust="spacingAndGlyphs"` étirait les noms courts et écrasait
 * les longs dès 13 caractères — deux zones voisines n'avaient jamais la même chasse.
 *
 * @param {{ text: string, fontSize: number, maxWidth: number, avgCharEm?: number, minShrink?: number }} params
 * @returns {{ text: string, fontSize: number, truncated: boolean }}
 */
export function fitOverlayLabelToWidth({
  text,
  fontSize,
  maxWidth,
  avgCharEm = MAP_OVERLAY_LABEL_AVG_CHAR_EM,
  minShrink = MAP_OVERLAY_LABEL_MIN_SHRINK,
}) {
  const str = String(text || '');
  const size = Number(fontSize) > 0 ? Number(fontSize) : 0;
  const max = Number(maxWidth) > 0 ? Number(maxWidth) : 0;
  if (!str || !(size > 0) || !(max > 0)) return { text: str, fontSize: size, truncated: false };
  const chars = Array.from(str);
  const naturalWidth = chars.length * size * avgCharEm;
  if (naturalWidth <= max) return { text: str, fontSize: size, truncated: false };
  const fittedSize = max / (chars.length * avgCharEm);
  const floorSize = size * minShrink;
  if (fittedSize >= floorSize) return { text: str, fontSize: fittedSize, truncated: false };
  const maxChars = Math.max(2, Math.floor(max / (floorSize * avgCharEm)));
  const kept = chars
    .slice(0, maxChars - 1)
    .join('')
    .trimEnd();
  return { text: `${kept}…`, fontSize: floorSize, truncated: true };
}
