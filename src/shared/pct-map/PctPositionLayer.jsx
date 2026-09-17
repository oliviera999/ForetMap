import React from 'react';

/**
 * Position de la personne sur une carte « % image » (lot 6, `docs/AUDIT_PLAN_LYAUTEY_2026-09.md`
 * §4.2) : repère, **halo de précision** proportionnel à la précision annoncée par le capteur, et
 * **cap** — vers où l'on se dirige.
 *
 * Deux formes, et la différence entre les deux est une information :
 *   - **flèche** dès qu'un cap est connu : elle pointe vers là où la personne va (route GPS en
 *     marche, boussole à l'arrêt — `pickTravelHeadingDeg`). Un disque ne dit jamais de quel côté
 *     on regarde ; sur un plan d'établissement, où deux couloirs se ressemblent, c'est
 *     précisément ce qu'il faut savoir pour partir du bon côté ;
 *   - **disque** quand aucun cap n'est disponible. Une flèche pointée au hasard mentirait.
 *
 * Le halo dit la vérité : plus le capteur est imprécis, plus il est large. Hors du plan, le
 * repère est collé au bord le plus proche et porte une flèche vers l'endroit réel, plutôt que
 * de disparaître sans explication.
 *
 * Le halo est dimensionné en **pixels du calque** (`accuracyHaloDiameterPx`) : il représente
 * une distance au sol, il grandit donc avec le zoom, mais reste un disque. Il était jusqu'ici
 * exprimé en pourcentage d'un parent sans dimension — donc rendu à 0 × 0, invisible depuis le
 * lot 6 (`docs/AUDIT_PLAN_AFFICHAGE_2026-09.md` C8). Le repère, lui, garde une taille écran
 * fixe (un point de position qui grossit avec le zoom se lit mal).
 *
 * Carte orientée (heading-up) : le calque entier tourne de `−cap`, la flèche de `+cap` — elle
 * pointe donc vers le haut de l'écran, ce qui est exactement ce que l'on veut d'un repère de
 * navigation.
 *
 * @param {object} props
 * @param {{ xp: number, yp: number, offMap?: boolean, bearingDeg?: number }|null} props.position
 * @param {number} [props.haloPx] diamètre du halo de précision, en pixels du calque
 *   (`accuracyHaloDiameterPx`) ; `0` = pas de halo.
 * @param {number|null} [props.headingDeg] cap **à l'écran**, en degrés horaires depuis le haut.
 *   Peut être continu (hors [0, 360[) : la transition CSS prend alors le chemin le plus court.
 * @param {'gps'|'compass'|null} [props.headingSource] d'où vient ce cap (diagnostic, styles).
 * @param {number|null} [props.accuracyM] précision en mètres (nom accessible).
 * @param {string} [props.className]
 */
function PctPositionLayerImpl({
  position,
  haloPx = 0,
  headingDeg = null,
  headingSource = null,
  accuracyM = null,
  className = 'fm-pct-position',
}) {
  if (!position) return null;
  const { xp, yp, offMap = false, bearingDeg = 0 } = position;
  const accuracyLabel =
    accuracyM != null && Number.isFinite(Number(accuracyM))
      ? ` à ${Math.round(Number(accuracyM))} mètres près`
      : '';
  const bearing = !offMap && headingDeg != null && Number.isFinite(Number(headingDeg));
  return (
    <div
      className={`${className}${offMap ? ' is-off-map' : ''}${bearing ? ' has-bearing' : ''}`}
      style={{ left: `${xp}%`, top: `${yp}%` }}
      data-heading-source={bearing ? headingSource || 'unknown' : undefined}
      role="img"
      aria-label={
        offMap
          ? 'Votre position est hors du plan, dans la direction indiquée'
          : bearing
            ? `Votre position et votre direction${accuracyLabel}`
            : `Votre position${accuracyLabel}`
      }
    >
      {haloPx > 0 && !offMap ? (
        <span
          className={`${className}__halo`}
          style={{ width: `${haloPx}px`, height: `${haloPx}px` }}
          aria-hidden
        />
      ) : null}
      {bearing ? (
        <span
          className={`${className}__bearing`}
          style={{
            transform: `translate(-50%, -50%) rotate(${Number(headingDeg)}deg) scale(var(--pct-inv, 1))`,
          }}
          aria-hidden
        >
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden>
            <path d="M12 2.2 L20 21.2 L12 16.4 L4 21.2 Z" />
          </svg>
        </span>
      ) : (
        <span className={`${className}__dot`} aria-hidden />
      )}
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
