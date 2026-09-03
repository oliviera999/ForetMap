/**
 * Géométrie de la position sur un plan « % image » — module pur (lot 6 du plan de
 * convergence, `docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §4.2 « Position » et §8.5).
 *
 * Tout ce qui suit est du calcul, sans capteur ni rendu : rayon du halo de précision,
 * position affichée quand on est **hors du plan** (collée au bord avec une flèche plutôt que
 * disparue), distance et cap vers un lieu, normalisation du cap de l'appareil.
 *
 * Repères : `{ xp, yp }` en pourcentage de l'image, angles en degrés dans le sens horaire
 * depuis le haut de l'**image** (et non depuis le nord : le plan n'est pas orienté au nord,
 * et une flèche doit pointer vers ce que la personne voit à l'écran).
 */

/** Rayon minimal du halo, en % du plan : sous ce seuil il ne se voit plus. */
export const POSITION_HALO_MIN_PCT = 0.6;

/** Rayon maximal du halo, en % du plan : au-delà, la précision n'apprend plus rien. */
export const POSITION_HALO_MAX_PCT = 40;

/** Marge (en % du plan) au-delà des bords avant de déclarer la position « hors plan ». */
export const POSITION_OUT_OF_MAP_MARGIN_PCT = 2;

function toFinite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Rayon du halo de précision, en % du plan, à partir de la précision du capteur (mètres) et
 * de la taille réelle du plan. Sans taille connue, pas de halo : mieux vaut aucun cercle
 * qu'un cercle qui ment sur la précision.
 *
 * @param {number} accuracyM précision annoncée par le capteur, en mètres.
 * @param {{ widthM: number, heightM: number }|null} planSize taille réelle (`planSizeMeters`).
 * @returns {number} rayon en % du plan, `0` si inconnu.
 */
export function accuracyRadiusPct(accuracyM, planSize) {
  const accuracy = toFinite(accuracyM, 0);
  const widthM = toFinite(planSize?.widthM, 0);
  const heightM = toFinite(planSize?.heightM, 0);
  if (!(accuracy > 0) || !(widthM > 0) || !(heightM > 0)) return 0;
  // Le halo est un disque sur une image dont l'échelle m/% peut différer en x et en y :
  // on prend la plus grande des deux, pour ne jamais annoncer mieux que la réalité.
  const pctPerMeter = Math.max(100 / widthM, 100 / heightM);
  const radius = accuracy * pctPerMeter;
  return Math.min(POSITION_HALO_MAX_PCT, Math.max(POSITION_HALO_MIN_PCT, radius));
}

/** Angle en degrés (sens horaire depuis le haut de l'image) du vecteur `from → to`. */
export function bearingBetweenPct(from, to) {
  const dx = toFinite(to?.xp) - toFinite(from?.xp);
  const dy = toFinite(to?.yp) - toFinite(from?.yp);
  if (dx === 0 && dy === 0) return 0;
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/**
 * Position à **afficher** pour un point qui peut être hors du plan : ramenée au bord le plus
 * proche, avec le cap vers le point réel — c'est la flèche « vous êtes par là ». Un point
 * dans le plan est renvoyé tel quel.
 *
 * @param {{ xp: number, yp: number }|null} pct position réelle.
 * @param {number} [marginPct] tolérance au-delà des bords avant de considérer « hors plan ».
 * @returns {{ xp: number, yp: number, offMap: boolean, bearingDeg: number }|null}
 */
export function clampPositionToMap(pct, marginPct = POSITION_OUT_OF_MAP_MARGIN_PCT) {
  if (!pct || !Number.isFinite(Number(pct.xp)) || !Number.isFinite(Number(pct.yp))) return null;
  const xp = Number(pct.xp);
  const yp = Number(pct.yp);
  const margin = toFinite(marginPct, 0);
  const inside = xp >= -margin && xp <= 100 + margin && yp >= -margin && yp <= 100 + margin;
  if (inside) return { xp, yp, offMap: false, bearingDeg: 0 };
  const clamped = { xp: Math.min(100, Math.max(0, xp)), yp: Math.min(100, Math.max(0, yp)) };
  return {
    ...clamped,
    offMap: true,
    bearingDeg: bearingBetweenPct(clamped, { xp, yp }),
  };
}

/**
 * Distance en mètres entre deux points du plan, d'après la taille réelle du plan. Sert au
 * « Y aller » en ligne droite : une distance approchée mais honnête vaut mieux qu'un
 * itinéraire inventé (le vrai routage viendra avec un graphe de chemins).
 *
 * @param {{ xp: number, yp: number }} from
 * @param {{ xp: number, yp: number }} to
 * @param {{ widthM: number, heightM: number }|null} planSize
 * @returns {number|null} distance en mètres, `null` si la taille du plan est inconnue.
 */
export function distanceMetersBetweenPct(from, to, planSize) {
  const widthM = toFinite(planSize?.widthM, 0);
  const heightM = toFinite(planSize?.heightM, 0);
  if (!(widthM > 0) || !(heightM > 0)) return null;
  if (!from || !to) return null;
  const dx = ((toFinite(to.xp) - toFinite(from.xp)) / 100) * widthM;
  const dy = ((toFinite(to.yp) - toFinite(from.yp)) / 100) * heightM;
  const distance = Math.hypot(dx, dy);
  return Number.isFinite(distance) ? distance : null;
}

/**
 * Distance en toutes lettres, arrondie à une précision honnête : au mètre en dessous de
 * 100 m, à 10 m au-delà, en kilomètres au-delà de 2 km.
 * @param {number|null} meters
 */
export function formatDistanceFr(meters) {
  if (meters == null || !Number.isFinite(Number(meters))) return '';
  const m = Number(meters);
  if (m < 100) return `${Math.round(m)} m`;
  if (m < 2000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

/**
 * Cap de l'appareil (`DeviceOrientation`) ramené à un angle horaire depuis le nord, ou
 * `null` quand l'événement ne porte pas de cap exploitable.
 *
 * `webkitCompassHeading` (iOS) est déjà un cap ; `alpha` est un angle **anti-horaire** depuis
 * le nord quand l'événement est absolu — sur un événement relatif, il ne veut rien dire et
 * l'on préfère ne rien afficher plutôt qu'une flèche fausse.
 *
 * @param {{ webkitCompassHeading?: number, alpha?: number, absolute?: boolean }} event
 * @returns {number|null} cap en degrés [0, 360[.
 */
export function headingFromDeviceOrientation(event) {
  const webkit = Number(event?.webkitCompassHeading);
  if (Number.isFinite(webkit)) return (webkit + 360) % 360;
  const alpha = Number(event?.alpha);
  if (!Number.isFinite(alpha) || event?.absolute !== true) return null;
  return (360 - alpha) % 360;
}

/**
 * Cap **à l'écran** d'une direction géographique : le plan n'étant pas orienté au nord, on
 * lui applique la rotation de l'image, déduite du calage (`northOffsetDeg`).
 *
 * @param {number|null} headingDeg cap géographique (depuis le nord).
 * @param {number} northOffsetDeg angle du nord dans l'image (0 = le nord est vers le haut).
 * @returns {number|null}
 */
export function screenHeadingDeg(headingDeg, northOffsetDeg = 0) {
  if (headingDeg == null || !Number.isFinite(Number(headingDeg))) return null;
  return (((Number(headingDeg) + toFinite(northOffsetDeg)) % 360) + 360) % 360;
}

/**
 * Angle du nord dans l'image, déduit du calage : cap écran du vecteur qui va d'un point vers
 * le même point décalé d'un degré de latitude vers le nord.
 *
 * @param {(lat: number, lng: number) => ({ xp: number, yp: number }|null)} project
 * @param {{ lat: number, lng: number }} reference point de référence (le centre du plan).
 * @returns {number} angle en degrés, `0` quand le calage ne permet pas de conclure.
 */
export function northOffsetFromProjection(project, reference) {
  if (typeof project !== 'function' || !reference) return 0;
  const lat = toFinite(reference.lat);
  const lng = toFinite(reference.lng);
  const here = project(lat, lng);
  // 0,001° de latitude ≈ 111 m : assez pour un cap stable, assez peu pour rester local.
  const north = project(lat + 0.001, lng);
  if (!here || !north) return 0;
  return bearingBetweenPct(here, north);
}
