import React, { useCallback, useMemo } from 'react';
import { TASK_VISUAL_LABEL } from '../../utils/taskEnrollment.js';
import { MapViewMascotOverlay } from '../MapViewMascotOverlay.jsx';
import { MapViewMarkerBubble } from '../MapViewMarkerBubble.jsx';
import { MapViewBackgroundImage } from '../MapViewBackgroundImage.jsx';
import { MapViewWorldLayer } from '../MapViewWorldLayer.jsx';
import { MapScaleCompassOverlay } from '../../shared/pct-map/MapScaleCompassOverlay.jsx';
import { PctPositionLayer } from '../../shared/pct-map/PctPositionLayer.jsx';
import { accuracyHaloDiameterPx } from '../../shared/pct-map/positionGeometry.js';
import { ZonePolygonsLayer } from './ZonePolygonsLayer.jsx';
import { DrawingLayer } from './DrawingLayer.jsx';
import { EditPointsLayer } from './EditPointsLayer.jsx';
import { AlignZonesPreviewLayer } from './AlignZonesPreviewLayer.jsx';
import { MapCanvasHints } from './MapCanvasHints.jsx';

/** Carte vide stable : pastilles tutoriel désactivées sans recréer un `Map` à chaque rendu. */
const EMPTY_TUTORIAL_COUNT_BY_ID = new Map();

/**
 * Bulle repère mémoïsée : évite le re-render de chaque bulle à chaque rendu de la carte.
 * Le repère est passé par la bulle aux handlers (`onOpenMarker(marker, e)`,
 * `onBeginMarkerDrag(marker.id, …)`) pour que le parent fournisse des fonctions stables.
 */
const MapViewMarkerBubbleMemo = React.memo(function MapViewMarkerBubbleMemo({
  marker,
  draggable,
  onOpenMarker,
  onBeginMarkerDrag,
  ...bubbleProps
}) {
  const onOpen = useCallback((e) => onOpenMarker(marker, e), [marker, onOpenMarker]);
  const onPointerDown = useMemo(
    () =>
      draggable
        ? (e) => {
            e.stopPropagation();
            onBeginMarkerDrag(marker.id, e.currentTarget, e.pointerId);
          }
        : undefined,
    [draggable, marker.id, onBeginMarkerDrag],
  );
  return (
    <MapViewMarkerBubble
      marker={marker}
      draggable={draggable}
      onOpen={onOpen}
      onPointerDown={onPointerDown}
      {...bubbleProps}
    />
  );
});

/**
 * Pastille d'un **groupe** de repères sur la carte de travail (désencombrement, lot 5) :
 * compteur et emoji du repère représentatif, positionnée en % comme une bulle de repère.
 */
const MapViewMarkerClusterMemo = React.memo(function MapViewMarkerClusterMemo({
  cluster,
  emojiFontSize,
  onOpenCluster,
}) {
  const onOpen = useCallback((e) => onOpenCluster(cluster, e), [cluster, onOpenCluster]);
  const leadLabel = String(cluster.lead?.label || '').trim();
  return (
    <button
      type="button"
      className="map-marker-cluster"
      style={{ left: `${cluster.x_pct}%`, top: `${cluster.y_pct}%`, fontSize: emojiFontSize }}
      aria-label={`${cluster.count} repères regroupés${leadLabel ? `, dont ${leadLabel}` : ''}`}
      onClick={onOpen}
    >
      <span className="map-marker-cluster__emoji" aria-hidden>
        {String(cluster.lead?.emoji || '').trim() || '📍'}
      </span>
      <span className="map-marker-cluster__count">{cluster.count}</span>
    </button>
  );
});

/**
 * Canevas d'édition de la carte de travail : tracé de zone, édition des sommets, alignement
 * de zones, glisser des repères. La consultation passe par `WorkMapStage` (moteur partagé) ;
 * ce canevas n'est monté que hors consultation ou quand le déplacement des repères est
 * déverrouillé.
 *
 * Extrait de `MapViewImpl` (`src/components/map-views.jsx`, étape B4 de l'audit du
 * 25/09/2026, § 3.3 ligne 5 — patron O6), rendu inchangé : les props portent les noms des
 * variables de la carte qu'elles remplacent.
 */
export function MapViewEditCanvas({
  containerRef,
  worldRef,
  imgRef,
  cursor,
  touchAction,
  mapOverlayCssVars,
  onMapClick,
  iw,
  ih,
  inv,
  cs,
  imgSize,
  orientStyle,
  mapImageSrc,
  activeMapLabel,
  activeMapGeoref,
  onMapImageError,
  toImagePct,
  isCoarsePointer,
  prefersPageScroll,
  mode,
  showLabels,
  isTeacher,
  markerPositionUnlocked,
  embedded,
  parsedZones,
  editZone,
  selectedZone,
  alignSelectedIds,
  alignPreview,
  dimmedZoneIds,
  dimmedMarkerIds,
  zoneTaskVisualById,
  markerTaskVisualById,
  zoneTutorialCountById,
  markerTutorialCountById,
  showTutorialDots,
  mapEmojiFontPx,
  mapLabelFontPx,
  mapEmojiLabelCenterGap,
  markerLabelMarginTop,
  mapOverlayLabelLayout,
  openZoneFromMap,
  openMarkerFromMap,
  openClusterFromMap,
  beginMarkerDrag,
  markerClusters,
  drawPoints,
  editPoints,
  draggingPtIdx,
  selectedPtIdxs,
  insertVertexMode,
  insertPointFromPct,
  insertPointAtMidpoint,
  onBackgroundPointerDown,
  onBackgroundPointerMove,
  onBackgroundPointerUp,
  onBackgroundLostPointerCapture,
  onTranslatePointerDown,
  onTranslatePointerMove,
  endEditZoneTranslate,
  onTranslateLostPointerCapture,
  onEditPointPointerDown,
  onEditPointPointerMove,
  onEditPointPointerUp,
  showMapMascot,
  mapMascotClassName,
  mapMascotRenderPct,
  mapMascotFitScale,
  mapMascotFaceRight,
  mapMascotAnimationState,
  mapMascotId,
  visitMascotCatalogExtras,
  mapMascotDialogVisible,
  mapMascotDialog,
  mapPosition,
  scaleCompassPref,
  mapOrientationDeg,
  mapCanvasHintTexts,
  liveSurfaceLabel = null,
}) {
  return (
    <div
      ref={containerRef}
      className="map-view-canvas map-viewport"
      style={{
        cursor,
        touchAction,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        ...mapOverlayCssVars,
      }}
      onClick={onMapClick}
    >
      <MapViewWorldLayer worldRef={worldRef} width={iw} height={ih}>
        <div
          className="map-view-orient"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            ...(orientStyle || {}),
          }}
        >
          <MapViewBackgroundImage
            imgRef={imgRef}
            src={mapImageSrc}
            alt={`Plan ${activeMapLabel || 'du jardin'}`}
            width={iw}
            height={ih}
            onError={onMapImageError}
          />

          <svg
            className="map-zone-svg-layer"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: iw,
              height: ih,
              overflow: 'visible',
              pointerEvents: 'none',
              textRendering: 'optimizeLegibility',
            }}
          >
            <g style={{ pointerEvents: 'all' }}>
              {/* Édition (tracé / sommets / alignement / glisser repères) :
                      ZonePolygonsLayer + calques d'édition. La consultation utilise
                      WorkMapStage (SharedMapStage). */}
              <ZonePolygonsLayer
                parsedZones={parsedZones}
                iw={iw}
                ih={ih}
                inv={inv}
                mode={mode}
                showLabels={showLabels}
                editZoneId={editZone?.id ?? null}
                selectedZoneId={selectedZone?.id ?? null}
                alignSelectedIds={mode === 'align-zones' ? alignSelectedIds : null}
                dimmedZoneIds={dimmedZoneIds}
                zoneTaskVisualById={zoneTaskVisualById}
                zoneTutorialCountById={
                  showTutorialDots ? zoneTutorialCountById : EMPTY_TUTORIAL_COUNT_BY_ID
                }
                emojiFontPx={mapEmojiFontPx}
                labelFontPx={mapLabelFontPx}
                emojiLabelCenterGap={mapEmojiLabelCenterGap}
                onZoneOpen={openZoneFromMap}
              />
              <AlignZonesPreviewLayer aligned={alignPreview?.aligned} iw={iw} ih={ih} inv={inv} />
              <DrawingLayer drawPoints={drawPoints} iw={iw} ih={ih} inv={inv} />
              <EditPointsLayer
                mode={mode}
                editPoints={editPoints}
                draggingPtIdx={draggingPtIdx}
                selectedPtIdxs={selectedPtIdxs}
                insertVertexMode={insertVertexMode}
                iw={iw}
                ih={ih}
                inv={inv}
                toImagePct={toImagePct}
                onInsertPointFromPct={insertPointFromPct}
                onInsertPointAtMidpoint={insertPointAtMidpoint}
                onBackgroundPointerDown={onBackgroundPointerDown}
                onBackgroundPointerMove={onBackgroundPointerMove}
                onBackgroundPointerUp={onBackgroundPointerUp}
                onBackgroundLostPointerCapture={onBackgroundLostPointerCapture}
                onTranslatePointerDown={onTranslatePointerDown}
                onTranslatePointerMove={onTranslatePointerMove}
                endEditZoneTranslate={endEditZoneTranslate}
                onTranslateLostPointerCapture={onTranslateLostPointerCapture}
                onEditPointPointerDown={onEditPointPointerDown}
                onEditPointPointerMove={onEditPointPointerMove}
                onEditPointPointerUp={onEditPointPointerUp}
              />
            </g>
          </svg>

          <MapViewMascotOverlay
            show={showMapMascot}
            mascotClassName={mapMascotClassName}
            embedded={embedded}
            renderPct={mapMascotRenderPct}
            fitScale={mapMascotFitScale}
            faceRight={mapMascotFaceRight}
            animationState={mapMascotAnimationState}
            mascotId={mapMascotId}
            extraCatalogEntries={visitMascotCatalogExtras}
            dialogVisible={mapMascotDialogVisible}
            dialog={mapMascotDialog}
          />

          {mapPosition.displayPct ? (
            <PctPositionLayer
              position={mapPosition.displayPct}
              haloPx={accuracyHaloDiameterPx(mapPosition.haloPct, imgSize.w)}
              headingDeg={mapPosition.screenHeadingUnwrappedDeg ?? mapPosition.screenHeadingDeg}
              headingSource={mapPosition.headingSource}
              accuracyM={mapPosition.accuracyM}
            />
          ) : null}

          {markerClusters.map((cluster) => {
            if (cluster.count > 1) {
              return (
                <MapViewMarkerClusterMemo
                  key={cluster.id}
                  cluster={cluster}
                  emojiFontSize={`${mapEmojiFontPx}px`}
                  onOpenCluster={openClusterFromMap}
                />
              );
            }
            const m = cluster.lead;
            const markerTaskVisual = markerTaskVisualById.get(m.id);
            const markerTaskLabel = markerTaskVisual ? TASK_VISUAL_LABEL[markerTaskVisual] : '';
            const markerTutorialCount = markerTutorialCountById.get(m.id) || 0;
            const markerTutorialLabel =
              markerTutorialCount === 0
                ? ''
                : markerTutorialCount === 1
                  ? '1 tutoriel lié'
                  : `${markerTutorialCount} tutoriels liés`;
            const markerAriaLabel = [m.label || 'Repère', markerTaskLabel, markerTutorialLabel]
              .filter(Boolean)
              .join(' — ');
            const markerDraggable = isTeacher && markerPositionUnlocked;
            return (
              <MapViewMarkerBubbleMemo
                key={m.id}
                marker={m}
                dimmed={dimmedMarkerIds?.has(String(m.id))}
                ariaLabel={markerAriaLabel}
                showLabels={showLabels}
                isCoarsePointer={isCoarsePointer}
                draggable={markerDraggable}
                emojiFontSize={`${mapEmojiFontPx}px`}
                labelFontSize={`${mapLabelFontPx}px`}
                labelMarginTop={markerLabelMarginTop}
                labelMaxWidthPx={mapOverlayLabelLayout.maxScreenPx}
                taskVisual={markerTaskVisual}
                taskLabel={markerTaskLabel}
                tutorialCount={showTutorialDots ? markerTutorialCount : 0}
                tutorialLabel={markerTutorialLabel}
                onOpenMarker={openMarkerFromMap}
                onBeginMarkerDrag={beginMarkerDrag}
              />
            );
          })}
        </div>
      </MapViewWorldLayer>

      <MapScaleCompassOverlay
        visible={scaleCompassPref.effective}
        georef={activeMapGeoref}
        contentWidthPx={iw}
        scale={cs}
        orientationDeg={mapOrientationDeg}
      />

      <MapCanvasHints
        mode={mode}
        drawPointsCount={drawPoints.length}
        prefersPageScroll={prefersPageScroll}
        isCoarsePointer={isCoarsePointer}
        hintTexts={mapCanvasHintTexts}
        surfaceLabel={liveSurfaceLabel}
      />
    </div>
  );
}
