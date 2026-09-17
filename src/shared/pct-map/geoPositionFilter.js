/**
 * Filtrage des mesures GPS avant affichage — module pur (aucun capteur, aucun rendu).
 *
 * Le capteur d'un téléphone ne se contente pas d'être imprécis : entre deux mesures, il saute
 * de quelques mètres alors que la personne n'a pas bougé, et livre de temps à autre un point
 * franchement aberrant (« téléport » de 200 m sur une réflexion de signal). Affichés tels
 * quels, ces sauts font trembler le point de position — et, en mode suivi, toute la carte avec
 * lui.
 *
 * Deux gardes, dans cet ordre :
 *   1. **rejet des sauts invraisemblables** — une vitesse implicite au-delà de `maxSpeedMs`
 *      (12 m/s ≈ 43 km/h, hors de portée d'un piéton) accompagnée d'un écart plus grand que la
 *      somme des précisions annoncées est écartée. Jamais plus de `maxRejectStreak` fois de
 *      suite ni au-delà de `staleMs` : un vrai déplacement rapide, ou un GPS qui retrouve ses
 *      esprits après une perte de signal, ne doit pas rester bloqué sur un point périmé ;
 *   2. **filtre de Kalman à une dimension** sur la latitude et la longitude, dont le gain suit
 *      la précision annoncée : une mesure à 5 m tire fort le point filtré, une mesure à 40 m à
 *      peine. À l'arrêt, la variance de prédiction grandit très peu (`processNoiseMs × dt`), le
 *      gain reste faible, et le point cesse de trembler.
 *
 * La précision renvoyée reste celle **du capteur** : le halo doit continuer à dire la vérité
 * sur ce que l'appareil sait, pas sur ce que le filtre croit.
 *
 * Inspiration : formulation classique du filtre de Kalman 1-D pour traces GPS, diffusée par la
 * question de référence « Smooth GPS data » sur Stack Overflow
 * (https://stackoverflow.com/q/1134579) et reprise par la plupart des implémentations Android
 * (`KalmanLatLong`). Code écrit ici, aux conventions du projet
 * (`.cursor/rules/foretmap-external-inspiration.mdc`).
 *
 * @typedef {{ lat: number, lng: number, accuracy: number, timestamp: number,
 *   speed?: number|null, heading?: number|null }} GeoSample
 * @typedef {GeoSample & { variance: number, rejected: boolean, rejectedStreak: number }} GeoFix
 */

/** Rayon terrestre moyen (m) — sphère suffisante à l'échelle d'un établissement. */
const EARTH_RADIUS_M = 6371008.8;

/** Réglages par défaut du filtre. */
export const GEO_FILTER_DEFAULTS = Object.freeze({
  /** Incertitude de base sur le déplacement entre deux mesures (m/s) : quelqu'un d'immobile. */
  processNoiseMs: 1.2,
  /**
   * Part de la vitesse annoncée ajoutée à l'incertitude de déplacement. Un filtre de position
   * pure traîne derrière une personne qui marche — l'écart d'équilibre vaut `v × (1−K) / K`,
   * soit près de sept mètres à allure de marche avec le seul bruit de base. Reconnaître que
   * l'on bouge (le capteur le dit : `coords.speed`) ouvre le gain juste ce qu'il faut : le
   * repère colle à la marche, et retrouve son calme dès l'arrêt. La vitesse ne déplace jamais
   * le point par elle-même — elle ne règle que la confiance accordée à la mesure suivante.
   */
  speedNoiseFactor: 2,
  /** Au-delà, la vitesse implicite entre deux mesures n'est plus celle d'un piéton (m/s). */
  maxSpeedMs: 12,
  /** Nombre maximal de rejets consécutifs avant de se rendre à l'évidence. */
  maxRejectStreak: 3,
  /** Au-delà de ce silence (ms), la mesure précédente est périmée : plus aucun rejet. */
  staleMs: 8000,
  /** Plancher de précision (m) : aucun capteur ne sait vraiment faire mieux. */
  minAccuracyM: 3,
});

function toFinite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** `Number(null)` vaut 0 : un « pas de valeur » ne doit jamais devenir une coordonnée nulle. */
function finiteOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Distance en mètres entre deux couples (lat, lng), en projection équirectangulaire locale :
 * à l'échelle d'un établissement, l'écart avec la formule de Haversine est sous le centimètre.
 *
 * @param {{ lat: number, lng: number }|null} a
 * @param {{ lat: number, lng: number }|null} b
 * @returns {number|null} distance en mètres, `null` si l'un des points est inexploitable.
 */
export function distanceMetersBetweenLatLng(a, b) {
  const lat1 = finiteOrNull(a?.lat);
  const lng1 = finiteOrNull(a?.lng);
  const lat2 = finiteOrNull(b?.lat);
  const lng2 = finiteOrNull(b?.lng);
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const rad = Math.PI / 180;
  const meanLat = ((lat1 + lat2) / 2) * rad;
  const dx = (lng2 - lng1) * rad * Math.cos(meanLat);
  const dy = (lat2 - lat1) * rad;
  return Math.hypot(dx, dy) * EARTH_RADIUS_M;
}

/**
 * Nouvel état du filtre après une mesure. Fonction **pure** : l'état précédent est donné, le
 * suivant est renvoyé (l'appelant le range où il veut — une ref, un état React, un test).
 *
 * @param {GeoFix|null} previous état filtré précédent, `null` pour la première mesure.
 * @param {GeoSample|null} sample mesure brute du capteur.
 * @param {Partial<typeof GEO_FILTER_DEFAULTS>} [options]
 * @returns {GeoFix|null} état suivant ; `previous` marqué `rejected` quand la mesure est
 *   écartée ; `null` si aucune mesure exploitable n'a jamais été vue.
 */
export function nextFilteredGeoFix(previous, sample, options = {}) {
  const cfg = { ...GEO_FILTER_DEFAULTS, ...options };
  const lat = finiteOrNull(sample?.lat);
  const lng = finiteOrNull(sample?.lng);
  if (lat == null || lng == null) return previous ? { ...previous, rejected: true } : null;

  const accuracy = Math.max(cfg.minAccuracyM, toFinite(sample?.accuracy, cfg.minAccuracyM));
  const timestamp = toFinite(sample?.timestamp, 0);
  const speed = finiteOrNull(sample?.speed);
  const heading = finiteOrNull(sample?.heading);

  if (!previous || !Number.isFinite(Number(previous.lat))) {
    return {
      lat,
      lng,
      accuracy,
      timestamp,
      speed,
      heading,
      variance: accuracy * accuracy,
      rejected: false,
      rejectedStreak: 0,
    };
  }

  const dtMs = Math.max(0, timestamp - toFinite(previous.timestamp, timestamp));
  const dtSec = dtMs / 1000;
  const moved = distanceMetersBetweenLatLng(previous, { lat, lng }) || 0;
  const impliedSpeed = dtSec > 0 ? moved / dtSec : Number.POSITIVE_INFINITY;
  const streak = toFinite(previous.rejectedStreak, 0);
  const tooFar = moved > accuracy + toFinite(previous.accuracy, accuracy);
  if (
    impliedSpeed > cfg.maxSpeedMs &&
    tooFar &&
    streak < cfg.maxRejectStreak &&
    dtMs < cfg.staleMs
  ) {
    return { ...previous, rejected: true, rejectedStreak: streak + 1 };
  }

  // Prédiction : l'incertitude grandit avec le temps écoulé, d'autant plus vite que la personne
  // se déplace (cf. `speedNoiseFactor`).
  const paceMs = cfg.processNoiseMs + cfg.speedNoiseFactor * Math.abs(speed ?? 0);
  const drift = paceMs * dtSec;
  const variancePred = toFinite(previous.variance, accuracy * accuracy) + drift * drift;
  const gain = variancePred / (variancePred + accuracy * accuracy);
  return {
    lat: toFinite(previous.lat) + gain * (lat - toFinite(previous.lat)),
    lng: toFinite(previous.lng) + gain * (lng - toFinite(previous.lng)),
    accuracy,
    timestamp,
    speed,
    heading,
    variance: (1 - gain) * variancePred,
    rejected: false,
    rejectedStreak: 0,
  };
}

export default nextFilteredGeoFix;
