import React, { useMemo, useRef } from 'react';
import { editEdgeMidpoints } from '../../utils/zoneEditGeometry.js';

/** Au-delà de ce nombre de sommets, les poignées « fantômes » encombrent : on les masque. */
const MIDPOINT_HANDLES_MAX_POINTS = 60;

/**
 * Calque SVG d'édition du contour d'une zone (mode `edit-points`) — extrait de
 * `renderEditPts` (MapView). Surface translatable + poignées de sommets (anneau léger,
 * croix de visée, disque tactile invisible).
 *
 * Il porte aussi les interactions d'édition avancée :
 * - poignées « fantômes » au milieu de chaque arête (appui = nouveau sommet, que l'on
 *   peut glisser dans le même geste) ;
 * - bande d'arête cliquable quand le mode « ＋ Sommet » est actif ;
 * - fond capteur pour le pan de la vue et la désélection au clic ;
 * - rendu des sommets sélectionnés et du rectangle de lasso.
 *
 * @param {object} props
 * @param {string} props.mode mode carte (rend uniquement en `edit-points`)
 * @param {Array<{xp:number,yp:number}>} props.editPoints sommets (% image)
 * @param {number} props.draggingPtIdx index du sommet en cours de glissement (-1 sinon)
 * @param {Set<number>} [props.selectedPtIdxs] indices des sommets sélectionnés
 * @param {boolean} [props.insertVertexMode] mode « cliquer sur un bord pour ajouter »
 * @param {number} props.iw largeur naturelle du plan (px monde)
 * @param {number} props.ih hauteur naturelle du plan (px monde)
 * @param {number} props.inv inverse de l'échelle commitée (traits constants à l'écran)
 * @param {(clientX:number, clientY:number) => ({xp:number,yp:number}|null)} [props.toImagePct]
 * @param {(e: React.PointerEvent) => void} props.onTranslatePointerDown début translation
 * @param {(e: React.PointerEvent) => void} props.onTranslatePointerMove translation en cours
 * @param {(e: React.PointerEvent) => void} props.endEditZoneTranslate fin/annulation translation
 * @param {() => void} props.onTranslateLostPointerCapture perte de capture translation
 * @param {(i: number, e: React.PointerEvent) => void} props.onEditPointPointerDown début glissement sommet
 * @param {(i: number, e: React.PointerEvent) => void} props.onEditPointPointerMove glissement sommet
 * @param {(e: React.PointerEvent) => void} props.onEditPointPointerUp fin glissement sommet
 * @param {(pct: {xp:number,yp:number}) => number} [props.onInsertPointFromPct] insertion sur l'arête la plus proche
 * @param {(index: number, point: {xp:number,yp:number}) => number} [props.onInsertPointAtMidpoint] insertion au milieu d'une arête
 * @param {(e: React.PointerEvent) => void} [props.onBackgroundPointerDown]
 * @param {(e: React.PointerEvent) => void} [props.onBackgroundPointerMove]
 * @param {(e: React.PointerEvent) => void} [props.onBackgroundPointerUp]
 * @param {() => void} [props.onBackgroundLostPointerCapture]
 */
export const EditPointsLayer = React.memo(function EditPointsLayer({
  mode,
  editPoints,
  draggingPtIdx,
  selectedPtIdxs,
  insertVertexMode = false,
  iw,
  ih,
  inv,
  toImagePct,
  onTranslatePointerDown,
  onTranslatePointerMove,
  endEditZoneTranslate,
  onTranslateLostPointerCapture,
  onEditPointPointerDown,
  onEditPointPointerMove,
  onEditPointPointerUp,
  onInsertPointFromPct,
  onInsertPointAtMidpoint,
  onBackgroundPointerDown,
  onBackgroundPointerMove,
  onBackgroundPointerUp,
  onBackgroundLostPointerCapture,
}) {
  // Index du sommet créé par une poignée fantôme : le glissement se poursuit sur lui.
  const midDragIdxRef = useRef(-1);
  const midpoints = useMemo(
    () =>
      mode === 'edit-points' && editPoints.length <= MIDPOINT_HANDLES_MAX_POINTS
        ? editEdgeMidpoints(editPoints)
        : [],
    [mode, editPoints],
  );

  if (mode !== 'edit-points' || !editPoints.length) return null;
  const selected = selectedPtIdxs || new Set();
  const wp = editPoints.map((p) => ({ cx: (p.xp / 100) * iw, cy: (p.yp / 100) * ih }));
  const str = wp.map((p) => `${p.cx},${p.cy}`).join(' ');
  /** Anneau léger + croix : voir le sol sous le sommet ; disque invisible pour le doigt. */
  const rHit = Math.max(22, 14 * inv);
  const rVis = Math.max(4, 5.5 * inv);
  const crossHalf = Math.max(9, 11 * inv);
  const crossStroke = Math.max(1, 1.2 * inv);
  const centerR = Math.max(1.4, 1.7 * inv);
  const rMidHit = Math.max(18, 11 * inv);
  const rMid = Math.max(3, 3.6 * inv);
  const edgeBandWidth = Math.max(26, 18 * inv);

  const handleMidPointerDown = (m, e) => {
    if (typeof onInsertPointAtMidpoint !== 'function') return;
    e.stopPropagation();
    const created = onInsertPointAtMidpoint(m.index, { xp: m.xp, yp: m.yp });
    if (!Number.isInteger(created) || created < 0) return;
    midDragIdxRef.current = created;
    onEditPointPointerDown(created, e);
  };

  const handleMidPointerMove = (e) => {
    if (midDragIdxRef.current < 0) return;
    onEditPointPointerMove(midDragIdxRef.current, e);
  };

  const handleMidPointerUp = (e) => {
    if (midDragIdxRef.current < 0) return;
    midDragIdxRef.current = -1;
    onEditPointPointerUp(e);
  };

  const handleEdgeBandClick = (e) => {
    if (!insertVertexMode || typeof onInsertPointFromPct !== 'function') return;
    const pct = toImagePct?.(e.clientX, e.clientY);
    if (!pct) return;
    e.stopPropagation();
    onInsertPointFromPct(pct);
  };

  return (
    <g>
      {/* Fond capteur : glisser = pan de la vue ; clic simple = désélection. */}
      {typeof onBackgroundPointerDown === 'function' && (
        <rect
          className="edit-bg-capture"
          x={0}
          y={0}
          width={iw}
          height={ih}
          fill="transparent"
          style={{ cursor: 'grab', touchAction: 'none' }}
          onPointerDown={onBackgroundPointerDown}
          onPointerMove={onBackgroundPointerMove}
          onPointerUp={onBackgroundPointerUp}
          onPointerCancel={onBackgroundPointerUp}
          onLostPointerCapture={onBackgroundLostPointerCapture}
        />
      )}

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

      {/* Mode « ＋ Sommet » : bande épaisse le long du contour, cliquable. */}
      {insertVertexMode && (
        <polygon
          className="edit-edge-band"
          data-testid="edit-edge-band"
          points={str}
          fill="none"
          stroke="rgba(245,158,11,0.35)"
          strokeWidth={edgeBandWidth}
          strokeLinejoin="round"
          style={{ cursor: 'copy', touchAction: 'none' }}
          onClick={handleEdgeBandClick}
        />
      )}

      {/* Poignées « fantômes » : un appui crée un sommet au milieu de l'arête. */}
      {typeof onInsertPointAtMidpoint === 'function' &&
        midpoints.map((m) => {
          const cx = (m.xp / 100) * iw;
          const cy = (m.yp / 100) * ih;
          return (
            <g
              key={`mid-${m.index}`}
              className="edit-mid"
              data-testid={`edit-mid-${m.index}`}
              style={{ cursor: 'copy', touchAction: 'none' }}
              onPointerDown={(e) => handleMidPointerDown(m, e)}
              onPointerMove={handleMidPointerMove}
              onPointerUp={handleMidPointerUp}
              onPointerCancel={handleMidPointerUp}
            >
              <circle cx={cx} cy={cy} r={rMidHit} fill="transparent" />
              <circle
                cx={cx}
                cy={cy}
                r={rMid}
                className="edit-mid-dot"
                fill="rgba(255,255,255,0.55)"
                stroke="#1a4731"
                strokeWidth={Math.max(0.8, 1 * inv)}
                strokeDasharray={`${Math.max(1.5, 2 * inv)} ${Math.max(1.5, 2 * inv)}`}
                style={{ pointerEvents: 'none' }}
              />
            </g>
          );
        })}

      {wp.map((p, i) => {
        const dragging = draggingPtIdx === i;
        const isSelected = selected.has(i);
        return (
          <g
            key={i}
            className={`edit-pt${dragging ? ' edit-pt--dragging' : ''}${
              isSelected ? ' edit-pt--selected' : ''
            }`}
            data-testid={`edit-pt-${i}`}
            style={{ cursor: 'grab', touchAction: 'none' }}
            onPointerDown={(e) => onEditPointPointerDown(i, e)}
            onPointerMove={(e) => onEditPointPointerMove(i, e)}
            onPointerUp={onEditPointPointerUp}
          >
            <circle cx={p.cx} cy={p.cy} r={rHit} fill="transparent" />
            {isSelected && (
              <circle
                cx={p.cx}
                cy={p.cy}
                r={rVis + 3.2 * inv}
                fill="none"
                stroke="#f59e0b"
                strokeWidth={Math.max(1.4, 1.8 * inv)}
                style={{ pointerEvents: 'none' }}
              />
            )}
            <circle
              cx={p.cx}
              cy={p.cy}
              r={rVis}
              fill={
                dragging
                  ? 'rgba(26,71,49,0.38)'
                  : isSelected
                    ? 'rgba(245,158,11,0.35)'
                    : 'rgba(255,255,255,0.18)'
              }
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
