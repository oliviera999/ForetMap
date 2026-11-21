import { useEffect, useState } from 'react';
import { resolveMarkerAppearance } from '../utils/glMarkerAppearance.js';
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
  markerPathNumbers = null,
  onMarkerClick,
  onMarkerPointerDown,
  className = 'gl-board-marker',
  statique = false,
}) {
  const resolveIconUrl = useResolveGlMarkerIconDisplayUrl();
  if (!Array.isArray(markers) || markers.length === 0) return null;
  return markers.map((marker) => {
    const appearance = resolveMarkerAppearance(marker);
    const isSelected = selectedMarkerId != null && Number(selectedMarkerId) === Number(marker.id);
    const pathNumber =
      markerPathNumbers instanceof Map ? markerPathNumbers.get(Number(marker.id)) : null;
    const classes = [className, `gl-board-marker--${appearance.displayMode}`];
    if (isSelected) classes.push('is-selected');
    const ariaLabel =
      pathNumber != null
        ? `Repère ${pathNumber}${appearance.ariaLabel ? ` — ${appearance.ariaLabel}` : ''}`
        : appearance.ariaLabel;
    // Projection (`statique`) : la case se lit, elle ne se touche pas — une image nommée, pas
    // un bouton (ni clic, ni focus clavier).
    const Case = statique ? 'span' : 'button';
    if (statique) classes.push(`${className}--statique`);
    return (
      <Case
        key={marker.id}
        type={statique ? undefined : 'button'}
        role={statique ? 'img' : undefined}
        className={classes.join(' ')}
        style={{
          left: `${markerValue(marker, 'x_pct')}%`,
          top: `${markerValue(marker, 'y_pct')}%`,
        }}
        title={ariaLabel}
        aria-label={ariaLabel}
        data-marker-id={marker.id}
        data-path-number={pathNumber != null ? pathNumber : undefined}
        onClick={
          statique
            ? undefined
            : (event) => {
                event.stopPropagation();
                onMarkerClick?.(marker);
              }
        }
        onPointerDown={statique ? undefined : (event) => onMarkerPointerDown?.(event, marker)}
      >
        {pathNumber != null ? (
          <span className="gl-board-marker__path-number" aria-hidden>
            {pathNumber}
          </span>
        ) : null}
        <MarkerVisual
          appearance={appearance}
          label={marker.label}
          resolveIconUrl={resolveIconUrl}
        />
      </Case>
    );
  });
}
