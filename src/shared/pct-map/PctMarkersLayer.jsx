import React, { useCallback } from 'react';

import { PctOverlayCaption } from './PctOverlayCaption.jsx';
import { PctStatusDots, statusDotsLabel } from './PctStatusDotsLayer.jsx';

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
  isDiscoverHalo = false,
  statusDots = null,
  onMarkerClick,
  labelOf,
  nameOf = defaultName,
  highlightBadge = '',
  highlightLabel = '',
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
  const haloClass = isDiscoverHalo ? ' is-discover-halo' : '';
  const statusSuffix = isSeen === true ? ' — Vu' : isSeen === false ? ' — À découvrir' : '';
  // Les pastilles sont décoratives : leur libellé rejoint le nom accessible du bouton.
  const dotsSuffix = statusDotsLabel(statusDots);
  // Lieu mis en avant (plan e-nov) : halo en CSS, pastille facultative, et mention au nom
  // accessible — le halo ne s'entend pas.
  const highlighted = marker.map_highlight === true;
  const highlightSuffix = highlighted && highlightLabel ? ` — ${highlightLabel}` : '';
  return (
    <button
      type="button"
      className={`fm-pct-marker${isActive ? ' is-active' : ''}${seenClass}${haloClass}${
        highlighted ? ' is-highlight' : ''
      }`}
      style={{ left: `${marker.x_pct}%`, top: `${marker.y_pct}%` }}
      aria-current={isActive ? 'true' : undefined}
      aria-label={`${accessibleName || 'Lieu'}${highlightSuffix}${statusSuffix}${dotsSuffix ? ` — ${dotsSuffix}` : ''}`}
      onClick={handleClick}
    >
      <PctOverlayCaption
        emoji={String(marker.emoji || '').trim() || '📍'}
        name={label}
        emojiClassName="fm-pct-marker__pin"
        nameClassName="fm-pct-marker__label"
      />
      {highlighted && highlightBadge ? (
        <span className="fm-pct-highlight-badge" aria-hidden>
          {highlightBadge}
        </span>
      ) : null}
      <PctStatusDots dots={statusDots} />
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
 * @param {(marker: object) => boolean} [props.getDiscoverHalo] halo bref « à découvrir ».
 * @param {(marker: object) => Array<object>|null} [props.getStatusDots] pastilles d'état
 *   (`PctStatusDotsLayer`) — ForetMap y pose l'état des tâches du lieu.
 * @param {(marker: object) => string} [props.labelOf] étiquette **visible** (le produit peut
 *   la masquer au dézoom sans rendre le repère anonyme : voir `nameOf`).
 * @param {(marker: object) => string} [props.nameOf] nom **accessible** du bouton.
 * @param {string} [props.highlightBadge] pastille des repères mis en avant (`map_highlight`).
 * @param {string} [props.highlightLabel] complément du nom accessible d'un repère mis en avant.
 */
function PctMarkersLayerImpl({
  markers,
  onMarkerClick,
  activeMarkerId = null,
  getIsSeen = null,
  getDiscoverHalo = null,
  getStatusDots = null,
  labelOf = defaultName,
  nameOf = defaultName,
  highlightBadge = '',
  highlightLabel = '',
}) {
  return (markers || []).map((marker) => (
    <PctMarkerButton
      key={marker.id}
      marker={marker}
      isActive={activeMarkerId != null && String(activeMarkerId) === String(marker.id)}
      isSeen={typeof getIsSeen === 'function' ? getIsSeen(marker) : null}
      isDiscoverHalo={typeof getDiscoverHalo === 'function' ? !!getDiscoverHalo(marker) : false}
      statusDots={typeof getStatusDots === 'function' ? getStatusDots(marker) : null}
      onMarkerClick={onMarkerClick}
      labelOf={labelOf}
      nameOf={nameOf}
      highlightBadge={highlightBadge}
      highlightLabel={highlightLabel}
    />
  ));
}

export const PctMarkersLayer = React.memo(PctMarkersLayerImpl);
PctMarkersLayer.displayName = 'PctMarkersLayer';
