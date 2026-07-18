import React from 'react';
import { GLButton } from './ui/GLButton.jsx';
import { GLChapterMarkerListVisual } from './GLChapterMarkerListVisual.jsx';

// Liste des repères du chapitre (panneau périphérique, piloté par props).
// N'embarque aucune logique de gestes / coordonnées : lecture des données
// dérivées + délégation des actions au parent (GLChapterMapStudio).
export function GLChapterMarkerList({
  markersInPathOrder,
  markerPathNumbers,
  selectedMarkerId,
  zoneEditActive,
  saving,
  isEmpty,
  onSelectMarker,
  onDuplicateMarker,
}) {
  return (
    <>
      <h4 className="gl-chapter-map-studio__subtitle">Repères</h4>
      <ul className="gl-markers-list">
        {markersInPathOrder.map((marker) => {
          const pathNumber = markerPathNumbers.get(Number(marker.id));
          return (
            <li
              key={marker.id}
              data-marker-id={marker.id}
              className={Number(marker.id) === Number(selectedMarkerId) ? 'is-selected' : ''}
            >
              <button
                type="button"
                className="gl-marker-row-btn"
                disabled={zoneEditActive}
                onClick={() => onSelectMarker(marker)}
              >
                {pathNumber != null ? (
                  <span className="gl-markers-list__path-number" aria-hidden>
                    {pathNumber}
                  </span>
                ) : null}
                <GLChapterMarkerListVisual marker={marker} />
                <strong>{marker.label}</strong> — x:
                {Number(marker.x_pct).toFixed(1)}
                %, y:
                {Number(marker.y_pct).toFixed(1)}%
              </button>
              {!zoneEditActive ? (
                <GLButton
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={saving}
                  onClick={() => onDuplicateMarker(marker)}
                  title="Dupliquer ce repère"
                >
                  Dupliquer
                </GLButton>
              ) : null}
            </li>
          );
        })}
        {isEmpty ? (
          <li className="gl-empty gl-hint">
            Aucun repère. Activez « Ajouter un repère » puis cliquez sur la carte.
          </li>
        ) : null}
      </ul>
    </>
  );
}
