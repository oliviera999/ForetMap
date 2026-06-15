import React from 'react';

/**
 * Aperçu (présentation) du polygone en cours de tracé d'une zone de visite —
 * extrait de `VisitView` (O6). Rendu à l'intérieur du calque SVG de la carte
 * (viewBox 0–100) : trace la polyligne reliant les points déjà posés et un
 * petit cercle sur chacun d'eux. Le mode de tracé et la collecte des points
 * sont gérés par le parent. DOM/attributs SVG strictement inchangés.
 *
 * @param {object} props
 * @param {Array<{ xp: number, yp: number }>} props.points points déjà posés (coordonnées en % de la carte)
 */
export function VisitDrawZonePreview({ points }) {
  return (
    <>
      <polyline
        points={points.map((pt) => `${pt.xp},${pt.yp}`).join(' ')}
        fill="none"
        stroke="#166534"
        strokeWidth="0.35"
        strokeDasharray="0.8 0.4"
      />
      {points.map((pt, idx) => (
        <circle key={`draw-${idx}`} cx={pt.xp} cy={pt.yp} r="0.7" fill="#166534" />
      ))}
    </>
  );
}
