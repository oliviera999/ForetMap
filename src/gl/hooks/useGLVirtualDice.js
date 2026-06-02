import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clampDiceCount,
  DICE_ROLL_ANIMATION_MS,
  readStoredDiceCount,
  rollDice,
  writeStoredDiceCount,
} from '../utils/glVirtualDice.js';

export function useGLVirtualDice({ prefersReducedMotion = false } = {}) {
  const [phase, setPhase] = useState('idle');
  const [diceCount, setDiceCount] = useState(() => readStoredDiceCount());
  const [lastRoll, setLastRoll] = useState(null);
  const rollTimerRef = useRef(null);

  useEffect(() => () => {
    if (rollTimerRef.current != null) {
      clearTimeout(rollTimerRef.current);
      rollTimerRef.current = null;
    }
  }, []);

  const setCount = useCallback((next) => {
    const clamped = clampDiceCount(next);
    setDiceCount(clamped);
    writeStoredDiceCount(clamped);
  }, []);

  const addDie = useCallback(() => {
    if (phase === 'rolling') return;
    setCount(diceCount + 1);
  }, [diceCount, phase, setCount]);

  const removeDie = useCallback(() => {
    if (phase === 'rolling') return;
    setCount(diceCount - 1);
  }, [diceCount, phase, setCount]);

  const reset = useCallback(() => {
    if (rollTimerRef.current != null) {
      clearTimeout(rollTimerRef.current);
      rollTimerRef.current = null;
    }
    setPhase('idle');
    setLastRoll(null);
  }, []);

  const startRoll = useCallback(() => {
    if (phase === 'rolling') return;
    setPhase('rolling');
    setLastRoll(null);
    const duration = prefersReducedMotion ? 0 : DICE_ROLL_ANIMATION_MS;
    if (rollTimerRef.current != null) clearTimeout(rollTimerRef.current);
    rollTimerRef.current = setTimeout(() => {
      rollTimerRef.current = null;
      const result = rollDice(diceCount);
      setLastRoll(result);
      setPhase('result');
    }, duration);
  }, [diceCount, phase, prefersReducedMotion]);

  return {
    phase,
    diceCount,
    lastRoll,
    addDie,
    removeDie,
    reset,
    startRoll,
    canAddDie: diceCount < 5 && phase !== 'rolling',
    canRemoveDie: diceCount > 1 && phase !== 'rolling',
    isRolling: phase === 'rolling',
  };
}
