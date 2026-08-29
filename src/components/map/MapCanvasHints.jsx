/**

 * Bandeaux d'état superposés au canevas de `MapView` (présentation pure) :

 * consignes du mode courant (tracé de zone / pose de repère / édition de

 * contour) en bas, et rappel des gestes tactiles en haut.

 */

export function MapCanvasHints({
  mode,

  drawPointsCount = 0,

  prefersPageScroll,

  isCoarsePointer,

  hintTexts = {},
}) {
  const {
    drawZoneMin = '🖊️ Touche la carte (min. 3 pts)',

    drawZoneReady = `✅ ${drawPointsCount} pts — Terminer`,

    addMarker = '📍 Touche la carte pour placer',

    editPoints = "✋ Glisse un sommet ou l'intérieur · glisser le fond = déplacer la vue · flèches = ajuster (ou pan) · Maj+clic = sélection · Suppr retire · Ctrl+Z annule",

    pageScroll = '📱 1 doigt: page · 2 doigts: zoom carte',

    gesturesActive = '✋ Gestes carte actifs',
  } = hintTexts;

  return (
    <>
      {mode !== 'view' && mode !== 'edit-points' && (
        <div className="map-canvas-hint map-canvas-hint--mode map-canvas-hint--bottom">
          {mode === 'draw-zone' && drawPointsCount < 3 && drawZoneMin}

          {mode === 'draw-zone' && drawPointsCount >= 3 && drawZoneReady}

          {mode === 'add-marker' && addMarker}
        </div>
      )}

      {mode === 'edit-points' && (
        <div className="map-canvas-hint map-canvas-hint--edit map-canvas-hint--bottom">
          {editPoints}
        </div>
      )}

      {prefersPageScroll && (
        <div className="map-canvas-hint map-canvas-hint--gesture map-canvas-hint--top">
          {pageScroll}
        </div>
      )}

      {isCoarsePointer && mode === 'view' && !prefersPageScroll && (
        <div className="map-canvas-hint map-canvas-hint--gesture map-canvas-hint--top">
          {gesturesActive}
        </div>
      )}
    </>
  );
}
