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
  canRoll = true,
  disableReroll = false,
  onRecordRoll = null,
  onRollResult,
  boardShellRef = null,
  forceClose = false,
}) {
  const fabRef = useRef(null);
  const [open, setOpen] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const dice = useGLVirtualDice({ prefersReducedMotion });
  const lastRollKeyRef = useRef('');
  const applyingRef = useRef(false);
  const { reset: resetDice, phase, lastRoll } = dice;

  useEffect(() => {
    if (phase !== 'result' || !lastRoll) return undefined;
    const rollKey = `${lastRoll.values?.join(',')}:${lastRoll.total}`;
    if (lastRollKeyRef.current === rollKey || applyingRef.current) return undefined;

    applyingRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        if (onRecordRoll) {
          const ok = await onRecordRoll(lastRoll);
          if (!ok || cancelled) {
            if (!cancelled) resetDice();
            return;
          }
        }
        lastRollKeyRef.current = rollKey;
        if (onRollResult && !cancelled) {
          await onRollResult(lastRoll);
        }
      } finally {
        applyingRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, lastRoll, onRollResult, onRecordRoll, resetDice]);

  // Quand un popover d'arrivée (QCM / effet de repère) s'ouvre, on referme le lanceur
  // de dés : il passait au-dessus (z-index) et masquait/parasitait le popover du repère.
  useEffect(() => {
    if (!forceClose) return;
    setOpen(false);
    resetDice();
  }, [forceClose, resetDice]);

  if (!enabled) return null;

  function toggleOpen() {
    if (!canRoll) return;
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
      avoidRectRef={boardShellRef}
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
      disableReroll={disableReroll}
      canRoll={canRoll}
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
        title={
          canRoll
            ? 'Dés virtuels'
            : 'Dés indisponibles (tour non lancé ou déjà lancé pour cette équipe)'
        }
        ariaLabel={open ? 'Fermer le lanceur de dés' : 'Ouvrir le lanceur de dés'}
        ariaExpanded={open}
        ariaHaspopup="dialog"
        disabled={!canRoll}
        onClick={toggleOpen}
      />
      {typeof document !== 'undefined' ? createPortal(popover, document.body) : popover}
    </div>
  );
}
