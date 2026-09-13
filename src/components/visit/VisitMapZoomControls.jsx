/**
 * Boutons superposés au plan de visite : zoom avant/arrière (interpolation
 * centrée côté parent) et recentrage. Chaque clic stoppe la propagation pour
 * ne pas déclencher le clic plan (déplacement mascotte / pose de point).
 *
 * @param {Function} onZoomIn zoom avant depuis le centre du plan.
 * @param {Function} onZoomOut zoom arrière depuis le centre du plan.
 * @param {Function} onReset réinitialise pan + zoom.
 * @param {object|null} [props.position] état `useMapPosition` (Me situer).
 * @param {boolean} [props.headingUpAllowed]
 * @param {boolean} [props.headingUpEffective]
 * @param {boolean} [props.headingUpUserEnabled]
 * @param {() => void} [props.onHeadingUpToggle]
 * @param {boolean} [props.scaleCompassAllowed]
 * @param {boolean} [props.scaleCompassEffective]
 * @param {() => void} [props.onScaleCompassToggle]
 */
export function VisitMapZoomControls({
  onZoomIn,
  onZoomOut,
  onReset,
  position = null,
  headingUpAllowed = false,
  headingUpEffective = false,
  headingUpUserEnabled = false,
  onHeadingUpToggle = null,
  scaleCompassAllowed = false,
  scaleCompassEffective = false,
  onScaleCompassToggle = null,
}) {
  return (
    <div className="visit-map-controls">
      {position?.available ? (
        <button
          type="button"
          className={`visit-map-ctrl${position.active ? ' is-on' : ''}`}
          aria-label={
            position.following
              ? 'Arrêter le suivi de position'
              : position.active
                ? 'Suivre ma position'
                : 'Me situer sur le plan'
          }
          aria-pressed={position.active}
          data-testid="visit-locate"
          onClick={(event) => {
            event.stopPropagation();
            position.toggle?.();
          }}
        >
          {position.following ? '⦿' : position.active ? '◉' : '◎'}
        </button>
      ) : null}
      {headingUpAllowed && position?.available && position?.active ? (
        <button
          type="button"
          className={`visit-map-ctrl${headingUpEffective ? ' is-on' : ''}`}
          aria-label={
            !position.headingAvailable
              ? 'Boussole indisponible'
              : headingUpUserEnabled
                ? 'Désorienter la carte'
                : 'Orienter la carte selon la boussole'
          }
          aria-pressed={headingUpEffective}
          disabled={!position.headingAvailable}
          data-testid="visit-heading-up"
          onClick={(event) => {
            event.stopPropagation();
            onHeadingUpToggle?.();
          }}
        >
          🧭
        </button>
      ) : null}
      {scaleCompassAllowed ? (
        <button
          type="button"
          className={`visit-map-ctrl${scaleCompassEffective ? ' is-on' : ''}`}
          aria-label={
            scaleCompassEffective
              ? 'Masquer l’échelle et la rose des vents'
              : 'Afficher l’échelle et la rose des vents'
          }
          aria-pressed={scaleCompassEffective}
          data-testid="visit-scale-compass-toggle"
          onClick={(event) => {
            event.stopPropagation();
            onScaleCompassToggle?.();
          }}
        >
          📏
        </button>
      ) : null}
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
