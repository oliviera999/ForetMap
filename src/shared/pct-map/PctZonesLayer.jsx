import React, { useMemo } from 'react';

import { parsePctPolygonPoints } from './pctPolygon.js';

/**
 * Calque SVG des zones d'une carte « % image » (noyau carte partagé, lot 4).
 *
 * `viewBox="0 0 100 100"` + `preserveAspectRatio="none"` : les points stockés en pourcentage
 * de l'image se tracent tels quels, quel que soit le zoom, tant que le calque parent épouse
 * le rectangle « contain » (voir `PctImageLayer`). Version neutre et minimale du calque de
 * la Visite (`VisitZonesSvgLayer`), sans progression ni typographie adaptative : le plan
 * n'affiche que contour, emoji et nom.
 *
 * @param {object} props
 * @param {Array<object>} props.zones zones `{ id, name, points, color, emoji }`.
 * @param {(zone: object, event: object) => void} props.onZoneClick handler stable.
 * @param {string|null} [props.activeZoneId] zone mise en avant (fiche ouverte).
 * @param {boolean} [props.showLabels=true] afficher emoji et nom au centre.
 * @param {string} [props.className]
 */
function PctZonesLayerImpl({
  zones,
  onZoneClick,
  activeZoneId = null,
  showLabels = true,
  className = 'fm-pct-zones',
}) {
  const parsed = useMemo(
    () =>
      (zones || [])
        .map((zone) => {
          const points = parsePctPolygonPoints(zone.points);
          if (points.length < 3) return null;
          return {
            zone,
            pointsAttr: points.map((p) => `${p.xp},${p.yp}`).join(' '),
            cx: points.reduce((sum, p) => sum + p.xp, 0) / points.length,
            cy: points.reduce((sum, p) => sum + p.yp, 0) / points.length,
          };
        })
        .filter(Boolean),
    [zones],
  );

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={className}>
      {parsed.map(({ zone, pointsAttr, cx, cy }) => {
        const isActive = activeZoneId != null && String(activeZoneId) === String(zone.id);
        const name = String(zone.name || '').trim();
        const emoji = String(zone.emoji || '').trim();
        return (
          <g
            key={zone.id}
            className={`fm-pct-zone${isActive ? ' is-active' : ''}`}
            onClick={onZoneClick ? (event) => onZoneClick(zone, event) : undefined}
          >
            <polygon
              points={pointsAttr}
              className="fm-pct-zone__poly"
              style={zone.color ? { fill: zone.color } : undefined}
            />
            {showLabels && emoji ? (
              <text x={cx} y={cy} className="fm-pct-zone__emoji" textAnchor="middle">
                {emoji}
              </text>
            ) : null}
            {showLabels && name ? (
              <text
                x={cx}
                y={cy + (emoji ? 4 : 0)}
                className="fm-pct-zone__name"
                textAnchor="middle"
              >
                {name}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export const PctZonesLayer = React.memo(PctZonesLayerImpl);
PctZonesLayer.displayName = 'PctZonesLayer';
