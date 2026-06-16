import React, { useRef, useState } from 'react';
import { pointsToSvgPolygon, normalizePctPoint, translatePctPoints } from './pctPolygon.js';

/**
 * Calque SVG (viewBox 0–100) : translation du polygone + poignées de sommets.
 * Inspiré de la carte tâches ForetMap (edit-pt, translation du contour).
 */
export function PctPolygonEditOverlay({
  points,
  onPointsChange,
  onGestureEnd,
  onVertexSelect,
  strokeColor = '#2563eb',
  fillColor = '#2563eb',
  fillOpacity = 0.22,
  vertexClassName = 'gl-pct-edit-pt',
  translateClassName = 'gl-pct-edit-zone-translate',
  toImagePct,
}) {
  const translateLastRef = useRef(null);
  const [draggingIdx, setDraggingIdx] = useState(-1);

  if (!Array.isArray(points) || points.length < 3 || typeof toImagePct !== 'function') {
    return null;
  }

  const str = pointsToSvgPolygon(points);

  const endTranslate = (e) => {
    translateLastRef.current = null;
    onGestureEnd?.();
    if (e?.currentTarget?.hasPointerCapture?.(e.pointerId)) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (_) {
        /* noop */
      }
    }
  };

  return (
    <g className="gl-pct-edit-overlay">
      <polygon
        className={translateClassName}
        points={str}
        fill={fillColor}
        fillOpacity={fillOpacity}
        stroke={strokeColor}
        strokeWidth="0.55"
        style={{ cursor: 'move', touchAction: 'none' }}
        onPointerDown={(e) => {
          e.stopPropagation();
          const p0 = toImagePct(e.clientX, e.clientY);
          if (!p0) return;
          translateLastRef.current = { x: p0.x, y: p0.y };
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch (_) {
            /* noop */
          }
        }}
        onPointerMove={(e) => {
          const last = translateLastRef.current;
          if (!last) return;
          const p2 = toImagePct(e.clientX, e.clientY);
          if (!p2) return;
          const dx = p2.x - last.x;
          const dy = p2.y - last.y;
          translateLastRef.current = { x: p2.x, y: p2.y };
          onPointsChange((prev) => translatePctPoints(prev, dx, dy));
          e.preventDefault();
        }}
        onPointerUp={endTranslate}
        onPointerCancel={endTranslate}
        onLostPointerCapture={() => {
          translateLastRef.current = null;
        }}
      />
      {points.map((point, index) => {
        const dragging = draggingIdx === index;
        return (
          <g
            key={`pt-${index}`}
            className={`${vertexClassName}${dragging ? ' is-dragging' : ''}`}
            style={{ cursor: 'grab', touchAction: 'none' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onVertexSelect?.(index);
              setDraggingIdx(index);
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch (_) {
                /* noop */
              }
            }}
            onPointerMove={(e) => {
              if (draggingIdx !== index) return;
              const p2 = toImagePct(e.clientX, e.clientY);
              if (!p2) return;
              onPointsChange((prev) =>
                prev.map((pt, j) => (j === index ? normalizePctPoint(p2) : pt)),
              );
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              setDraggingIdx(-1);
              onGestureEnd?.();
              if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
                try {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                } catch (_) {
                  /* noop */
                }
              }
            }}
          >
            <circle cx={point.x} cy={point.y} r="2.8" fill="transparent" />
            <circle
              cx={point.x}
              cy={point.y}
              r="1.35"
              className="gl-pct-edit-pt-ring"
              fill={dragging ? 'rgba(37, 99, 235, 0.45)' : 'rgba(255, 255, 255, 0.2)'}
              stroke={strokeColor}
              strokeWidth={dragging ? '0.45' : '0.35'}
              style={{ pointerEvents: 'none' }}
            />
            <g className="gl-pct-edit-pt-cross" style={{ pointerEvents: 'none' }}>
              <line
                x1={point.x - 2.2}
                y1={point.y}
                x2={point.x + 2.2}
                y2={point.y}
                stroke={strokeColor}
                strokeWidth="0.35"
                strokeLinecap="round"
              />
              <line
                x1={point.x}
                y1={point.y - 2.2}
                x2={point.x}
                y2={point.y + 2.2}
                stroke={strokeColor}
                strokeWidth="0.35"
                strokeLinecap="round"
              />
            </g>
            <circle
              cx={point.x}
              cy={point.y}
              r="0.45"
              fill={strokeColor}
              style={{ pointerEvents: 'none' }}
            />
          </g>
        );
      })}
    </g>
  );
}
