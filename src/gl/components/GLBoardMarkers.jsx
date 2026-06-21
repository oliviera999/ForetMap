import React, { useEffect, useState } from 'react';
import { resolveMarkerAppearance } from '../../utils/glMarkerAppearance.js';
import { useResolveGlMarkerIconDisplayUrl } from '../hooks/useResolveGlMarkerIconDisplayUrl.js';

function markerValue(marker, key) {
  const raw = Number(marker?.[key]);
  if (!Number.isFinite(raw)) return 50;
  return Math.max(0, Math.min(100, raw));
}

function MarkerVisual({ appearance, label, resolveIconUrl }) {
  const [iconFailed, setIconFailed] = useState(false);
  const resolvedIconUrl =
    appearance.displayMode === 'icon' && appearance.iconUrl
      ? resolveIconUrl(appearance.iconUrl)
      : null;

  useEffect(() => {
    setIconFailed(false);
  }, [appearance.iconUrl, resolvedIconUrl]);

  if (appearance.displayMode === 'emoji' && appearance.emoji) {
    return (
      <span className="gl-board-marker__emoji" aria-hidden>
        {appearance.emoji}
      </span>
    );
  }

  if (appearance.displayMode === 'icon' && resolvedIconUrl && !iconFailed) {
    return (
      <img
        className="gl-board-marker__icon"
        src={resolvedIconUrl}
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
  const resolveIconUrl = useResolveGlMarkerIconDisplayUrl();
  if (!Array.isArray(markers) || markers.length === 0) return null;
  return markers.map((marker) => {
    const appearance = resolveMarkerAppearance(marker);
    const isSelected = selectedMarkerId != null && Number(selectedMarkerId) === Number(marker.id);
    const classes = [className, `gl-board-marker--${appearance.displayMode}`];
    if (isSelected) classes.push('is-selected');
    const ariaLabel = appearance.ariaLabel;
    return (
      <button
        key={marker.id}
        type="button"
        className={classes.join(' ')}
        style={{
          left: `${markerValue(marker, 'x_pct')}%`,
          top: `${markerValue(marker, 'y_pct')}%`,
        }}
        title={ariaLabel}
        aria-label={ariaLabel}
        data-marker-id={marker.id}
        onClick={(event) => {
          event.stopPropagation();
          onMarkerClick?.(marker);
        }}
        onPointerDown={(event) => onMarkerPointerDown?.(event, marker)}
      >
        <MarkerVisual
          appearance={appearance}
          label={marker.label}
          resolveIconUrl={resolveIconUrl}
        />
      </button>
    );
  });
}
