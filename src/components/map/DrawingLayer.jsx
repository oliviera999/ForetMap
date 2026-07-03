import React from 'react';

/**
 * Calque SVG du tracé de zone en cours (mode `draw-zone`) — extrait de `renderDrawing`
 * (MapView). Polyligne pointillée + croix de visée par sommet.
 * DOM/classes/styles strictement inchangés ; mémoïsé (re-rend seulement quand les points,
 * les dimensions du plan ou le zoom changent).
 *
 * @param {object} props
 * @param {Array<{xp:number,yp:number}>} props.drawPoints points cliqués (% image)
 * @param {number} props.iw largeur naturelle du plan (px monde)
 * @param {number} props.ih hauteur naturelle du plan (px monde)
 * @param {number} props.inv inverse de l'échelle commitée (traits constants à l'écran)
 */
export const DrawingLayer = React.memo(function DrawingLayer({ drawPoints, iw, ih, inv }) {
  if (!drawPoints.length) return null;
  const wp = drawPoints.map((p) => ({ cx: (p.xp / 100) * iw, cy: (p.yp / 100) * ih }));
  const str = wp.map((p) => `${p.cx},${p.cy}`).join(' ');
  const rVis = Math.max(3.5, 5 * inv);
  const crossHalf = Math.max(7, 9 * inv);
  const crossStroke = Math.max(1, 1.1 * inv);
  const centerR = Math.max(1.2, 1.5 * inv);
  return (
    <g>
      {drawPoints.length > 1 && (
        <polyline
          points={str}
          fill="none"
          stroke="#52b788"
          strokeWidth={2 * inv}
          strokeDasharray={`${6 * inv},${3 * inv}`}
        />
      )}
      {wp.map((p, i) => (
        <g key={i} style={{ pointerEvents: 'none' }}>
          <circle
            cx={p.cx}
            cy={p.cy}
            r={rVis}
            fill="rgba(26,71,49,0.2)"
            stroke="rgba(26,71,49,0.9)"
            strokeWidth={1.5 * inv}
          />
          <line
            x1={p.cx - crossHalf}
            y1={p.cy}
            x2={p.cx + crossHalf}
            y2={p.cy}
            stroke="rgba(26,71,49,0.85)"
            strokeWidth={crossStroke}
            strokeLinecap="round"
          />
          <line
            x1={p.cx}
            y1={p.cy - crossHalf}
            x2={p.cx}
            y2={p.cy + crossHalf}
            stroke="rgba(26,71,49,0.85)"
            strokeWidth={crossStroke}
            strokeLinecap="round"
          />
          <circle cx={p.cx} cy={p.cy} r={centerR} fill="rgba(26,71,49,0.88)" />
        </g>
      ))}
    </g>
  );
});
