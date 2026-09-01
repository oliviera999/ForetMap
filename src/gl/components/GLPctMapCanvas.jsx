import { useEffect, useMemo } from 'react';
import { useGlBoardImageFit } from '../hooks/useGlBoardImageFit.js';
import { useGlMapOverlaySettings } from '../context/GlMapOverlaySettingsContext.jsx';
import { resolveMapOverlayCssVariables } from '../../utils/mapOverlayTypography.js';
import { useIsCoarsePointer } from '../../hooks/useIsCoarsePointer.js';
import { useMapOverlayTextSizePreference } from '../../hooks/useMapOverlayTextSizePreference.js';

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
  // Mêmes ajustements que ForetMap/Visite : ×1,2 tactile et préférence « taille du texte »,
  // qui étaient jusqu'ici ignorés sur les plateaux GL (libellés plus petits sur tablette).
  const isCoarsePointer = useIsCoarsePointer();
  const { percent: userTextSizePercent } = useMapOverlayTextSizePreference();

  const fitLayerStyleWithScale = useMemo(() => {
    const fitW = Number(fitLayerStyle?.width) || 0;
    const settingsForOverlay =
      markerSizePercentProp != null
        ? { ...(mapSettings || {}), plateau_marker_size_percent: markerSizePercentProp }
        : mapSettings;
    const overlayCssVars = resolveMapOverlayCssVariables(settingsForOverlay, fitHeightPx, {
      fitWidthPx: fitW,
      isCoarsePointer,
      userTextSizePercent,
    });
    const fitH = Number(fitLayerStyle?.height) || 0;
    return {
      ...fitLayerStyle,
      ...overlayCssVars,
      // Ratio du plateau : sert à dé-anamorphoser textes et cercles des SVG étirés
      // (viewBox 100×100 + preserveAspectRatio="none") via transform-box: fill-box.
      ...(fitW > 0 && fitH > 0 ? { '--map-fit-aspect': String(fitW / fitH) } : {}),
    };
  }, [
    fitLayerStyle,
    fitHeightPx,
    mapSettings,
    markerSizePercentProp,
    isCoarsePointer,
    userTextSizePercent,
  ]);

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
