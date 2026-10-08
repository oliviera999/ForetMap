/**
 * Géométrie des effets du « zoom sur le lieu » (`PctPlaceFocusFx`) — fonctions pures.
 *
 * Les effets vivent dans le calque « fit » de la carte, celui que la caméra met à l'échelle :
 * ils suivent le lieu sans calcul de position, mais grossissent avec la vue. Les échelles CSS
 * calculées ici compensent donc l'échelle de la caméra (`fromScale` → `toScale`) pour obtenir
 * la taille **à l'écran** voulue.
 */

import { placeFocusTarget } from './placeFocusTarget.js';

/** Taille à l'écran de l'emoji au plus fort de l'effet, en multiples de sa taille normale. */
const BURST_MIN = 4;
const BURST_MAX = 9;
/** L'emoji s'envole nettement plus vite que le lieu ne grossit. */
const BURST_OVER_ZOOM = 1.8;
/** Rayon à l'écran du halo du projecteur autour d'un repère (px). */
export const SPOTLIGHT_MARKER_RADIUS_PX = 56;

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function positive(n, fallback = 1) {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/**
 * Point d'ancrage de l'effet : le repère lui-même, ou le centre d'une zone (centroïde du
 * polygone, à défaut moyenne des points).
 * @returns {{ xp: number, yp: number }|null}
 */
export function placeFocusFxAnchor(place) {
  const target = placeFocusTarget(place, { maxZoom: 2 });
  if (!target) return null;
  const pts = target.points;
  if (pts.length === 1) return { ...pts[0] };
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const cross = a.xp * b.yp - b.xp * a.yp;
    area += cross;
    cx += (a.xp + b.xp) * cross;
    cy += (a.yp + b.yp) * cross;
  }
  if (Math.abs(area) > 1e-9) return { xp: cx / (3 * area), yp: cy / (3 * area) };
  const n = pts.length;
  return {
    xp: pts.reduce((s, p) => s + p.xp, 0) / n,
    yp: pts.reduce((s, p) => s + p.yp, 0) / n,
  };
}

/**
 * Échelles CSS (début → fin) de la copie d'emoji, caméra compensée.
 *
 * - `in` (zoom) : part de la taille normale et **s'envole** jusqu'à 4 à 9 fois sa taille à
 *   l'écran, en s'effaçant.
 * - `out` (dézoom) : l'inverse — arrive grande et transparente, et **atterrit** à sa taille
 *   normale au moment où la vue d'avant est rétablie.
 *
 * @param {{ phase: 'in'|'out', fromScale: number, toScale: number }} fx
 * @returns {{ k0: number, k1: number }}
 */
export function placeFocusBurstScales({ phase, fromScale, toScale }) {
  const from = positive(fromScale);
  const to = positive(toScale);
  if (phase === 'out') {
    const big = clamp(BURST_OVER_ZOOM * (from / to), BURST_MIN, BURST_MAX);
    return { k0: big / from, k1: 1 / to };
  }
  const big = clamp(BURST_OVER_ZOOM * (to / from), BURST_MIN, BURST_MAX);
  return { k0: 1 / from, k1: big / to };
}

function fmt(n) {
  return Number(n.toFixed(3));
}

/**
 * Chemin SVG du voile du projecteur, dans le repère `viewBox="0 0 100 100"` étiré sur le
 * calque : tout le plan, percé (règle `evenodd`) à la forme de la zone, ou d'un cercle à
 * l'écran autour d'un repère.
 *
 * @param {object} place
 * @param {{ fitWidth: number, fitHeight: number, holeScale: number }} options
 *   `holeScale` : échelle de la caméra une fois le lieu cadré (le cercle y fait
 *   `SPOTLIGHT_MARKER_RADIUS_PX` à l'écran).
 * @returns {string} `''` si le lieu n'a pas de géométrie.
 */
export function placeFocusSpotlightPath(place, { fitWidth, fitHeight, holeScale }) {
  const target = placeFocusTarget(place, { maxZoom: 2 });
  if (!target) return '';
  const outer = 'M0 0H100V100H0Z';
  if (target.kind === 'zone' && target.points.length >= 3) {
    const [first, ...rest] = target.points;
    const hole = `M${fmt(first.xp)} ${fmt(first.yp)}${rest
      .map((p) => `L${fmt(p.xp)} ${fmt(p.yp)}`)
      .join('')}Z`;
    return `${outer}${hole}`;
  }
  const anchor = placeFocusFxAnchor(place);
  if (!anchor) return outer;
  const radiusFitPx = SPOTLIGHT_MARKER_RADIUS_PX / positive(holeScale);
  const rx = (radiusFitPx / positive(fitWidth, 1000)) * 100;
  const ry = (radiusFitPx / positive(fitHeight, 1000)) * 100;
  const x0 = fmt(anchor.xp - rx);
  return (
    `${outer}M${x0} ${fmt(anchor.yp)}` +
    `a${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(2 * rx)} 0` +
    `a${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(-2 * rx)} 0Z`
  );
}

/**
 * Étincelles (plateaux GL) : directions réparties en couronne, légèrement irrégulières, et
 * distance à l'écran (px). Déterministe : pas d'aléa au rendu.
 * @param {number} [count=10]
 * @returns {Array<{ angleDeg: number, distancePx: number, delayMs: number, glyph: string }>}
 */
export function placeFocusSparkles(count = 10) {
  const n = Math.max(1, Math.round(count));
  const glyphs = ['✦', '✧', '✶', '⋆'];
  return Array.from({ length: n }, (_, i) => ({
    angleDeg: (360 / n) * i + (i % 2 ? 9 : -6),
    distancePx: 46 + ((i * 17) % 30),
    delayMs: (i % 3) * 40,
    glyph: glyphs[i % glyphs.length],
  }));
}
