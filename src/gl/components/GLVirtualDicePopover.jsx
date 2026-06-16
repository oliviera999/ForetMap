import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GLButton } from './ui/GLButton.jsx';
import { GLDiceCube } from './GLDiceCube.jsx';
import { formatDiceBreakdown, MAX_DICE_COUNT } from '../utils/glVirtualDice.js';

export function GLVirtualDicePopover({
  open,
  anchorRef,
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
  themeStyle = null,
}) {
  const panelRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !anchorRef?.current) return;
    const anchor = anchorRef.current.getBoundingClientRect();
    const panel = panelRef.current;
    const panelWidth = panel?.offsetWidth || 300;
    const panelHeight = panel?.offsetHeight || 280;
    const margin = 8;
    let left = anchor.left;
    let top = anchor.top - panelHeight - margin;
    if (top < margin) {
      top = anchor.bottom + margin;
    }
    left = Math.max(margin, Math.min(left, window.innerWidth - panelWidth - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - panelHeight - margin));
    setPosition({ top, left });
  }, [open, anchorRef, phase, diceCount, lastRoll]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      const target = event.target;
      if (anchorRef?.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      onClose?.();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  const showResult = phase === 'result' && lastRoll;
  const values = showResult ? lastRoll.values : null;

  return (
    <div
      ref={panelRef}
      className="gl-dice-popover"
      role="dialog"
      aria-label="Lanceur de dés"
      data-testid="gl-virtual-dice-popover"
      style={{
        ...themeStyle,
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      <header className="gl-dice-popover__header">
        <h3 className="gl-dice-popover__title">Dés virtuels</h3>
        <button
          type="button"
          className="gl-dice-popover__close"
          aria-label="Fermer"
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <p className="gl-dice-popover__hint">D6 — jusqu&apos;à {MAX_DICE_COUNT} dés</p>

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
            <GLButton type="button" onClick={onStartRoll} data-testid="gl-dice-reroll">
              Relancer
            </GLButton>
            <GLButton
              type="button"
              variant="secondary"
              onClick={onReset}
              data-testid="gl-dice-edit-count"
            >
              Modifier le nombre
            </GLButton>
          </div>
        ) : (
          <GLButton
            type="button"
            disabled={isRolling}
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
