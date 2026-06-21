import React, { useEffect, useMemo } from 'react';
import { useGlBoardImageFit } from '../hooks/useGlBoardImageFit.js';
import { useGlMapOverlaySettings } from '../context/GlMapOverlaySettingsContext.jsx';
import {
  readPlateauMarkerSizePercent,
  resolveMapOverlayScaleCssValue,
} from '../../shared/mapOverlayScale.js';

export function GLPctMapCanvas({
  imageUrl,
  imageAlt,
  mapGestures,
  onMapClick,
  onMapPointerDown,
  onMapReady,
  onFitLayout,
  className = 'gl-board',
  imageClassName = 'gl-board-image',
  imageStyle = undefined,
  cursor = 'default',
  markerSizePercent: markerSizePercentProp,
  children,
}) {
  const containerRef = mapGestures?.containerRef;
  const imageRef = mapGestures?.imageRef;
  const { fitLayerStyle, onImageLoad, fitHeightPx } = useGlBoardImageFit(containerRef, imageRef);
  const { mapSettings } = useGlMapOverlaySettings();
  const markerSizePercent = markerSizePercentProp ?? readPlateauMarkerSizePercent(mapSettings);

  const fitLayerStyleWithScale = useMemo(() => {
    const overlayScale = resolveMapOverlayScaleCssValue({
      fitHeightPx,
      sizePercent: markerSizePercent,
    });
    return {
      ...fitLayerStyle,
      '--map-overlay-scale': overlayScale,
    };
  }, [fitLayerStyle, fitHeightPx, markerSizePercent]);

  useEffect(() => {
    onMapReady?.(mapGestures);
  }, [mapGestures, onMapReady]);

  useEffect(() => {
    onFitLayout?.({ height: fitHeightPx, fit: fitLayerStyleWithScale });
  }, [fitHeightPx, fitLayerStyleWithScale, onFitLayout]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ cursor }}
      onPointerDown={(event) => onMapPointerDown?.(event)}
      onClick={(event) => {
        if (!onMapClick || !mapGestures?.toImagePct) return;
        const pct = mapGestures.toImagePct(event.clientX, event.clientY);
        if (!pct) return;
        onMapClick(pct, event);
      }}
    >
      <div className="gl-board-fit-layer" style={fitLayerStyleWithScale}>
        <img
          ref={imageRef}
          src={imageUrl || '/maps/map-foret.svg'}
          alt={imageAlt || 'Carte'}
          className={imageClassName}
          style={imageStyle}
          draggable={false}
          onLoad={onImageLoad}
        />
        {children}
      </div>
    </div>
  );
}
