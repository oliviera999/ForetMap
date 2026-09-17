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

/** Durée (ms) de la transition CSS qui relie deux angles d'orientation successifs. */
export const MAP_ORIENTATION_TRANSITION_MS = 180;

/**
 * Style CSS du calque d'orientation intérieur.
 *
 * `animated` confie l'interpolation entre deux angles au compositeur : le cap n'est publié que
 * quelques fois par seconde (voir `smoothHeadingOverTime`), et la transition CSS comble les
 * intervalles sans qu'un seul rendu React soit nécessaire. L'angle doit alors être **continu**
 * (`unwrapHeadingDeg`) : une transition entre 359° et 1° ferait faire un tour complet à la
 * carte, à l'envers.
 *
 * @param {number} orientationDeg angle CSS (typiquement −screenHeadingDeg), non normalisé
 * @param {{ xp?: number, yp?: number }|null} originPct pivot en % contenu
 * @param {{ animated?: boolean, transitionMs?: number }} [options]
 * @returns {{ transform: string, transformOrigin: string, transition?: string,
 *   willChange?: string }|null} `null` si pas de rotation
 */
export function mapOrientationStyle(orientationDeg, originPct = null, options = {}) {
  const deg = num(orientationDeg);
  if (!Number.isFinite(deg) || Math.abs(deg) < 1e-6) return null;
  const ox = originPct && Number.isFinite(Number(originPct.xp)) ? Number(originPct.xp) : 50;
  const oy = originPct && Number.isFinite(Number(originPct.yp)) ? Number(originPct.yp) : 50;
  const style = {
    transform: `rotate(${deg}deg)`,
    transformOrigin: `${ox}% ${oy}%`,
  };
  if (options?.animated) {
    const ms = Number(options.transitionMs);
    const duration = Number.isFinite(ms) && ms >= 0 ? ms : MAP_ORIENTATION_TRANSITION_MS;
    style.transition = `transform ${Math.round(duration)}ms linear`;
    style.willChange = 'transform';
    // Les habillages lisibles (étiquettes, repères, pastilles) se **contre-tournent** de
    // `−var(--pct-orient)`. Si le calque glisse d'un angle à l'autre pendant qu'eux sautent, le
    // texte penche tout le long de la rotation. Ils héritent donc de la même transition, à la
    // même durée et au même instant : leur contre-rotation reste exactement opposée.
    style['--pct-orient-transition'] = `transform ${Math.round(duration)}ms linear`;
  }
  return style;
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

/**
 * Pire cas de couverture après rotation d'un rectangle dans un viewport axis-aligned :
 * à 45° le contenu doit être grossi d'un facteur √2 pour ne pas laisser de fond vide.
 * Facteur **stable** (indépendant du jitter boussole) à utiliser pour le zoom caméra.
 */
export const HEADING_UP_COVER_SCALE = Math.SQRT2;

/**
 * Facteur d'échelle minimal pour qu'un rectangle axis-aligned (le viewport) reste
 * entièrement couvert après une rotation CSS de `orientationDeg` autour d'un pivot
 * intérieur. Vaut `|cos| + |sin|` ∈ [1, √2].
 * @param {number} orientationDeg
 * @returns {number}
 */
export function headingUpCoverScaleMultiplier(orientationDeg) {
  const rad = degToRad(num(orientationDeg));
  return Math.abs(Math.cos(rad)) + Math.abs(Math.sin(rad));
}

/** Constante de temps (ms) du lissage de cap : plus elle est grande, plus la carte est calme. */
export const HEADING_SMOOTH_TAU_MS = 220;

/** Écart (degrés) sous lequel un nouveau cap n'apprend rien et ne mérite pas un rendu. */
export const HEADING_DEAD_BAND_DEG = 1;

/**
 * Poids du nouvel échantillon pour un lissage exponentiel **à constante de temps** : le même
 * réglage donne le même comportement que la boussole émette 5 ou 60 fois par seconde.
 *
 * `smoothHeadingDeg(prev, next, alpha)` avec un alpha fixe dépendait, lui, de la cadence du
 * capteur : nerveux sur un appareil bavard, mou sur un appareil lent.
 *
 * @param {number} dtMs temps écoulé depuis le dernier échantillon.
 * @param {number} [tauMs]
 * @returns {number} alpha ∈ [0, 1]
 */
export function headingSmoothAlpha(dtMs, tauMs = HEADING_SMOOTH_TAU_MS) {
  const dt = Math.max(0, num(dtMs));
  const tau = num(tauMs, HEADING_SMOOTH_TAU_MS);
  if (!(tau > 0)) return 1;
  return 1 - Math.exp(-dt / tau);
}

/**
 * Lissage de cap indépendant de la cadence du capteur, avec bande morte.
 *
 * @param {number|null} previous cap lissé précédent [0, 360[
 * @param {number|null} next cap mesuré
 * @param {number} dtMs temps écoulé depuis le précédent échantillon
 * @param {{ tauMs?: number, deadBandDeg?: number }} [options]
 * @returns {number|null}
 */
export function smoothHeadingOverTime(previous, next, dtMs, options = {}) {
  if (next == null || !Number.isFinite(Number(next))) return previous ?? null;
  if (previous == null || !Number.isFinite(Number(previous))) {
    return ((Number(next) % 360) + 360) % 360;
  }
  const deadBand = num(options.deadBandDeg, HEADING_DEAD_BAND_DEG);
  if (Math.abs(headingDeltaDeg(previous, next)) < deadBand) return previous;
  return smoothHeadingDeg(previous, next, headingSmoothAlpha(dtMs, options.tauMs));
}

/**
 * Écart signé le plus court entre deux caps, dans ]−180, 180].
 * @param {number} from
 * @param {number} to
 * @returns {number}
 */
export function headingDeltaDeg(from, to) {
  const a = ((num(from) % 360) + 360) % 360;
  const b = ((num(to) % 360) + 360) % 360;
  let delta = b - a;
  if (delta > 180) delta -= 360;
  if (delta <= -180) delta += 360;
  return delta;
}

/**
 * Angle **continu** : suit le cap sans jamais repasser par zéro, pour qu'une transition CSS
 * entre deux valeurs prenne toujours le chemin le plus court (359° → 361° et non 359° → 1°).
 *
 * @param {number|null} previousUnwrapped angle continu précédent (peut sortir de [0, 360[)
 * @param {number|null} nextWrapped cap normalisé [0, 360[
 * @returns {number|null}
 */
export function unwrapHeadingDeg(previousUnwrapped, nextWrapped) {
  if (nextWrapped == null || !Number.isFinite(Number(nextWrapped)))
    return previousUnwrapped ?? null;
  if (previousUnwrapped == null || !Number.isFinite(Number(previousUnwrapped))) {
    return ((Number(nextWrapped) % 360) + 360) % 360;
  }
  return num(previousUnwrapped) + headingDeltaDeg(previousUnwrapped, nextWrapped);
}
