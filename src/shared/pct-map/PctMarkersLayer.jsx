import React, { useCallback } from 'react';

import { PctOverlayCaption } from './PctOverlayCaption.jsx';

/**
 * Repère ponctuel d'une carte « % image » : bouton positionné en pourcentage, mémoïsé avec
 * un handler stable par repère (un repère ne se re-rend que si son objet change). Exporté
 * pour les produits qui composent eux-mêmes leur calque — le rendu d'un repère seul au sein
 * d'un calque de groupes, par exemple (lot 5).
 */
export const PctMarkerButton = React.memo(function PctMarkerButton({
  marker,
  isActive,
  isSeen = null,
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
  const seenClass = isSeen === true ? ' is-seen' : isSeen === false ? ' is-unseen' : '';
  const statusSuffix = isSeen === true ? ' — Vu' : isSeen === false ? ' — À découvrir' : '';
  return (
    <button
      type="button"
      className={`fm-pct-marker${isActive ? ' is-active' : ''}${seenClass}`}
      style={{ left: `${marker.x_pct}%`, top: `${marker.y_pct}%` }}
      aria-label={`${accessibleName || 'Lieu'}${statusSuffix}`}
      onClick={handleClick}
    >
      <PctOverlayCaption
        emoji={String(marker.emoji || '').trim() || '📍'}
        name={label}
        emojiClassName="fm-pct-marker__pin"
        nameClassName="fm-pct-marker__label"
      />
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
 * @param {(marker: object) => boolean|null} [props.getIsSeen] progression Visite.
 * @param {(marker: object) => string} [props.labelOf] étiquette **visible** (le produit peut
 *   la masquer au dézoom sans rendre le repère anonyme : voir `nameOf`).
 * @param {(marker: object) => string} [props.nameOf] nom **accessible** du bouton.
 */
function PctMarkersLayerImpl({
  markers,
  onMarkerClick,
  activeMarkerId = null,
  getIsSeen = null,
  labelOf = defaultName,
  nameOf = defaultName,
}) {
  return (markers || []).map((marker) => (
    <PctMarkerButton
      key={marker.id}
      marker={marker}
      isActive={activeMarkerId != null && String(activeMarkerId) === String(marker.id)}
      isSeen={typeof getIsSeen === 'function' ? getIsSeen(marker) : null}
      onMarkerClick={onMarkerClick}
      labelOf={labelOf}
      nameOf={nameOf}
    />
  ));
}

export const PctMarkersLayer = React.memo(PctMarkersLayerImpl);
PctMarkersLayer.displayName = 'PctMarkersLayer';
