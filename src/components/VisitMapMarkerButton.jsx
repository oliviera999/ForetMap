import React from 'react';

/**
 * Bouton (présentation) d'un repère de visite positionné sur le plan — extrait
 * de `VisitView` (O6). Affiche l'emoji du repère (ou une pastille de repli quand
 * aucun emoji) et l'indicateur « vu / pas encore vu ». Le positionnement absolu
 * en pourcentage et le clic (déplacement mascotte / sélection) sont délégués au
 * parent. DOM/classes/textes/styles inline strictement inchangés.
 *
 * @param {object} props
 * @param {{ id: number|string, label?: string, emoji?: string, x_pct: number|string, y_pct: number|string }} props.marker repère à afficher
 * @param {boolean} props.isSeen repère déjà marqué comme vu (indicateur `is-seen` vs `is-unseen`)
 * @param {(event: React.MouseEvent<HTMLButtonElement>) => void} props.onClick clic sur le repère (l'évènement reste disponible pour `stopPropagation`)
 */
export function VisitMapMarkerButton({ marker, isSeen, onClick }) {
  return (
    <button
      type="button"
      className="visit-marker-btn"
      aria-label={String(marker.label || '').trim() || 'Repère visite'}
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
      <span className={`visit-marker-indicator ${isSeen ? 'is-seen' : 'is-unseen'}`} />
    </button>
  );
}
