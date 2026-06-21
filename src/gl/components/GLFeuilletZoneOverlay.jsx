import React, { useMemo } from 'react';
import { pointsToSvgPolygon } from '../../shared/pct-map/pctPolygon.js';

const NEAR_THRESHOLD_PCT = 4;

function distancePct(ax, ay, bx, by) {
  const dx = Number(ax) - Number(bx);
  const dy = Number(ay) - Number(by);
  return Math.sqrt(dx * dx + dy * dy);
}

export function GLFeuilletZoneOverlay({
  zones = [],
  presentedZoneIds = [],
  watchPosition = null,
  editMode = false,
  onZoneSelect,
  selectedZoneId = null,
  zoneNumbers = null,
}) {
  const presentedSet = useMemo(
    () => new Set((presentedZoneIds || []).map(String)),
    [presentedZoneIds],
  );

  if (!zones.length && !editMode) return null;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="gl-feuillet-zone-overlay"
      aria-hidden={!editMode}
    >
      {zones.map((zone) => {
        const isRead = presentedSet.has(String(zone.zoneId));
        const near =
          watchPosition && !isRead
            ? distancePct(watchPosition.xp, watchPosition.yp, zone.centreXp, zone.centreYp) <=
              NEAR_THRESHOLD_PCT
            : false;
        const isSelected = editMode && selectedZoneId === zone.zoneId;
        const zoneNumber =
          zoneNumbers instanceof Map ? zoneNumbers.get(String(zone.zoneId)) : null;
        const classes = [
          'gl-feuillet-zone-polygon',
          isRead ? 'is-read' : '',
          near ? 'is-near' : '',
          isSelected ? 'is-selected' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <g key={zone.zoneId} className="gl-feuillet-zone-group">
            <polygon
              className={classes}
              points={pointsToSvgPolygon(zone.points)}
              data-zone-id={zone.zoneId}
              onClick={(event) => {
                if (!editMode) return;
                event.stopPropagation();
                onZoneSelect?.(zone.zoneId);
              }}
            />
            {editMode ? (
              <>
                <circle
                  className="gl-feuillet-zone-centre"
                  cx={zone.centreXp}
                  cy={zone.centreYp}
                  r="0.9"
                />
                <text
                  className="gl-feuillet-zone-label"
                  x={zone.centreXp}
                  y={zone.centreYp - 1.8}
                  textAnchor="middle"
                >
                  {zoneNumber != null ? zoneNumber : zone.titre || zone.zoneId}
                </text>
              </>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
