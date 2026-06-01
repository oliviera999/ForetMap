import React, { useEffect } from 'react';
import { useGlBoardImageFit } from '../hooks/useGlBoardImageFit.js';

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
  children,
}) {
  const containerRef = mapGestures?.containerRef;
  const imageRef = mapGestures?.imageRef;
  const { fitLayerStyle, onImageLoad, fitHeightPx } = useGlBoardImageFit(containerRef, imageRef);

  useEffect(() => {
    onMapReady?.(mapGestures);
  }, [mapGestures, onMapReady]);

  useEffect(() => {
    onFitLayout?.({ height: fitHeightPx, fit: fitLayerStyle });
  }, [fitHeightPx, fitLayerStyle, onFitLayout]);

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
      <div className="gl-board-fit-layer" style={fitLayerStyle}>
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
