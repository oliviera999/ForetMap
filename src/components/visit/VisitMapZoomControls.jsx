import React from 'react';

/**
 * Boutons superposés au plan de visite : zoom avant/arrière (interpolation
 * centrée côté parent) et recentrage. Chaque clic stoppe la propagation pour
 * ne pas déclencher le clic plan (déplacement mascotte / pose de point).
 *
 * @param {Function} onZoomIn zoom avant depuis le centre du plan.
 * @param {Function} onZoomOut zoom arrière depuis le centre du plan.
 * @param {Function} onReset réinitialise pan + zoom.
 */
export function VisitMapZoomControls({ onZoomIn, onZoomOut, onReset }) {
  return (
    <div className="visit-map-controls">
      <button
        type="button"
        className="visit-map-ctrl"
        aria-label="Zoomer la carte de visite"
        onClick={(event) => {
          event.stopPropagation();
          onZoomIn();
        }}
      >
        ＋
      </button>
      <button
        type="button"
        className="visit-map-ctrl"
        aria-label="Dézoomer la carte de visite"
        onClick={(event) => {
          event.stopPropagation();
          onZoomOut();
        }}
      >
        －
      </button>
      <button
        type="button"
        className="visit-map-ctrl"
        aria-label="Recentrer la carte de visite"
        onClick={(event) => {
          event.stopPropagation();
          onReset();
        }}
      >
        ⊡
      </button>
    </div>
  );
}
