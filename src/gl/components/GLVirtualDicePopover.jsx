import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useDialogA11y } from '../../shared/platform/useDialogA11y.js';
import { useExitAnimation } from '../../shared/hooks/useExitAnimation.js';
import { GLButton } from './ui/GLButton.jsx';
import { GLDiceCube } from './GLDiceCube.jsx';
import { computeGlDicePopoverPosition } from '../utils/glDicePopoverPosition.js';
import { formatDiceBreakdown, MAX_DICE_COUNT } from '../utils/glVirtualDice.js';

export function GLVirtualDicePopover({
  open,
  anchorRef,
  avoidRectRef = null,
  phase,
  diceCount,
  lastRoll,
  onClose,
  onAddDie,
  onRemoveDie,
  onStartRoll,
  onReset,
  canAddDie,
  canRemoveDie,
  isRolling,
  disableReroll = false,
  canRoll = true,
  themeStyle = null,
}) {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const { closing, runExit, onAnimationEnd } = useExitAnimation({
    animationName: 'fmExitFadeShrink',
  });
  const closeAnimated = useCallback(() => runExit(onClose), [runExit, onClose]);
  // Popover non bloquant : Échap par la pile des surcouches et retour navigateur, sans prendre
  // le focus (le plateau reste utilisable derrière).
  const panelRef = useDialogA11y(closeAnimated, { active: !!open, manageFocus: false });

  const updatePosition = useCallback(() => {
    if (!open || !anchorRef?.current) return;
    const anchor = anchorRef.current.getBoundingClientRect();
    const panel = panelRef.current;
    const panelWidth = panel?.offsetWidth || 300;
    const panelHeight = panel?.offsetHeight || 280;
    const avoidRect = avoidRectRef?.current?.getBoundingClientRect?.() || null;
    const next = computeGlDicePopoverPosition({
      anchorRect: anchor,
      panelWidth,
      panelHeight,
      avoidRect,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    setPosition(next);
  }, [open, anchorRef, avoidRectRef, panelRef]);

  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition, phase, diceCount, lastRoll]);

  useEffect(() => {
    if (!open) return undefined;
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      const target = event.target;
      if (anchorRef?.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      closeAnimated();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, closeAnimated, anchorRef, panelRef]);

  if (!open) return null;

  const showResult = phase === 'result' && lastRoll;
  const values = showResult ? lastRoll.values : null;

  return (
    <div
      ref={panelRef}
      className={`gl-dice-popover${closing ? ' fm-is-exiting' : ''}`}
      role="dialog"
      aria-label="Lanceur de dés"
      data-testid="gl-virtual-dice-popover"
      style={{
        ...themeStyle,
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
      onAnimationEnd={onAnimationEnd}
    >
      <header className="gl-dice-popover__header">
        <h3 className="gl-dice-popover__title">Dés virtuels</h3>
        <button
          type="button"
          className="gl-dice-popover__close"
          aria-label="Fermer"
          onClick={closeAnimated}
        >
          ✕
        </button>
      </header>

      <p className="gl-dice-popover__hint">
        {canRoll
          ? `D6 — jusqu'à ${MAX_DICE_COUNT} dés`
          : 'Lancer indisponible pour cette équipe ce tour.'}
      </p>

      <div className="gl-dice-popover__cubes" aria-live="polite">
        {Array.from({ length: diceCount }, (_, index) => {
          const value = values ? values[index] : null;
          return (
            <GLDiceCube
              key={`die-${index}-${showResult ? value : 'idle'}`}
              value={isRolling ? null : value}
              rolling={isRolling}
              staggerIndex={index}
              placeholder={!showResult && !isRolling}
            />
          );
        })}
      </div>

      {isRolling ? <p className="gl-dice-popover__status">Les dés roulent…</p> : null}

      {showResult ? (
        <div className="gl-dice-popover__result" data-testid="gl-dice-result">
          <p className="gl-dice-popover__total">
            Total : <strong>{lastRoll.total}</strong>
          </p>
          <p className="gl-dice-popover__breakdown">{formatDiceBreakdown(lastRoll.values)}</p>
        </div>
      ) : null}

      {phase === 'idle' || phase === 'result' ? (
        <div className="gl-dice-popover__count-row">
          <button
            type="button"
            className="gl-dice-popover__step"
            aria-label="Retirer un dé"
            disabled={!canRemoveDie}
            data-testid="gl-dice-remove"
            onClick={onRemoveDie}
          >
            −
          </button>
          <span className="gl-dice-popover__count-label">
            {diceCount} dé
            {diceCount > 1 ? 's' : ''}
          </span>
          <button
            type="button"
            className="gl-dice-popover__step"
            aria-label="Ajouter un dé"
            disabled={!canAddDie}
            data-testid="gl-dice-add"
            onClick={onAddDie}
          >
            +
          </button>
        </div>
      ) : null}

      <footer className="gl-dice-popover__footer">
        {phase === 'result' ? (
          <div className="gl-inline-actions">
            {!disableReroll ? (
              <GLButton type="button" onClick={onStartRoll} data-testid="gl-dice-reroll">
                Relancer
              </GLButton>
            ) : null}
            <GLButton
              type="button"
              variant="secondary"
              onClick={onReset}
              data-testid="gl-dice-edit-count"
            >
              {disableReroll ? 'Fermer' : 'Modifier le nombre'}
            </GLButton>
          </div>
        ) : (
          <GLButton
            type="button"
            disabled={isRolling || !canRoll}
            onClick={onStartRoll}
            data-testid="gl-dice-roll"
          >
            Lancer
          </GLButton>
        )}
      </footer>
    </div>
  );
}
