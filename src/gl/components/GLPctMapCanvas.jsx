import React, { useEffect } from 'react';

export function GLPctMapCanvas({
  imageUrl,
  imageAlt,
  mapGestures,
  onMapClick,
  onMapReady,
  className = 'gl-board',
  imageClassName = 'gl-board-image',
  imageStyle = undefined,
  cursor = 'default',
  children,
}) {
  useEffect(() => {
    onMapReady?.(mapGestures);
  }, [mapGestures, onMapReady]);

  return (
    <div
      ref={mapGestures?.containerRef}
      className={className}
      style={{ cursor }}
      onClick={(event) => {
        if (!onMapClick || !mapGestures?.toImagePct) return;
        const pct = mapGestures.toImagePct(event.clientX, event.clientY);
        if (!pct) return;
        onMapClick(pct, event);
      }}
    >
      <img
        ref={mapGestures?.imageRef}
        src={imageUrl || '/maps/map-foret.svg'}
        alt={imageAlt || 'Carte'}
        className={imageClassName}
        style={imageStyle}
        draggable={false}
      />
      {children}
    </div>
  );
}
