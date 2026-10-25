import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * La main : cartes du lot ouvert pas encore posées (vignettes). On glisse une carte vers la
 * table (fantôme qui suit le pointeur) ou on la touche puis on touche la table. « Tout poser »
 * place les cartes restantes (dans leur bande au niveau Éclaireur).
 */
export function FresqueHand({
  model,
  publicBase,
  cardIds,
  armedCardId = null,
  intro = '',
  readOnly = false,
  onArm,
  onDrop,
  onPlaceAll,
  actions = null,
}) {
  const [ghost, setGhost] = useState(null);
  const dragRef = useRef(null);

  useEffect(() => {
    if (!dragRef.current) return undefined;
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      d.moved = d.moved || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 6;
      if (d.moved) setGhost({ cardId: d.cardId, x: e.clientX, y: e.clientY });
    };
    const onUp = (e) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      dragRef.current = null;
      setGhost(null);
      if (d.moved) onDrop?.(d.cardId, e.clientX, e.clientY);
      else onArm?.(d.cardId);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [ghost, onArm, onDrop]);

  const onPointerDown = useCallback(
    (cardId) => (e) => {
      if (readOnly) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      dragRef.current = {
        cardId,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };
      // Déclenche l'effet d'écoute (état factice sans fantôme visible tant qu'on ne bouge pas).
      setGhost({ cardId, x: null, y: null });
    },
    [readOnly],
  );

  const ghostCard = ghost?.cardId ? model.cardsById[ghost.cardId] : null;

  return (
    <div className="fm-fresque-hand" data-testid="fm-fresque-hand">
      {intro ? <p className="fm-fresque-hand__intro">{intro}</p> : null}
      {cardIds.length ? (
        <ul className="fm-fresque-hand__cards" aria-label="Cartes à poser">
          {cardIds.map((id) => {
            const card = model.cardsById[id];
            return (
              <li key={id}>
                <button
                  type="button"
                  className="fm-fresque-hand__card"
                  aria-pressed={armedCardId === id ? 'true' : 'false'}
                  aria-label={`${card.alt?.recto || card.title} — ${
                    armedCardId === id
                      ? 'touche la table pour la poser'
                      : 'glisser vers la table ou toucher puis toucher la table'
                  }`}
                  disabled={readOnly}
                  onPointerDown={onPointerDown(id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onArm?.(id, { keyboard: true });
                    }
                  }}
                  data-testid={`fm-fresque-hand-${id}`}
                >
                  <img src={`${publicBase}${card.rectoSmall}`} alt="" draggable="false" />
                  <span>{card.title}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="fm-fresque-hand__intro" data-testid="fm-fresque-hand-empty">
          Toutes les cartes de ce lot sont sur la table.
        </p>
      )}
      <div className="fm-fresque-hand__actions">
        {cardIds.length && !readOnly ? (
          <button
            type="button"
            className="fm-fresque-btn"
            onClick={onPlaceAll}
            data-testid="fm-fresque-place-all"
          >
            Tout poser
          </button>
        ) : null}
        {actions}
      </div>
      {/* Le fantôme part dans <body> : un ancêtre transformé (coque de l'application, défilement)
          ferait de `position: fixed` un repère local et le décalerait du doigt. */}
      {ghostCard && ghost.x != null && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fm-fresque-hand__ghost"
              style={{ left: ghost.x, top: ghost.y }}
              aria-hidden="true"
            >
              <img src={`${publicBase}${ghostCard.rectoSmall}`} alt="" />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
