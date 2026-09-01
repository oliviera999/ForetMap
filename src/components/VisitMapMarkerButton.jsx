/**
 * Bouton (présentation) d'un repère de visite positionné sur le plan.
 */
export function VisitMapMarkerButton({ marker, isSeen, onClick }) {
  const label = String(marker.label || '').trim();
  return (
    <button
      type="button"
      className="visit-marker-btn"
      aria-label={label || 'Repère visite'}
      style={{ left: `${marker.x_pct}%`, top: `${marker.y_pct}%` }}
      onClick={onClick}
    >
      {marker.emoji ? (
        <span className="visit-marker-emoji map-overlay-emoji-label">{marker.emoji}</span>
      ) : (
        <span
          className="visit-marker-emoji visit-marker-emoji--empty"
          aria-hidden
          style={{
            display: 'inline-block',
            width: 'calc(8px * var(--map-overlay-world-inv, 1))',
            height: 'calc(8px * var(--map-overlay-world-inv, 1))',
            borderRadius: '50%',
            background: '#1a4731',
            opacity: 0.55,
          }}
        />
      )}
      {label ? (
        <span className="visit-marker-label map-overlay-name-label map-overlay-name-label--html">
          {label}
        </span>
      ) : null}
      <span className={`visit-marker-indicator ${isSeen ? 'is-seen' : 'is-unseen'}`} />
    </button>
  );
}
