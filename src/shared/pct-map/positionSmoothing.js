/**
 * Continuité du repère de position entre deux mesures GPS — module pur.
 *
 * Un capteur livre une position par seconde environ. Affichée telle quelle, elle produit un
 * repère qui avance par bonds d'un mètre, et — en mode suivi — une carte qui saute avec lui.
 * Deux gestes, tous deux bornés :
 *
 *   1. **prolonger** le déplacement connu entre deux mesures : le capteur donne la route suivie
 *      et la vitesse, on avance le long de cette route. Ce n'est vrai qu'un court instant, d'où
 *      les deux garde-fous — une durée (`maxMs`) et une distance (`maxPct`) au-delà desquelles
 *      on cesse : un capteur muet depuis trois secondes ne dit plus rien du présent, et
 *      prolonger encore reviendrait à inventer un déplacement ;
 *   2. **rattraper** la position estimée en douceur plutôt que d'y sauter. L'arrivée d'une
 *      mesure ne téléporte donc jamais le repère : elle déplace la cible, que le rendu rejoint
 *      en une fraction de seconde.
 *
 * Sans vitesse exploitable (à l'arrêt, ou capteur qui ne la calcule pas), la prolongation est
 * nulle et il ne reste que le rattrapage : le repère glisse vers chaque nouvelle mesure au lieu
 * d'y sauter. C'est déjà l'essentiel du confort.
 *
 * @typedef {{ xp: number, yp: number }} Pct
 * @typedef {{ pct: Pct, velocityPct: Pct|null, at: number }} PositionAnchor
 */

/** Constante de temps (ms) du rattrapage : ~63 % de l'écart comblé en autant de millisecondes. */
export const POSITION_EASE_TAU_MS = 250;

/** Durée (ms) au-delà de laquelle une mesure ne dit plus rien du déplacement en cours. */
export const POSITION_EXTRAPOLATION_MAX_MS = 2500;

/** Distance (m) que la prolongation ne dépassera jamais, quelle que soit la vitesse annoncée. */
export const POSITION_EXTRAPOLATION_MAX_M = 8;

/** Sous cette vitesse (m/s), il n'y a pas de déplacement à prolonger. */
export const POSITION_EXTRAPOLATION_MIN_SPEED_MS = 0.6;

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isPct(value) {
  return !!value && Number.isFinite(Number(value.xp)) && Number.isFinite(Number(value.yp));
}

/**
 * Position estimée à l'instant `nowMs`, en prolongeant la dernière mesure le long de la route
 * suivie — bornée en durée et en distance.
 *
 * @param {PositionAnchor|null} anchor dernière mesure, sa vitesse (en % de plan par seconde) et
 *   l'instant où elle a été reçue.
 * @param {number} nowMs
 * @param {{ maxMs?: number, maxPct?: number }} [options] `maxPct` borne la **distance**
 *   prolongée, exprimée dans la même unité que les coordonnées (% de plan).
 * @returns {Pct|null}
 */
export function extrapolatedPct(anchor, nowMs, options = {}) {
  if (!isPct(anchor?.pct)) return null;
  const base = { xp: num(anchor.pct.xp), yp: num(anchor.pct.yp) };
  if (!isPct(anchor.velocityPct)) return base;
  const maxMs = num(options.maxMs, POSITION_EXTRAPOLATION_MAX_MS);
  const elapsed = Math.max(0, Math.min(maxMs, num(nowMs) - num(anchor.at)));
  let dx = (num(anchor.velocityPct.xp) * elapsed) / 1000;
  let dy = (num(anchor.velocityPct.yp) * elapsed) / 1000;
  const maxPct = Number(options.maxPct);
  if (Number.isFinite(maxPct) && maxPct > 0) {
    const reach = Math.hypot(dx, dy);
    if (reach > maxPct) {
      const ratio = maxPct / reach;
      dx *= ratio;
      dy *= ratio;
    }
  }
  return { xp: base.xp + dx, yp: base.yp + dy };
}

/**
 * Un pas de rattrapage vers la cible, à constante de temps : le même réglage donne le même
 * mouvement que la boucle tourne à 12 ou à 60 images par seconde.
 *
 * @param {Pct|null} current position affichée
 * @param {Pct|null} target position estimée
 * @param {number} dtMs temps écoulé depuis le pas précédent
 * @param {number} [tauMs]
 * @returns {Pct|null}
 */
export function easePctToward(current, target, dtMs, tauMs = POSITION_EASE_TAU_MS) {
  if (!isPct(target)) return isPct(current) ? current : null;
  if (!isPct(current)) return { xp: num(target.xp), yp: num(target.yp) };
  const tau = num(tauMs, POSITION_EASE_TAU_MS);
  const k = tau > 0 ? 1 - Math.exp(-Math.max(0, num(dtMs)) / tau) : 1;
  return {
    xp: num(current.xp) + (num(target.xp) - num(current.xp)) * k,
    yp: num(current.yp) + (num(target.yp) - num(current.yp)) * k,
  };
}

/**
 * Écart entre deux points, en % de plan — sert à ne republier que ce qui se verra.
 * @param {Pct|null} a
 * @param {Pct|null} b
 * @returns {number} `Infinity` quand l'un des deux manque (donc : publier).
 */
export function pctDistance(a, b) {
  if (!isPct(a) || !isPct(b)) return Number.POSITIVE_INFINITY;
  return Math.hypot(num(a.xp) - num(b.xp), num(a.yp) - num(b.yp));
}
