/**
 * Orientation de vue (heading-up) pour les cartes « % image ».
 *
 * La rotation CSS est appliquée sur un calque **intérieur** (après pan/zoom), avec
 * `transform-origin` en % du contenu — les gestes pan/zoom restent en espace écran.
 * Ces helpers convertissent pointeur ↔ contenu en tenant compte de l'angle.
 */

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * @param {number} deg
 * @returns {number} radians
 */
export function degToRad(deg) {
  return (num(deg) * Math.PI) / 180;
}

/**
 * Fait tourner un point autour d'une origine (sens horaire positif, comme CSS `rotate`).
 * @param {number} x
 * @param {number} y
 * @param {number} ox
 * @param {number} oy
 * @param {number} degDegrees angle CSS (horaire)
 * @returns {{ x: number, y: number }}
 */
export function rotatePointAround(x, y, ox, oy, degDegrees) {
  // CSS `rotate` est horaire ; la matrice trigonométrique usuelle est anti-horaire.
  const rad = degToRad(-num(degDegrees));
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = num(x) - num(ox);
  const dy = num(y) - num(oy);
  return {
    x: num(ox) + dx * cos - dy * sin,
    y: num(oy) + dx * sin + dy * cos,
  };
}

/**
 * Inverse de `rotatePointAround` (même origine, angle opposé).
 */
export function unrotatePointAround(x, y, ox, oy, degDegrees) {
  return rotatePointAround(x, y, ox, oy, -num(degDegrees));
}

/**
 * Style CSS du calque d'orientation intérieur.
 * @param {number} orientationDeg angle CSS (typiquement −screenHeadingDeg)
 * @param {{ xp?: number, yp?: number }|null} originPct pivot en % contenu
 * @returns {{ transform: string, transformOrigin: string }|null} `null` si pas de rotation
 */
export function mapOrientationStyle(orientationDeg, originPct = null) {
  const deg = num(orientationDeg);
  if (!Number.isFinite(deg) || Math.abs(deg) < 1e-6) return null;
  const ox = originPct && Number.isFinite(Number(originPct.xp)) ? Number(originPct.xp) : 50;
  const oy = originPct && Number.isFinite(Number(originPct.yp)) ? Number(originPct.yp) : 50;
  return {
    transform: `rotate(${deg}deg)`,
    transformOrigin: `${ox}% ${oy}%`,
  };
}

/**
 * Lissage exponentiel d'un cap circulaire [0, 360).
 * @param {number|null} previous
 * @param {number|null} next
 * @param {number} [alpha=0.25] poids du nouvel échantillon (0–1)
 * @returns {number|null}
 */
export function smoothHeadingDeg(previous, next, alpha = 0.25) {
  if (next == null || !Number.isFinite(Number(next))) return previous ?? null;
  const n = ((Number(next) % 360) + 360) % 360;
  if (previous == null || !Number.isFinite(Number(previous))) return n;
  const p = ((Number(previous) % 360) + 360) % 360;
  let delta = n - p;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  const a = Math.max(0, Math.min(1, num(alpha, 0.25)));
  return (((p + delta * a) % 360) + 360) % 360;
}

/**
 * Angle de rotation de la carte pour que le regard pointe vers le haut de l'écran.
 * @param {number|null} screenHeadingDeg
 * @returns {number} degrés CSS
 */
export function headingUpOrientationDeg(screenHeadingDeg) {
  if (screenHeadingDeg == null || !Number.isFinite(Number(screenHeadingDeg))) return 0;
  return -Number(screenHeadingDeg);
}
