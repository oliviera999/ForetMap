import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGLVirtualDice } from '../hooks/useGLVirtualDice.js';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js';
import { GLVirtualDicePopover } from './GLVirtualDicePopover.jsx';
import { GLBoardActionButton } from './GLBoardActionButton.jsx';

export function GLVirtualDiceDock({
  themeStyle = null,
  enabled = true,
  testId = 'gl-virtual-dice-fab',
  showLabel = true,
  onRollResult,
}) {
  const fabRef = useRef(null);
  const [open, setOpen] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const dice = useGLVirtualDice({ prefersReducedMotion });
  const lastRollKeyRef = useRef('');

  useEffect(() => {
    if (!onRollResult || dice.phase !== 'result' || !dice.lastRoll) return;
    const rollKey = `${dice.lastRoll.values?.join(',')}:${dice.lastRoll.total}`;
    if (lastRollKeyRef.current === rollKey) return;
    lastRollKeyRef.current = rollKey;
    onRollResult(dice.lastRoll);
  }, [dice.phase, dice.lastRoll, onRollResult]);

  if (!enabled) return null;

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
    <div className="gl-board-chrome-dock gl-board-chrome-dock--left">
      <GLBoardActionButton
        ref={fabRef}
        role="tool"
        active={open}
        icon="🎲"
        label={showLabel ? 'Dés' : null}
        testId={testId}
        title="Dés virtuels"
        ariaLabel={open ? 'Fermer le lanceur de dés' : 'Ouvrir le lanceur de dés'}
        ariaExpanded={open}
        ariaHaspopup="dialog"
        onClick={toggleOpen}
      />
      {typeof document !== 'undefined' ? createPortal(popover, document.body) : popover}
    </div>
  );
}
