import { useCallback, useEffect, useMemo, useRef } from 'react';

import { usePctMapViewport } from '../pct-map/usePctMapViewport.js';
import { MapActionButton } from '../ui/MapActionButton.jsx';
import { CARD_W_PCT, CARD_H_PCT } from './fresqueCore.js';
import { FresqueArrowLayer } from './FresqueArrowLayer.jsx';
import { FresqueCard } from './FresqueCard.jsx';
import { FresqueNotes } from './FresqueNotes.jsx';

/**
 * Image transparente 16:10 : en mode « scène », le moteur de vue partagé mesure l'image en
 * `object-fit: contain` pour poser le calque « fit » que les cartes (en %) épousent. La table
 * n'a pas de fond image ; ce gabarit ne sert qu'à fixer ses proportions.
 */
export const TABLE_PLACEHOLDER_SRC = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000"></svg>',
)}`;

const GESTURE_IGNORE =
  '.fm-fresque-card, .fm-fresque-note, .fm-fresque-arrow, .fm-fresque-table__ctl';

/**
 * La table : scène zoomable et déplaçable (`usePctMapViewport`, mode `stage`, zoom, pincement,
 * inertie), bandes guidées, flèches, cartes et post-it en coordonnées %. Expose à ses parents,
 * via `tableApiRef`, la conversion écran → % et le glisser externe.
 */
export function FresqueTable({
  model,
  publicBase,
  state,
  readOnly = false,
  showBands = false,
  selectedCardId = null,
  linkSourceId = null,
  armedHandCardId = null,
  chips = null,
  linkCategories = null,
  showMarks = false,
  missingPreview = [],
  previewLine = null,
  selectedLinkId = null,
  arrowColorHex = null,
  tableApiRef,
  initialView = null,
  onViewportCommit = null,
  onTapBackground,
  onCardTap,
  onCardFlip,
  onCardMove,
  onCardOpen,
  onCardFocus,
  onLinkButton,
  onLinkDragEnd,
  onLinkTap,
  onLinkDelete,
  onNoteMove,
  onNoteTap,
  emptyMessage = null,
}) {
  const commitRef = useRef(onViewportCommit);
  commitRef.current = onViewportCommit;
  const viewportRef = useRef(null);

  const viewport = usePctMapViewport({
    imageSrc: TABLE_PLACEHOLDER_SRC,
    contentMode: 'stage',
    enabled: true,
    onResize: 'clamp',
    bounds: true,
    maxScale: 4,
    doubleTapZoom: false,
    keyboardPan: false,
    inertia: true,
    initialView,
    isGestureTarget: (target) => Boolean(target?.closest?.(GESTURE_IGNORE)),
    onGestureEnd: () => {
      const snap = viewportRef.current?.getViewSnapshot?.();
      if (snap) commitRef.current?.(snap);
    },
  });
  viewportRef.current = viewport;
  const {
    containerRef,
    worldRef,
    imgRef,
    committed,
    fitRect,
    fitMap,
    zoomBy,
    toImagePct,
    beginExternalDrag,
    consumeSkipClick,
    getViewSnapshot,
    touchAction,
  } = viewport;

  useEffect(() => {
    if (!tableApiRef) return undefined;
    tableApiRef.current = {
      toImagePct,
      beginExternalDrag,
      getContainer: () => containerRef.current,
      fitMap,
      getViewSnapshot,
    };
    return () => {
      if (tableApiRef.current?.toImagePct === toImagePct) tableApiRef.current = null;
    };
  }, [tableApiRef, toImagePct, beginExternalDrag, containerRef, fitMap, getViewSnapshot]);

  const fitStyle = useMemo(() => {
    const inv = committed.s > 0 ? 1 / committed.s : 1;
    const box =
      fitRect.width > 0 && fitRect.height > 0
        ? {
            left: fitRect.offsetX,
            top: fitRect.offsetY,
            width: fitRect.width,
            height: fitRect.height,
          }
        : { left: 0, top: 0, width: '100%', height: '100%' };
    return { ...box, '--fm-fresque-inv': inv };
  }, [fitRect, committed.s]);

  const zoomThenCommit = useCallback(
    (factor) => {
      zoomBy(factor);
      setTimeout(() => {
        const snap = getViewSnapshot();
        if (snap) commitRef.current?.(snap);
      }, 420);
    },
    [zoomBy, getViewSnapshot],
  );

  const onBackgroundClick = useCallback(
    (e) => {
      if (consumeSkipClick()) return;
      if (e.target?.closest?.(GESTURE_IGNORE)) return;
      const p = toImagePct(e.clientX, e.clientY);
      onTapBackground?.(p, armedHandCardId);
    },
    [armedHandCardId, consumeSkipClick, onTapBackground, toImagePct],
  );

  const placed = Object.keys(state.cards || {});
  const bands = showBands && model.guideBands.length ? model.guideBands : null;

  return (
    // Le fond de la table n'est pas une commande principale : les cartes, flèches et post-it
    // restent des boutons ; le fond sert à poser une carte armée ou à annuler une sélection.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- scène
    <div
      ref={containerRef}
      className="fm-fresque-table"
      style={{ touchAction }}
      onClick={onBackgroundClick}
      data-testid="fm-fresque-table"
      data-armed={armedHandCardId || undefined}
    >
      <div className="fm-fresque-table__ctl">
        <MapActionButton
          tone="display"
          icon="＋"
          label="Zoomer"
          testId="fm-fresque-zoom-in"
          onClick={() => zoomThenCommit(1.25)}
        />
        <MapActionButton
          tone="display"
          icon="－"
          label="Dézoomer"
          testId="fm-fresque-zoom-out"
          onClick={() => zoomThenCommit(1 / 1.25)}
        />
        <MapActionButton
          tone="display"
          icon="⊡"
          label="Voir toute la table"
          testId="fm-fresque-zoom-fit"
          onClick={() => {
            fitMap();
            setTimeout(() => {
              const snap = getViewSnapshot();
              if (snap) commitRef.current?.(snap);
            }, 50);
          }}
        />
      </div>
      {placed.length === 0 && emptyMessage ? (
        <div className="fm-fresque-table__empty">{emptyMessage}</div>
      ) : null}
      <div ref={worldRef} className="fm-fresque-table__world" style={{ transformOrigin: '0 0' }}>
        <div className="fm-fresque-table__fit" style={fitStyle} data-testid="fm-fresque-fit">
          <img
            ref={imgRef}
            className="fm-fresque-table__img"
            src={TABLE_PLACEHOLDER_SRC}
            alt=""
            onLoad={fitMap}
          />
          {bands ? (
            <div className="fm-fresque-bands" data-testid="fm-fresque-bands" aria-hidden="true">
              {bands.map((band) => (
                <div key={band.id} className="fm-fresque-band">
                  <span className="fm-fresque-band__label">{band.label}</span>
                </div>
              ))}
            </div>
          ) : null}
          <FresqueArrowLayer
            links={state.links || []}
            positions={state.cards || {}}
            categories={linkCategories}
            showMarks={showMarks}
            missing={missingPreview}
            preview={previewLine}
            selectedLinkId={selectedLinkId}
            arrowColorHex={arrowColorHex}
            readOnly={readOnly}
            onLinkTap={onLinkTap}
            onLinkDelete={onLinkDelete}
          />
          {placed.map((id) => {
            const card = model.cardsById[id];
            if (!card) return null;
            return (
              <FresqueCard
                key={id}
                card={card}
                pos={state.cards[id]}
                publicBase={publicBase}
                readOnly={readOnly}
                selected={selectedCardId === id}
                isLinkSource={linkSourceId === id}
                linkArmed={Boolean(linkSourceId) && linkSourceId !== id}
                chip={chips?.[id] || null}
                tableApi={tableApiRef}
                onFlip={onCardFlip}
                onMove={onCardMove}
                onOpen={onCardOpen}
                onTap={onCardTap}
                onLinkButton={onLinkButton}
                onLinkDragEnd={onLinkDragEnd}
                onFocus={onCardFocus}
              />
            );
          })}
          <FresqueNotes
            notes={state.notes || []}
            tableApi={tableApiRef}
            readOnly={readOnly}
            onMove={onNoteMove}
            onTap={onNoteTap}
          />
        </div>
      </div>
    </div>
  );
}

/** Position de pose : centrée sous le doigt, bornée à la table. */
export function dropPosition(p) {
  return {
    x: Math.min(100 - CARD_W_PCT, Math.max(0, p.xp - CARD_W_PCT / 2)),
    y: Math.min(100 - CARD_H_PCT, Math.max(0, p.yp - CARD_H_PCT / 2)),
  };
}
