import React from 'react';

/**
 * Bulle d'un repère sur la carte (présentation) — extrait de `MapView` (O6).
 *
 * Rend le bouton positionné (`left`/`top` en %), l'épingle emoji (ou le point
 * par défaut), les pastilles d'état de tâche / de tutoriel et l'étiquette
 * optionnelle. La logique métier (calcul des visuels, ouverture, drag) reste
 * dans `MapView` et est transmise via les props/handlers.
 * DOM/classes/styles/textes strictement inchangés.
 *
 * @param {object} props
 * @param {object} props.marker repère à rendre (utilise `x_pct`, `y_pct`, `emoji`, `label`)
 * @param {string} props.ariaLabel libellé accessible du bouton (aria-label + title)
 * @param {boolean} props.showLabels affiche l'étiquette texte du repère quand vrai
 * @param {boolean} props.isCoarsePointer adapte la taille tactile et les pastilles
 * @param {boolean} props.draggable autorise le glissement du repère (curseur + pointerdown)
 * @param {string} props.emojiFontSize taille de police de l'épingle emoji (ex. « 16px »)
 * @param {string} props.labelFontSize taille de police de l'étiquette (ex. « 14px »)
 * @param {number} props.labelMarginTop marge supérieure de l'étiquette
 * @param {string} [props.taskVisual] identifiant du visuel de tâche (ajoute la pastille de tâche)
 * @param {string} props.taskLabel libellé accessible de la pastille de tâche
 * @param {number} props.tutorialCount nombre de tutoriels liés (pastille si > 0)
 * @param {string} props.tutorialLabel libellé accessible de la pastille de tutoriel
 * @param {(e: React.MouseEvent|React.KeyboardEvent) => void} props.onOpen ouvre le repère
 * @param {(e: React.PointerEvent) => void} [props.onPointerDown] démarre le glissement du repère
 */
export function MapViewMarkerBubble({
  marker: m,
  ariaLabel,
  showLabels,
  isCoarsePointer,
  draggable,
  emojiFontSize,
  labelFontSize,
  labelMarginTop,
  taskVisual,
  taskLabel,
  tutorialCount,
  tutorialLabel,
  onOpen,
  onPointerDown,
}) {
  const markerStatusDotSize = isCoarsePointer ? 17 : 12;
  const markerStatusDotBorder = isCoarsePointer ? 2 : 1.5;
  const markerStatusDotOffset = isCoarsePointer ? -2 : -1;
  return (
    <button
      className="map-bubble"
      type="button"
      style={{
        position: 'absolute',
        left: m.x_pct + '%',
        top: m.y_pct + '%',
        transform: 'translate(-50%,-50%)',
        zIndex: 10,
        cursor: draggable ? 'grab' : 'pointer',
        border: 'none',
        background: 'transparent',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: isCoarsePointer ? 'center' : 'flex-start',
        minWidth: isCoarsePointer ? 48 : undefined,
        minHeight: isCoarsePointer ? 48 : undefined,
        padding: isCoarsePointer ? 6 : 0,
        boxSizing: 'border-box',
      }}
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(e);
        }
      }}
      onPointerDown={onPointerDown}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <div
        className="map-bubble-pin"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          background: 'transparent',
          border: 'none',
          borderRadius: 0,
          fontSize: emojiFontSize,
          lineHeight: 1,
          minWidth: m.emoji ? undefined : 10,
          minHeight: m.emoji ? undefined : 10,
        }}
      >
        {m.emoji ? (
          m.emoji
        ) : (
          <span
            className="map-marker-no-emoji"
            aria-hidden
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#1a4731',
              opacity: 0.55,
            }}
          />
        )}
        {taskVisual && (
          <span
            className={`map-task-status-dot map-task-status-dot--${taskVisual}`}
            role="img"
            aria-label={taskLabel}
            title={taskLabel}
            style={{
              width: markerStatusDotSize,
              height: markerStatusDotSize,
              borderWidth: markerStatusDotBorder,
              top: markerStatusDotOffset,
              right: markerStatusDotOffset,
            }}
          />
        )}
        {tutorialCount > 0 && (
          <span
            className="map-tutorial-marker-dot"
            role="img"
            aria-label={tutorialLabel}
            title={tutorialLabel}
            style={{
              width: Math.max(8, markerStatusDotSize - 3),
              height: Math.max(8, markerStatusDotSize - 3),
              borderWidth: markerStatusDotBorder,
              bottom: markerStatusDotOffset,
              left: markerStatusDotOffset,
              right: 'auto',
              top: 'auto',
            }}
          />
        )}
      </div>
      {showLabels && (
        <div
          style={{
            flexShrink: 0,
            marginTop: labelMarginTop,
            background: 'transparent',
            color: '#1a4731',
            borderRadius: 0,
            padding: 0,
            fontSize: labelFontSize,
            fontWeight: 700,
            fontFamily: 'DM Sans,sans-serif',
            lineHeight: 1,
            whiteSpace: 'nowrap',
            maxWidth: isCoarsePointer ? 128 : 96,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            pointerEvents: 'none',
            textAlign: 'center',
            textShadow:
              '0 0 2px rgba(255,255,255,.95), 0 0 6px rgba(255,255,255,.85), 0 1px 0 rgba(255,255,255,.92)',
          }}
        >
          {m.label}
        </div>
      )}
    </button>
  );
}
