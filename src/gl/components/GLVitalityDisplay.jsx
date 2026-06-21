import React from 'react';

export function GLVitalityCounts({ health = 0, power = 0, className = '' }) {
  return (
    <span className={`gl-vitality-counts ${className}`.trim()}>
      <span className="gl-vitality-count gl-vitality-count--health" title="Points de vie">
        <span className="foretmap-emoji-text-mixed" aria-hidden>
          ❤️
        </span>{' '}
        <span className="gl-vitality-count-value">{Number(health) || 0}</span>
      </span>
      <span className="gl-vitality-count gl-vitality-count--power" title="Points de pouvoir">
        <span className="foretmap-emoji-text-mixed" aria-hidden>
          💎
        </span>{' '}
        <span className="gl-vitality-count-value">{Number(power) || 0}</span>
      </span>
    </span>
  );
}

export function GLVitalityBadge({ health = 0, power = 0, onClick = null }) {
  const content = <GLVitalityCounts health={health} power={power} />;
  if (typeof onClick === 'function') {
    return (
      <button
        type="button"
        className="gl-vitality-badge gl-vitality-badge--button"
        role="status"
        aria-label={`${health} points de vie, ${power} points de pouvoir — voir mes statistiques`}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }
  return (
    <span
      className="gl-vitality-badge"
      role="status"
      aria-label={`${health} points de vie, ${power} points de pouvoir`}
    >
      {content}
    </span>
  );
}

export function GLVitalityAdjustButtons({
  health,
  power,
  disabled = false,
  busy = false,
  onAdjust,
}) {
  return (
    <div className="gl-vitality-adjust">
      <div className="gl-vitality-adjust-group">
        <GLVitalityCounts health={health} power={power} />
      </div>
      <div className="gl-vitality-adjust-row">
        <span className="gl-vitality-adjust-label foretmap-emoji-text-mixed" aria-hidden>
          ❤️
        </span>
        <button
          type="button"
          className="gl-vitality-btn"
          disabled={disabled || busy}
          aria-label="Retirer un point de vie"
          onClick={() => onAdjust?.({ healthDelta: -1, powerDelta: 0 })}
        >
          −
        </button>
        <button
          type="button"
          className="gl-vitality-btn"
          disabled={disabled || busy}
          aria-label="Ajouter un point de vie"
          onClick={() => onAdjust?.({ healthDelta: 1, powerDelta: 0 })}
        >
          +
        </button>
      </div>
      <div className="gl-vitality-adjust-row">
        <span className="gl-vitality-adjust-label foretmap-emoji-text-mixed" aria-hidden>
          💎
        </span>
        <button
          type="button"
          className="gl-vitality-btn"
          disabled={disabled || busy}
          aria-label="Retirer un point de pouvoir"
          onClick={() => onAdjust?.({ healthDelta: 0, powerDelta: -1 })}
        >
          −
        </button>
        <button
          type="button"
          className="gl-vitality-btn"
          disabled={disabled || busy}
          aria-label="Ajouter un point de pouvoir"
          onClick={() => onAdjust?.({ healthDelta: 0, powerDelta: 1 })}
        >
          +
        </button>
      </div>
    </div>
  );
}
