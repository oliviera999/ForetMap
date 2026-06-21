import React from 'react';
import { pointsToSvgPolygon } from '../../shared/pct-map/pctPolygon.js';
import { PctPolygonEditOverlay } from '../../shared/pct-map/PctPolygonEditOverlay.jsx';
import { GL_KINGDOM_ZONE_DEFAULT_COLOR } from '../hooks/useGLKingdomZoneEditor.js';

export function GLKingdomZoneMapOverlay({ zoneEditor, mapGestures, onZonePolygonClick }) {
  const {
    displayZones,
    selectedZoneId,
    isEditingShape,
    drawPoints,
    draftColor,
    shapeSession,
    editStrokeColor,
    setSelectedVertexIndex,
  } = zoneEditor;

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="gl-kingdom-map-overlay">
      {displayZones.map((zone) => {
        const isSelected = Number(selectedZoneId) === Number(zone.id);
        const hideWhileShapeEdit = isEditingShape && !isSelected;
        if (hideWhileShapeEdit) {
          return (
            <polygon
              key={zone.id}
              className="gl-kingdom-zone-polygon gl-kingdom-zone-polygon--dimmed"
              points={pointsToSvgPolygon(zone.points)}
              fill={zone.color || GL_KINGDOM_ZONE_DEFAULT_COLOR}
              fillOpacity="0.12"
              stroke={zone.color || GL_KINGDOM_ZONE_DEFAULT_COLOR}
              strokeWidth="0.35"
              style={{ pointerEvents: 'none' }}
            />
          );
        }
        return (
          <polygon
            key={zone.id}
            className={`gl-kingdom-zone-polygon${isSelected ? ' is-selected' : ''}`}
            points={pointsToSvgPolygon(zone.points)}
            fill={zone.color || GL_KINGDOM_ZONE_DEFAULT_COLOR}
            fillOpacity={isEditingShape && isSelected ? 0.15 : 0.3}
            stroke={zone.color || GL_KINGDOM_ZONE_DEFAULT_COLOR}
            strokeWidth="0.5"
            data-zone-id={zone.id}
            onClick={(e) => {
              if (isEditingShape) return;
              e.stopPropagation();
              onZonePolygonClick?.(zone.id, e);
            }}
          />
        );
      })}
      {drawPoints.length > 0 ? (
        <polygon
          className="gl-kingdom-zone-draft"
          points={pointsToSvgPolygon(drawPoints)}
          fill={draftColor || GL_KINGDOM_ZONE_DEFAULT_COLOR}
          fillOpacity="0.2"
          stroke={draftColor || GL_KINGDOM_ZONE_DEFAULT_COLOR}
          strokeWidth="0.6"
          strokeDasharray="1 1"
        />
      ) : null}
      {isEditingShape ? (
        <PctPolygonEditOverlay
          points={shapeSession.points}
          strokeColor={editStrokeColor}
          fillColor={editStrokeColor}
          toImagePct={mapGestures.toImagePct}
          onPointsChange={shapeSession.setPoints}
          onGestureEnd={shapeSession.scheduleRecordHistory}
          onVertexSelect={setSelectedVertexIndex}
        />
      ) : null}
    </svg>
  );
}
