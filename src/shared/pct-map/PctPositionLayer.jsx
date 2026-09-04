import React from 'react';

/**
 * Point de position sur une carte « % image » (lot 6, `docs/AUDIT_PLAN_LYAUTEY_2026-09.md`
 * §4.2) : point bleu, **halo de précision** proportionnel à la précision annoncée par le
 * capteur, et **cap** de l'appareil quand la boussole le donne.
 *
 * Le halo dit la vérité : plus le capteur est imprécis, plus il est large. Hors du plan, le
 * point est collé au bord le plus proche et porte une flèche vers l'endroit réel, plutôt que
 * de disparaître sans explication.
 *
 * Les tailles sont en pourcentage de l'image, donc solidaires du zoom, sauf le point lui-même
 * qui garde une taille écran fixe (un point de position qui grossit avec le zoom se lit mal).
 *
 * @param {object} props
 * @param {{ xp: number, yp: number, offMap?: boolean, bearingDeg?: number }|null} props.position
 * @param {number} [props.haloPct] rayon du halo, en % du plan (`0` = pas de halo).
 * @param {number|null} [props.headingDeg] cap **à l'écran**, en degrés horaires depuis le haut.
 * @param {number|null} [props.accuracyM] précision en mètres (nom accessible).
 * @param {string} [props.className]
 */
function PctPositionLayerImpl({
  position,
  haloPct = 0,
  headingDeg = null,
  accuracyM = null,
  className = 'fm-pct-position',
}) {
  if (!position) return null;
  const { xp, yp, offMap = false, bearingDeg = 0 } = position;
  const accuracyLabel =
    accuracyM != null && Number.isFinite(Number(accuracyM))
      ? ` à ${Math.round(Number(accuracyM))} mètres près`
      : '';
  return (
    <div
      className={`${className}${offMap ? ' is-off-map' : ''}`}
      style={{ left: `${xp}%`, top: `${yp}%` }}
      role="img"
      aria-label={
        offMap
          ? 'Votre position est hors du plan, dans la direction indiquée'
          : `Votre position${accuracyLabel}`
      }
    >
      {haloPct > 0 && !offMap ? (
        <span
          className={`${className}__halo`}
          style={{ width: `${haloPct * 2}%`, height: `${haloPct * 2}%` }}
          aria-hidden
        />
      ) : null}
      {headingDeg != null && !offMap ? (
        <span
          className={`${className}__heading`}
          style={{ transform: `translate(-50%, -100%) rotate(${headingDeg}deg)` }}
          aria-hidden
        />
      ) : null}
      <span className={`${className}__dot`} aria-hidden />
      {offMap ? (
        <span
          className={`${className}__arrow`}
          style={{ transform: `translate(-50%, -50%) rotate(${bearingDeg}deg)` }}
          aria-hidden
        >
          ▲
        </span>
      ) : null}
    </div>
  );
}

export const PctPositionLayer = React.memo(PctPositionLayerImpl);
PctPositionLayer.displayName = 'PctPositionLayer';

/**
 * Trait « en ligne droite » entre la position et un lieu visé (« Y aller », §8.5). Ce n'est
 * pas un itinéraire : c'est une direction et une distance, honnêtes. Le vrai routage demande
 * un graphe de chemins, décision laissée à un lot ultérieur.
 *
 * @param {object} props
 * @param {{ xp: number, yp: number }|null} props.from
 * @param {{ xp: number, yp: number }|null} props.to
 * @param {string} [props.className]
 */
function PctDirectLineImpl({ from, to, className = 'fm-pct-direct-line' }) {
  if (!from || !to) return null;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={className} aria-hidden>
      <line x1={from.xp} y1={from.yp} x2={to.xp} y2={to.yp} className={`${className}__stroke`} />
    </svg>
  );
}

export const PctDirectLine = React.memo(PctDirectLineImpl);
PctDirectLine.displayName = 'PctDirectLine';
