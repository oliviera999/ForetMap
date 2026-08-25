/**
 * Ancrage magnétique sur les contours de l'image de fond — helpers purs.
 *
 * Principe (identique au « magnetic lasso » des logiciels de retouche) : on calcule
 * une carte de contours par l'opérateur de Sobel sur la luminance de l'image, puis on
 * colle le sommet déplacé sur le pixel de plus fort contraste dans un rayon donné.
 *
 * Inspiration : opérateur de Sobel (Sobel & Feldman, 1968) tel qu'implémenté dans
 * OpenCV (`cv::Sobel`, licence Apache-2.0) — https://github.com/opencv/opencv ;
 * pondération « force du contour / distance » reprise de l'esprit d'Intelligent
 * Scissors (Mortensen & Barrett, 1995), sans le coût d'un plus court chemin.
 *
 * Aucune dépendance au DOM : les fonctions acceptent un objet compatible `ImageData`
 * (`{ data: Uint8ClampedArray, width, height }`), ce qui les rend testables sous Node.
 */

/** Coefficients de luminance perçue (Rec. 601), suffisants pour un détecteur de contours. */
const LUMA_R = 0.299;
const LUMA_G = 0.587;
const LUMA_B = 0.114;

/** Valeurs par défaut de l'aimant (réglages « raisonnables » sur un plan dessiné). */
export const EDGE_SNAP_DEFAULTS = Object.freeze({
  /** Contraste minimal (0..1) pour qu'un pixel soit considéré comme un contour. */
  minStrength: 0.18,
  /** Pénalité de distance : 0 = on ignore la distance, 1 = on la pénalise fortement. */
  distanceWeight: 0.55,
  /** Rayon d'accroche par défaut, en pixels écran. */
  radiusScreenPx: 18,
});

/**
 * Luminance de chaque pixel (0..255).
 * @param {{data: Uint8ClampedArray|number[], width: number, height: number}} imageData
 * @returns {Float32Array}
 */
export function toLuminance(imageData) {
  const { data, width, height } = imageData || {};
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  const out = new Float32Array(Math.max(0, w * h));
  if (!data || !w || !h) return out;
  for (let i = 0, p = 0; i < out.length; i += 1, p += 4) {
    out[i] = LUMA_R * data[p] + LUMA_G * data[p + 1] + LUMA_B * data[p + 2];
  }
  return out;
}

/**
 * Flou boîte 3×3 séparable — atténue le bruit d'une photo aérienne avant Sobel.
 * @param {Float32Array} src
 */
export function boxBlur3(src, width, height) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (!w || !h) return src;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    for (let x = 0; x < w; x += 1) {
      const xm = x > 0 ? x - 1 : 0;
      const xp = x < w - 1 ? x + 1 : w - 1;
      tmp[row + x] = (src[row + xm] + src[row + x] + src[row + xp]) / 3;
    }
  }
  for (let y = 0; y < h; y += 1) {
    const ym = (y > 0 ? y - 1 : 0) * w;
    const yc = y * w;
    const yp = (y < h - 1 ? y + 1 : h - 1) * w;
    for (let x = 0; x < w; x += 1) {
      out[yc + x] = (tmp[ym + x] + tmp[yc + x] + tmp[yp + x]) / 3;
    }
  }
  return out;
}

/**
 * Carte de contours (magnitude du gradient de Sobel), normalisée dans [0..1].
 *
 * @param {{data: Uint8ClampedArray|number[], width: number, height: number}} imageData
 * @param {{ blur?: boolean }} [options]
 * @returns {{ width: number, height: number, magnitude: Float32Array, max: number }}
 */
export function computeEdgeMap(imageData, options = {}) {
  const { blur = true } = options;
  const w = Number(imageData?.width) || 0;
  const h = Number(imageData?.height) || 0;
  const magnitude = new Float32Array(Math.max(0, w * h));
  if (w < 3 || h < 3) return { width: w, height: h, magnitude, max: 0 };

  const luma = blur ? boxBlur3(toLuminance(imageData), w, h) : toLuminance(imageData);
  let max = 0;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const tl = luma[i - w - 1];
      const tc = luma[i - w];
      const tr = luma[i - w + 1];
      const ml = luma[i - 1];
      const mr = luma[i + 1];
      const bl = luma[i + w - 1];
      const bc = luma[i + w];
      const br = luma[i + w + 1];
      const gx = tl + 2 * ml + bl - (tr + 2 * mr + br);
      const gy = tl + 2 * tc + tr - (bl + 2 * bc + br);
      const m = Math.sqrt(gx * gx + gy * gy);
      magnitude[i] = m;
      if (m > max) max = m;
    }
  }
  if (max > 0) {
    for (let i = 0; i < magnitude.length; i += 1) magnitude[i] /= max;
  }
  return { width: w, height: h, magnitude, max };
}

/** Force du contour (0..1) en un pixel entier, 0 hors image. */
export function edgeStrengthAt(edgeMap, x, y) {
  const w = edgeMap?.width || 0;
  const h = edgeMap?.height || 0;
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (!w || !h || ix < 0 || iy < 0 || ix >= w || iy >= h) return 0;
  return edgeMap.magnitude[iy * w + ix] || 0;
}

/**
 * Meilleur point d'accroche dans un disque de rayon `radius` autour de `(x, y)` (pixels
 * de la carte de contours). Le score favorise les contours francs **proches** :
 * `score = force × (1 − distanceWeight × d / rayon)`.
 *
 * @returns {{ x: number, y: number, strength: number, distance: number } | null}
 */
export function findSnapTargetPx(edgeMap, x, y, radius, options = {}) {
  const { minStrength = EDGE_SNAP_DEFAULTS.minStrength, distanceWeight = 0.55 } = options;
  const w = edgeMap?.width || 0;
  const h = edgeMap?.height || 0;
  const r = Number(radius) || 0;
  if (!w || !h || r <= 0 || !edgeMap?.magnitude) return null;

  const cx = Number(x) || 0;
  const cy = Number(y) || 0;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(h - 1, Math.ceil(cy + r));
  const rSq = r * r;

  let best = null;
  for (let py = y0; py <= y1; py += 1) {
    const dy = py - cy;
    const rowBase = py * w;
    for (let px = x0; px <= x1; px += 1) {
      const dx = px - cx;
      const dSq = dx * dx + dy * dy;
      if (dSq > rSq) continue;
      const strength = edgeMap.magnitude[rowBase + px] || 0;
      if (strength < minStrength) continue;
      const distance = Math.sqrt(dSq);
      const score = strength * (1 - distanceWeight * (distance / r));
      if (!best || score > best.score) best = { x: px, y: py, strength, distance, score };
    }
  }
  if (!best) return null;
  return { x: best.x, y: best.y, strength: best.strength, distance: best.distance };
}

/**
 * Version « pourcentages d'image » utilisée par la carte : prend et rend un `{xp, yp}`.
 * Le rayon est exprimé en % de la largeur d'image ; il est converti en pixels de la
 * carte de contours (qui est une version sous-échantillonnée du plan).
 *
 * @param {{width:number,height:number,magnitude:Float32Array}} edgeMap
 * @param {{xp:number,yp:number}} point
 * @param {{ radiusPct?: number, minStrength?: number, distanceWeight?: number }} [options]
 * @returns {{ xp: number, yp: number, strength: number } | null} `null` si aucun contour
 */
export function snapPctToEdgeMap(edgeMap, point, options = {}) {
  const { radiusPct = 1, ...rest } = options;
  const w = edgeMap?.width || 0;
  const h = edgeMap?.height || 0;
  if (!w || !h || !point) return null;
  const px = ((Number(point.xp) || 0) / 100) * (w - 1);
  const py = ((Number(point.yp) || 0) / 100) * (h - 1);
  const radius = Math.max(1, ((Number(radiusPct) || 0) / 100) * w);
  const hit = findSnapTargetPx(edgeMap, px, py, radius, rest);
  if (!hit) return null;
  return {
    xp: Math.min(100, Math.max(0, (hit.x / (w - 1)) * 100)),
    yp: Math.min(100, Math.max(0, (hit.y / (h - 1)) * 100)),
    strength: hit.strength,
  };
}

/**
 * Dimensions sous-échantillonnées d'une image pour l'analyse de contours
 * (le plan peut faire plusieurs milliers de pixels de côté : inutile et coûteux).
 */
export function edgeMapTargetSize(width, height, maxSide = 1400) {
  const w = Math.max(1, Math.round(Number(width) || 0));
  const h = Math.max(1, Math.round(Number(height) || 0));
  const longest = Math.max(w, h);
  if (!longest || longest <= maxSide) return { width: w, height: h, scale: 1 };
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
    scale,
  };
}
