import React from 'react';

/**
 * Aperçu SVG des contours alignés (avant sauvegarde) — traits pointillés orange.
 *
 * @param {object} props
 * @param {Array<{ id: string, points: Array<{xp:number,yp:number}> }>|null} props.aligned
 * @param {number} props.iw
 * @param {number} props.ih
 * @param {number} props.inv
 */
export const AlignZonesPreviewLayer = React.memo(function AlignZonesPreviewLayer({
  aligned,
  iw,
  ih,
  inv,
}) {
  if (!aligned?.length) return null;
  return (
    <g className="map-align-zones-preview" pointerEvents="none" aria-hidden="true">
      {aligned.map((z) => {
        const pts = (z.points || [])
          .map((p) => `${(Number(p.xp) / 100) * iw},${(Number(p.yp) / 100) * ih}`)
          .join(' ');
        if (!pts) return null;
        return (
          <polygon
            key={z.id}
            points={pts}
            fill="rgba(249, 115, 22, 0.18)"
            stroke="#ea580c"
            strokeWidth={2.5 * inv}
            strokeDasharray={`${6 * inv} ${4 * inv}`}
          />
        );
      })}
    </g>
  );
});
