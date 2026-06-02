import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGLVirtualDice } from '../hooks/useGLVirtualDice.js';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js';
import { GLVirtualDicePopover } from './GLVirtualDicePopover.jsx';

export function GLVirtualDiceDock({ themeStyle = null }) {
  const fabRef = useRef(null);
  const [open, setOpen] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const dice = useGLVirtualDice({ prefersReducedMotion });

  function toggleOpen() {
    setOpen((prev) => {
      const next = !prev;
      if (!next) dice.reset();
      return next;
    });
  }

  function close() {
    setOpen(false);
    dice.reset();
  }

  const popover = (
    <GLVirtualDicePopover
      open={open}
      anchorRef={fabRef}
      phase={dice.phase}
      diceCount={dice.diceCount}
      lastRoll={dice.lastRoll}
      onClose={close}
      onAddDie={dice.addDie}
      onRemoveDie={dice.removeDie}
      onStartRoll={dice.startRoll}
      onReset={dice.reset}
      canAddDie={dice.canAddDie}
      canRemoveDie={dice.canRemoveDie}
      isRolling={dice.isRolling}
      themeStyle={themeStyle}
    />
  );

  return (
    <div className="gl-dice-dock">
      <button
        ref={fabRef}
        type="button"
        className={`gl-dice-fab${open ? ' is-open' : ''}`}
        data-testid="gl-virtual-dice-fab"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={open ? 'Fermer le lanceur de dés' : 'Ouvrir le lanceur de dés'}
        title="Dés virtuels"
        onClick={toggleOpen}
      >
        <span className="gl-dice-fab__icon" aria-hidden>🎲</span>
        <span className="gl-dice-fab__label">Dés</span>
      </button>
      {typeof document !== 'undefined'
        ? createPortal(popover, document.body)
        : popover}
    </div>
  );
}
