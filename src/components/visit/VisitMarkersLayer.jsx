import React, { useCallback } from 'react';
import { VisitMapMarkerButton } from '../VisitMapMarkerButton.jsx';
import { itemSeenKey } from '../../utils/visitMediaGallery.js';

/**
 * Repère individuel : mémoïsé avec un handler `onClick` stable par id — un repère
 * ne re-rend que si son objet `marker`, son statut « vu » ou le handler parent changent.
 */
const VisitMarkersLayerItem = React.memo(function VisitMarkersLayerItem({
  marker,
  isSeen,
  onMarkerClick,
}) {
  const handleClick = useCallback((event) => onMarkerClick(marker, event), [marker, onMarkerClick]);
  return <VisitMapMarkerButton marker={marker} isSeen={isSeen} onClick={handleClick} />;
});

/**
 * Calque des repères de la visite — extraction iso-comportement du rendu inline de
 * VisitViewImpl (visit-views.jsx). Mémoïsé (React.memo) : ne re-rend que si
 * `markers`, `seen` ou `onMarkerClick` changent d'identité.
 *
 * @param {object} props
 * @param {Array<object>} props.markers repères de la visite (`content.markers`).
 * @param {Set<string>} props.seen clés `itemSeenKey` des éléments vus.
 * @param {(marker: object, event: object) => void} props.onMarkerClick clic sur un repère (handler stable).
 */
function VisitMarkersLayerImpl({ markers, seen, onMarkerClick }) {
  return (markers || []).map((m) => (
    <VisitMarkersLayerItem
      key={m.id}
      marker={m}
      isSeen={seen.has(itemSeenKey('marker', m.id))}
      onMarkerClick={onMarkerClick}
    />
  ));
}

export const VisitMarkersLayer = React.memo(VisitMarkersLayerImpl);
VisitMarkersLayer.displayName = 'VisitMarkersLayer';
