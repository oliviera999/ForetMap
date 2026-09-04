import { useEffect, useMemo } from 'react';
import { useGlMapOverlaySettings } from '../context/GlMapOverlaySettingsContext.jsx';
import { resolveMapOverlayCssVariables } from '../../utils/mapOverlayTypography.js';
import { useIsCoarsePointer } from '../../hooks/useIsCoarsePointer.js';
import { useMapOverlayTextSizePreference } from '../../hooks/useMapOverlayTextSizePreference.js';

const EMPTY_FIT = { offsetX: 0, offsetY: 0, width: 0, height: 0 };

/** Boutons zoom superposés au plateau (mêmes gestes que la Visite : +, −, recentrer). */
function GLBoardZoomControls({ onZoomIn, onZoomOut, onReset }) {
  const stop = (event, fn) => {
    event.stopPropagation();
    fn?.();
  };
  return (
    <div className="gl-board-zoom-controls" data-pct-no-pan>
      <button
        type="button"
        className="gl-board-zoom-btn"
        aria-label="Zoomer le plateau"
        onClick={(e) => stop(e, onZoomIn)}
      >
        ＋
      </button>
      <button
        type="button"
        className="gl-board-zoom-btn"
        aria-label="Dézoomer le plateau"
        onClick={(e) => stop(e, onZoomOut)}
      >
        －
      </button>
      <button
        type="button"
        className="gl-board-zoom-btn"
        aria-label="Recentrer le plateau"
        onClick={(e) => stop(e, onReset)}
      >
        ⊡
      </button>
    </div>
  );
}

/**
 * Canevas « % image » des plateaux G&L, sur le moteur de carte partagé (lot 2) :
 * conteneur (cadre) → calque monde (transformé par le moteur : pan/zoom) → calque « fit »
 * aligné sur le rectangle réel de l'image en `object-fit: contain`, que les couches en %
 * (repères, zones, mascottes) épousent. Les variables CSS d'overlay (taille des libellés,
 * `--map-fit-aspect`) sont inchangées.
 *
 * `mapGestures` vient de `useGlPctMapGestures` ; un objet partiel (tests, aperçus) est toléré.
 * @param {boolean} [props.showZoomControls=false] boutons +/−/recentrer superposés.
 */
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
  showZoomControls = false,
  children,
}) {
  const containerRef = mapGestures?.containerRef;
  const imageRef = mapGestures?.imageRef;
  const worldRef = mapGestures?.worldRef;
  // Tant que l'image n'est pas décodée, le calque « fit » couvre le cadre (100 %) et la hauteur
  // de référence des libellés reste 0 — comme l'ancien `useGlBoardImageFit`.
  const imageDecoded = Number(mapGestures?.imgSize?.w) > 1 && Number(mapGestures?.imgSize?.h) > 1;
  const fit = imageDecoded && mapGestures?.fitRect ? mapGestures.fitRect : EMPTY_FIT;
  const fitHeightPx = fit.height;
  const fitLayerStyle =
    fit.width > 0 && fit.height > 0
      ? { left: fit.offsetX, top: fit.offsetY, width: fit.width, height: fit.height }
      : { left: 0, top: 0, width: '100%', height: '100%' };
  const { mapSettings } = useGlMapOverlaySettings();
  // Mêmes ajustements que ForetMap/Visite : ×1,2 tactile et préférence « taille du texte ».
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
    // `fitLayerStyle` est recalculé à chaque rendu : on dépend de ses composantes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    fit.offsetX,
    fit.offsetY,
    fit.width,
    fit.height,
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
      style={{ cursor, touchAction: mapGestures?.touchAction || 'none' }}
      onPointerDown={(event) => onMapPointerDown?.(event)}
      onClick={(event) => {
        // Le clic qui suit un glisser ou un pinch n'est pas un « tap » sur le plateau.
        if (mapGestures?.consumeSkipClick?.()) return;
        if (!onMapClick || !mapGestures?.toImagePct) return;
        const pct = mapGestures.toImagePct(event.clientX, event.clientY);
        if (!pct) return;
        onMapClick(pct, event);
      }}
    >
      <div ref={worldRef} className="gl-board-world">
        <div className="gl-board-fit-layer" style={fitLayerStyleWithScale}>
          <img
            ref={imageRef}
            src={imageUrl || '/maps/map-foret.svg'}
            alt={imageAlt || 'Carte'}
            className={imageClassName}
            style={imageStyle}
            draggable={false}
          />
          {children}
        </div>
      </div>
      {showZoomControls && mapGestures?.zoomBy ? (
        <GLBoardZoomControls
          onZoomIn={() => mapGestures.zoomBy(1.2)}
          onZoomOut={() => mapGestures.zoomBy(0.84)}
          onReset={() => mapGestures.fitMapAnimated?.()}
        />
      ) : null}
    </div>
  );
}
