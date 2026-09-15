/**
 * Bouton (présentation) d'un repère de visite positionné sur le plan.
 * Statut vu/non-vu : opacité au repos ; libellé au survol/focus optionnel (`showSeenLabels`).
 */
export function VisitMapMarkerButton({
  marker,
  isSeen,
  onClick,
  showSeenStatus = true,
  showSeenLabels = false,
}) {
  const label = String(marker.label || '').trim();
  const statusLabel = showSeenStatus ? (isSeen ? 'Vu' : 'À découvrir') : null;
  const accessibleName = label || 'Repère visite';
  const seenClass = showSeenStatus ? (isSeen ? 'is-seen' : 'is-unseen') : '';
  return (
    <button
      type="button"
      className={`visit-marker-btn ${seenClass}`.trim()}
      aria-label={statusLabel ? `${accessibleName} — ${statusLabel}` : accessibleName}
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
      {showSeenLabels && statusLabel ? (
        <span className="visit-marker-status" aria-hidden="true">
          {statusLabel}
        </span>
      ) : null}
    </button>
  );
}
