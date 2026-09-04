import React, { useCallback } from 'react';

/**
 * Repère ponctuel d'une carte « % image » : bouton positionné en pourcentage, mémoïsé avec
 * un handler stable par repère (un repère ne se re-rend que si son objet change). Exporté
 * pour les produits qui composent eux-mêmes leur calque — le rendu d'un repère seul au sein
 * d'un calque de groupes, par exemple (lot 5).
 */
export const PctMarkerButton = React.memo(function PctMarkerButton({
  marker,
  isActive,
  onMarkerClick,
  labelOf,
  nameOf = defaultName,
}) {
  const handleClick = useCallback(
    (event) => onMarkerClick?.(marker, event),
    [marker, onMarkerClick],
  );
  // Nom **visible** (masqué au dézoom par le produit) et nom **accessible** sont deux choses
  // différentes : une étiquette cachée pour la lisibilité ne doit pas rendre le repère
  // anonyme au lecteur d'écran.
  const label = labelOf(marker);
  const accessibleName = nameOf(marker) || label;
  return (
    <button
      type="button"
      className={`fm-pct-marker${isActive ? ' is-active' : ''}`}
      style={{ left: `${marker.x_pct}%`, top: `${marker.y_pct}%` }}
      aria-label={accessibleName || 'Lieu'}
      onClick={handleClick}
    >
      <span className="fm-pct-marker__pin" aria-hidden>
        {String(marker.emoji || '').trim() || '📍'}
      </span>
      {label ? <span className="fm-pct-marker__label">{label}</span> : null}
    </button>
  );
});

/** Nom d'un repère (accessible par défaut, et visible quand le produit ne filtre pas). */
function defaultName(marker) {
  return String(marker?.label ?? marker?.name ?? '').trim();
}

/**
 * Calque des repères d'une carte « % image » (noyau carte partagé, lot 4). Neutre : le
 * produit habille `.fm-pct-marker*` et décide de l'action au clic.
 *
 * @param {object} props
 * @param {Array<object>} props.markers repères `{ id, x_pct, y_pct, label, emoji }`.
 * @param {(marker: object, event: object) => void} props.onMarkerClick handler stable.
 * @param {string|null} [props.activeMarkerId]
 * @param {(marker: object) => string} [props.labelOf] étiquette **visible** (le produit peut
 *   la masquer au dézoom sans rendre le repère anonyme : voir `nameOf`).
 * @param {(marker: object) => string} [props.nameOf] nom **accessible** du bouton.
 */
function PctMarkersLayerImpl({
  markers,
  onMarkerClick,
  activeMarkerId = null,
  labelOf = defaultName,
  nameOf = defaultName,
}) {
  return (markers || []).map((marker) => (
    <PctMarkerButton
      key={marker.id}
      marker={marker}
      isActive={activeMarkerId != null && String(activeMarkerId) === String(marker.id)}
      onMarkerClick={onMarkerClick}
      labelOf={labelOf}
      nameOf={nameOf}
    />
  ));
}

export const PctMarkersLayer = React.memo(PctMarkersLayerImpl);
PctMarkersLayer.displayName = 'PctMarkersLayer';
