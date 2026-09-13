/**
 * Bouton (présentation) d'un repère de visite positionné sur le plan.
 * Statut vu/non-vu : opacité au repos + libellé au survol/focus (pas de pastille).
 */
export function VisitMapMarkerButton({ marker, isSeen, onClick }) {
  const label = String(marker.label || '').trim();
  const statusLabel = isSeen ? 'Vu' : 'À découvrir';
  const accessibleName = label || 'Repère visite';
  return (
    <button
      type="button"
      className={`visit-marker-btn ${isSeen ? 'is-seen' : 'is-unseen'}`}
      aria-label={`${accessibleName} — ${statusLabel}`}
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
      <span className="visit-marker-status" aria-hidden="true">
        {statusLabel}
      </span>
    </button>
  );
}
