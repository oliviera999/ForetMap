import React from 'react';

function markerValue(marker, key) {
  const raw = Number(marker?.[key]);
  if (!Number.isFinite(raw)) return 50;
  return Math.max(0, Math.min(100, raw));
}

export function GLBoardMarkers({
  markers,
  selectedMarkerId = null,
  onMarkerClick,
  onMarkerPointerDown,
  className = 'gl-board-marker',
}) {
  if (!Array.isArray(markers) || markers.length === 0) return null;
  return markers.map((marker) => {
    const isSelected = selectedMarkerId != null && Number(selectedMarkerId) === Number(marker.id);
    const classes = [className];
    if (isSelected) classes.push('is-selected');
    return (
      <button
        key={marker.id}
        type="button"
        className={classes.join(' ')}
        style={{ left: `${markerValue(marker, 'x_pct')}%`, top: `${markerValue(marker, 'y_pct')}%` }}
        title={marker.label}
        data-marker-id={marker.id}
        onClick={(event) => {
          event.stopPropagation();
          onMarkerClick?.(marker);
        }}
        onPointerDown={(event) => onMarkerPointerDown?.(event, marker)}
      >
        {marker.label}
      </button>
    );
  });
}
