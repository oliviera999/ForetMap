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
        <span className="visit-marker-emoji">{marker.emoji}</span>
      ) : (
        <span
          className="visit-marker-emoji visit-marker-emoji--empty"
          aria-hidden
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#1a4731',
            opacity: 0.55,
          }}
        />
      )}
      {label ? <span className="visit-marker-label">{label}</span> : null}
      <span className={`visit-marker-indicator ${isSeen ? 'is-seen' : 'is-unseen'}`} />
    </button>
  );
}
