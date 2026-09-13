import { useMemo } from 'react';
import { resolveScaleCompassDisplay } from './mapScaleCompass.js';

/**
 * Overlay fixe (écran) : barre d'échelle + rose des vents pour un plan calé GPS.
 * Hors du calque d'orientation : la flèche « N » compense la rotation heading-up.
 *
 * @param {object} props
 * @param {boolean} [props.visible=false]
 * @param {unknown} [props.georef]
 * @param {number} [props.contentWidthPx=0]
 * @param {number} [props.scale=1]
 * @param {number} [props.orientationDeg=0]
 * @param {string} [props.className='']
 */
export function MapScaleCompassOverlay({
  visible = false,
  georef = null,
  contentWidthPx = 0,
  scale = 1,
  orientationDeg = 0,
  className = '',
}) {
  const display = useMemo(
    () =>
      visible
        ? resolveScaleCompassDisplay({
            georef,
            contentWidthPx,
            scale,
            orientationDeg,
          })
        : null,
    [visible, georef, contentWidthPx, scale, orientationDeg],
  );

  if (!visible || !display) return null;

  const { scaleBar, needleDeg } = display;
  const barWidth = Math.max(24, Math.min(160, Math.round(scaleBar.widthPx)));

  return (
    <div
      className={`map-scale-compass ${className}`.trim()}
      aria-hidden="true"
      data-testid="map-scale-compass"
    >
      <div className="map-scale-compass__compass" title="Nord">
        <div className="map-scale-compass__needle" style={{ transform: `rotate(${needleDeg}deg)` }}>
          <span className="map-scale-compass__n">N</span>
          <span className="map-scale-compass__arrow" />
        </div>
      </div>
      <div className="map-scale-compass__scale" title={`Échelle : ${scaleBar.label}`}>
        <div className="map-scale-compass__bar" style={{ width: barWidth }} />
        <span className="map-scale-compass__label">{scaleBar.label}</span>
      </div>
    </div>
  );
}

export default MapScaleCompassOverlay;
