import React, { useState } from 'react';
import { resolveMarkerAppearance } from '../../utils/glMarkerAppearance.js';

function markerValue(marker, key) {
  const raw = Number(marker?.[key]);
  if (!Number.isFinite(raw)) return 50;
  return Math.max(0, Math.min(100, raw));
}

function MarkerVisual({ appearance, label }) {
  const [iconFailed, setIconFailed] = useState(false);

  if (appearance.displayMode === 'emoji' && appearance.emoji) {
    return (
      <span className="gl-board-marker__emoji foretmap-emoji-text-mixed" aria-hidden>
        {appearance.emoji}
      </span>
    );
  }

  if (appearance.displayMode === 'icon' && appearance.iconUrl && !iconFailed) {
    return (
      <img
        className="gl-board-marker__icon"
        src={appearance.iconUrl}
        alt=""
        aria-hidden
        onError={() => setIconFailed(true)}
      />
    );
  }

  return <span className="gl-board-marker__label">{label}</span>;
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
    const appearance = resolveMarkerAppearance(marker);
    const isSelected = selectedMarkerId != null && Number(selectedMarkerId) === Number(marker.id);
    const classes = [
      className,
      `gl-board-marker--${appearance.displayMode}`,
    ];
    if (isSelected) classes.push('is-selected');
    const ariaLabel = appearance.ariaLabel;
    return (
      <button
        key={marker.id}
        type="button"
        className={classes.join(' ')}
        style={{ left: `${markerValue(marker, 'x_pct')}%`, top: `${markerValue(marker, 'y_pct')}%` }}
        title={ariaLabel}
        aria-label={ariaLabel}
        data-marker-id={marker.id}
        onClick={(event) => {
          event.stopPropagation();
          onMarkerClick?.(marker);
        }}
        onPointerDown={(event) => onMarkerPointerDown?.(event, marker)}
      >
        <MarkerVisual appearance={appearance} label={marker.label} />
      </button>
    );
  });
}
