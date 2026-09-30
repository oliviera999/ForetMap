import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clampDiceCount,
  DICE_ROLL_ANIMATION_MS,
  readStoredDiceCount,
  rollDice,
  writeStoredDiceCount,
} from '../utils/glVirtualDice.js';

/**
 * Lanceur de dés virtuels.
 *
 * @param {object} [options]
 * @param {boolean} [options.prefersReducedMotion]
 * @param {((count: number) => Promise<{values:number[],total:number}|null>)|null} [options.resolveRoll]
 *   Tirage SERVEUR (audit sécurité 2026-09-30, GL4) : appelé au lancement, en parallèle de
 *   l'animation ; le résultat affiché est celui qu'il renvoie. `null` (refus, erreur) ramène
 *   le lanceur au repos. Sans `resolveRoll`, tirage local (démo invité, partie hors ligne).
 */
export function useGLVirtualDice({ prefersReducedMotion = false, resolveRoll = null } = {}) {
  const [phase, setPhase] = useState('idle');
  const [diceCount, setDiceCount] = useState(() => readStoredDiceCount());
  const [lastRoll, setLastRoll] = useState(null);
  const rollTimerRef = useRef(null);
  const rollSeqRef = useRef(0);

  useEffect(
    () => () => {
      rollSeqRef.current += 1;
      if (rollTimerRef.current != null) {
        clearTimeout(rollTimerRef.current);
        rollTimerRef.current = null;
      }
    },
    [],
  );

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
    rollSeqRef.current += 1;
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
    const seq = rollSeqRef.current + 1;
    rollSeqRef.current = seq;
    const count = diceCount;
    // Tirage serveur lancé tout de suite : l'animation masque l'aller-retour réseau.
    const pending = resolveRoll
      ? Promise.resolve()
          .then(() => resolveRoll(count))
          .catch(() => null)
      : null;
    rollTimerRef.current = setTimeout(() => {
      rollTimerRef.current = null;
      if (!pending) {
        setLastRoll(rollDice(count));
        setPhase('result');
        return;
      }
      pending.then((result) => {
        if (rollSeqRef.current !== seq) return;
        if (!result || !Array.isArray(result.values)) {
          setLastRoll(null);
          setPhase('idle');
          return;
        }
        setLastRoll({ values: result.values.map(Number), total: Number(result.total) });
        setPhase('result');
      });
    }, duration);
  }, [diceCount, phase, prefersReducedMotion, resolveRoll]);

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
