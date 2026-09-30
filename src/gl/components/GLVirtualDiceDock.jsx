import { useCallback, useEffect, useRef, useState } from 'react';
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
  // GL4 : quand la partie enregistre les jets, c'est le SERVEUR qui tire les dés —
  // `onRecordRoll({ count })` renvoie le résultat officiel, affiché tel quel.
  const onRecordRollRef = useRef(onRecordRoll);
  useEffect(() => {
    onRecordRollRef.current = onRecordRoll;
  }, [onRecordRoll]);
  const hasRecorder = typeof onRecordRoll === 'function';
  const resolveRoll = useCallback(async (count) => {
    const recorder = onRecordRollRef.current;
    if (typeof recorder !== 'function') return null;
    const result = await recorder({ count });
    return result && Array.isArray(result.values) ? result : null;
  }, []);
  const dice = useGLVirtualDice({
    prefersReducedMotion,
    resolveRoll: hasRecorder ? resolveRoll : null,
  });
  const lastRollRef = useRef(null);
  const { reset: resetDice, phase, lastRoll } = dice;

  useEffect(() => {
    if (phase !== 'result' || !lastRoll) return;
    // Un même résultat (objet) n'est appliqué qu'une fois (re-rendus, StrictMode).
    if (lastRollRef.current === lastRoll) return;
    lastRollRef.current = lastRoll;
    if (onRollResult) onRollResult(lastRoll);
  }, [phase, lastRoll, onRollResult]);

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
        tone="tool"
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
