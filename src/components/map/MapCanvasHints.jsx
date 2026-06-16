import React from 'react';

/**
 * Bandeaux d'état superposés au canevas de `MapView` (présentation pure) :
 * consignes du mode courant (tracé de zone / pose de repère / édition de
 * contour) en bas, et rappel des gestes tactiles en haut.
 */
export function MapCanvasHints({ mode, drawPointsCount = 0, prefersPageScroll, isCoarsePointer }) {
  return (
    <>
      {mode !== 'view' && mode !== 'edit-points' && (
        <div
          style={{
            position: 'absolute',
            bottom: 14,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(26,71,49,.9)',
            color: 'white',
            borderRadius: 22,
            padding: '9px 20px',
            fontSize: '.82rem',
            fontWeight: 600,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 20,
          }}
        >
          {mode === 'draw-zone' && drawPointsCount < 3 && '🖊️ Touche la carte (min. 3 pts)'}
          {mode === 'draw-zone' && drawPointsCount >= 3 && `✅ ${drawPointsCount} pts — Terminer`}
          {mode === 'add-marker' && '📍 Touche la carte pour placer'}
        </div>
      )}
      {mode === 'edit-points' && (
        <div
          style={{
            position: 'absolute',
            bottom: 14,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(82,183,136,.92)',
            color: 'white',
            borderRadius: 22,
            padding: '9px 20px',
            fontSize: '.82rem',
            fontWeight: 600,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 20,
          }}
        >
          ✋ Glisse un point ou l&apos;intérieur · limites carte · Ctrl+Z annule
        </div>
      )}
      {prefersPageScroll && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(26,71,49,.9)',
            color: 'white',
            borderRadius: 18,
            padding: '6px 12px',
            fontSize: '.72rem',
            fontWeight: 600,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 20,
          }}
        >
          📱 1 doigt: page · 2 doigts: zoom carte
        </div>
      )}
      {isCoarsePointer && mode === 'view' && !prefersPageScroll && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(26,71,49,.82)',
            color: 'white',
            borderRadius: 18,
            padding: '6px 12px',
            fontSize: '.72rem',
            fontWeight: 600,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 20,
          }}
        >
          ✋ Gestes carte actifs
        </div>
      )}
    </>
  );
}
