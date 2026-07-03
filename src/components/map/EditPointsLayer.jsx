import React from 'react';

/**
 * Calque SVG d'édition du contour d'une zone (mode `edit-points`) — extrait de
 * `renderEditPts` (MapView). Surface translatable + poignées de sommets (anneau léger,
 * croix de visée, disque tactile invisible). DOM/classes/styles strictement inchangés ;
 * mémoïsé (re-rend seulement quand les sommets, le zoom ou le sommet glissé changent).
 *
 * @param {object} props
 * @param {string} props.mode mode carte (rend uniquement en `edit-points`)
 * @param {Array<{xp:number,yp:number}>} props.editPoints sommets (% image)
 * @param {number} props.draggingPtIdx index du sommet en cours de glissement (-1 sinon)
 * @param {number} props.iw largeur naturelle du plan (px monde)
 * @param {number} props.ih hauteur naturelle du plan (px monde)
 * @param {number} props.inv inverse de l'échelle commitée (traits constants à l'écran)
 * @param {(e: React.PointerEvent) => void} props.onTranslatePointerDown début translation
 * @param {(e: React.PointerEvent) => void} props.onTranslatePointerMove translation en cours
 * @param {(e: React.PointerEvent) => void} props.endEditZoneTranslate fin/annulation translation
 * @param {() => void} props.onTranslateLostPointerCapture perte de capture translation
 * @param {(i: number, e: React.PointerEvent) => void} props.onEditPointPointerDown début glissement sommet
 * @param {(i: number, e: React.PointerEvent) => void} props.onEditPointPointerMove glissement sommet
 * @param {(e: React.PointerEvent) => void} props.onEditPointPointerUp fin glissement sommet
 */
export const EditPointsLayer = React.memo(function EditPointsLayer({
  mode,
  editPoints,
  draggingPtIdx,
  iw,
  ih,
  inv,
  onTranslatePointerDown,
  onTranslatePointerMove,
  endEditZoneTranslate,
  onTranslateLostPointerCapture,
  onEditPointPointerDown,
  onEditPointPointerMove,
  onEditPointPointerUp,
}) {
  if (mode !== 'edit-points' || !editPoints.length) return null;
  const wp = editPoints.map((p) => ({ cx: (p.xp / 100) * iw, cy: (p.yp / 100) * ih }));
  const str = wp.map((p) => `${p.cx},${p.cy}`).join(' ');
  /** Anneau léger + croix : voir le sol sous le sommet ; disque invisible pour le doigt. */
  const rHit = Math.max(22, 14 * inv);
  const rVis = Math.max(4, 5.5 * inv);
  const crossHalf = Math.max(9, 11 * inv);
  const crossStroke = Math.max(1, 1.2 * inv);
  const centerR = Math.max(1.4, 1.7 * inv);
  return (
    <g>
      <polygon
        className="edit-zone-translate"
        points={str}
        fill="rgba(82,183,136,0.2)"
        stroke="#52b788"
        strokeWidth={2 * inv}
        style={{ cursor: 'move', touchAction: 'none' }}
        onPointerDown={onTranslatePointerDown}
        onPointerMove={onTranslatePointerMove}
        onPointerUp={endEditZoneTranslate}
        onPointerCancel={endEditZoneTranslate}
        onLostPointerCapture={onTranslateLostPointerCapture}
      />
      {wp.map((p, i) => {
        const dragging = draggingPtIdx === i;
        return (
          <g
            key={i}
            className={`edit-pt${dragging ? ' edit-pt--dragging' : ''}`}
            style={{ cursor: 'grab', touchAction: 'none' }}
            onPointerDown={(e) => onEditPointPointerDown(i, e)}
            onPointerMove={(e) => onEditPointPointerMove(i, e)}
            onPointerUp={onEditPointPointerUp}
          >
            <circle cx={p.cx} cy={p.cy} r={rHit} fill="transparent" />
            <circle
              cx={p.cx}
              cy={p.cy}
              r={rVis}
              fill={dragging ? 'rgba(26,71,49,0.38)' : 'rgba(255,255,255,0.18)'}
              stroke="#1a4731"
              strokeWidth={dragging ? 2.4 * inv : 1.6 * inv}
              style={{ pointerEvents: 'none' }}
            />
            <g className="edit-pt-cross" style={{ pointerEvents: 'none' }}>
              <line
                x1={p.cx - crossHalf}
                y1={p.cy}
                x2={p.cx + crossHalf}
                y2={p.cy}
                stroke="rgba(26,71,49,0.88)"
                strokeWidth={crossStroke}
                strokeLinecap="round"
              />
              <line
                x1={p.cx}
                y1={p.cy - crossHalf}
                x2={p.cx}
                y2={p.cy + crossHalf}
                stroke="rgba(26,71,49,0.88)"
                strokeWidth={crossStroke}
                strokeLinecap="round"
              />
            </g>
            <circle
              cx={p.cx}
              cy={p.cy}
              r={centerR}
              fill={dragging ? '#1a4731' : 'rgba(26,71,49,0.82)'}
              style={{ pointerEvents: 'none' }}
            />
          </g>
        );
      })}
    </g>
  );
});
