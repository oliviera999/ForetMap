import React, { useCallback } from 'react';

/**
 * Repère ponctuel d'une carte « % image » : bouton positionné en pourcentage, mémoïsé avec
 * un handler stable par repère (un repère ne se re-rend que si son objet change).
 */
const PctMarkerButton = React.memo(function PctMarkerButton({
  marker,
  isActive,
  onMarkerClick,
  labelOf,
}) {
  const handleClick = useCallback(
    (event) => onMarkerClick?.(marker, event),
    [marker, onMarkerClick],
  );
  const label = labelOf(marker);
  return (
    <button
      type="button"
      className={`fm-pct-marker${isActive ? ' is-active' : ''}`}
      style={{ left: `${marker.x_pct}%`, top: `${marker.y_pct}%` }}
      aria-label={label || 'Lieu'}
      onClick={handleClick}
    >
      <span className="fm-pct-marker__pin" aria-hidden>
        {String(marker.emoji || '').trim() || '📍'}
      </span>
      {label ? <span className="fm-pct-marker__label">{label}</span> : null}
    </button>
  );
});

/**
 * Calque des repères d'une carte « % image » (noyau carte partagé, lot 4). Neutre : le
 * produit habille `.fm-pct-marker*` et décide de l'action au clic.
 *
 * @param {object} props
 * @param {Array<object>} props.markers repères `{ id, x_pct, y_pct, label, emoji }`.
 * @param {(marker: object, event: object) => void} props.onMarkerClick handler stable.
 * @param {string|null} [props.activeMarkerId]
 * @param {(marker: object) => string} [props.labelOf]
 */
function PctMarkersLayerImpl({
  markers,
  onMarkerClick,
  activeMarkerId = null,
  labelOf = (m) => String(m?.label ?? m?.name ?? '').trim(),
}) {
  return (markers || []).map((marker) => (
    <PctMarkerButton
      key={marker.id}
      marker={marker}
      isActive={activeMarkerId != null && String(activeMarkerId) === String(marker.id)}
      onMarkerClick={onMarkerClick}
      labelOf={labelOf}
    />
  ));
}

export const PctMarkersLayer = React.memo(PctMarkersLayerImpl);
PctMarkersLayer.displayName = 'PctMarkersLayer';
