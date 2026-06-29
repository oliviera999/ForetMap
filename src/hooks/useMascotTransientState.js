import { useCallback, useEffect, useRef } from 'react';

/**
 * Mécanique **partagée** « état transitoire + timeout + garde anti-idle » des runtimes mascotte
 * (étape 7 de convergence). Paramétrée par **arité** via une *clé* : chaque clé a son propre timer.
 * Le runtime **mono** (visite) utilise une clé fixe ; le runtime **multi** (plateau GL) utilise
 * l'identifiant d'équipe. Factorise la logique auparavant dupliquée entre
 * `useVisitMascotStateMachine` et `useGLBoardMascotMotion`.
 *
 * Comportement (identique aux deux implémentations d'origine) :
 * - `resolveState(state)` résout l'état demandé (défaut : `String(state).trim()`).
 * - **garde anti-idle** : un état vide ou égal à `idleState` est ignoré (aucun transient).
 * - le timer précédent de la clé est annulé avant d'armer le nouveau.
 * - durée appliquée : `Math.max(minDurationMs, Number(durationMs ?? defaultDurationMs) || fallbackDurationMs)`.
 * - à expiration : le timer est retiré du registre **puis** l'état transitoire est remis à vide.
 * - nettoyage de tous les timers au démontage.
 *
 * Les callbacks/config sont lus via une ref interne : `trigger`/`reset`/`clearTimer` ont une
 * **identité stable** (ne se recréent pas à chaque rendu), tout en utilisant toujours la dernière
 * config (ex. `resolveState` capturant les états personnalisés courants).
 *
 * @param {{
 *   resolveState?: (state: unknown) => string,
 *   idleState?: string,
 *   defaultDurationMs?: number,
 *   fallbackDurationMs?: number,
 *   minDurationMs?: number,
 *   setTransient: (key: unknown, wanted: string) => void,
 *   clearTransient: (key: unknown) => void,
 * }} cfg
 * @returns {{
 *   trigger: (key: unknown, state: unknown, durationMs?: number) => void,
 *   reset: (key: unknown) => void,
 *   clearTimer: (key: unknown) => void,
 * }}
 */
export function useMascotTransientState({
  resolveState,
  idleState = 'idle',
  defaultDurationMs = 1500,
  fallbackDurationMs,
  minDurationMs = 300,
  setTransient,
  clearTransient,
}) {
  const timeoutsRef = useRef(new Map());
  const cfgRef = useRef(null);
  cfgRef.current = {
    resolveState: typeof resolveState === 'function' ? resolveState : (s) => String(s || '').trim(),
    idleState,
    defaultDurationMs,
    fallbackDurationMs: fallbackDurationMs == null ? defaultDurationMs : fallbackDurationMs,
    minDurationMs,
    setTransient,
    clearTransient,
  };

  const clearTimer = useCallback((key) => {
    const t = timeoutsRef.current.get(key);
    if (t) {
      clearTimeout(t);
      timeoutsRef.current.delete(key);
    }
  }, []);

  const reset = useCallback(
    (key) => {
      clearTimer(key);
      cfgRef.current.clearTransient(key);
    },
    [clearTimer],
  );

  const trigger = useCallback(
    (key, state, durationMs) => {
      const cfg = cfgRef.current;
      const wanted = cfg.resolveState(state);
      if (!wanted || wanted === cfg.idleState) return;
      clearTimer(key);
      cfg.setTransient(key, wanted);
      const requested = durationMs == null ? cfg.defaultDurationMs : durationMs;
      const ms = Math.max(cfg.minDurationMs, Number(requested) || cfg.fallbackDurationMs);
      timeoutsRef.current.set(
        key,
        window.setTimeout(() => {
          timeoutsRef.current.delete(key);
          cfgRef.current.clearTransient(key);
        }, ms),
      );
    },
    [clearTimer],
  );

  useEffect(
    () => () => {
      for (const t of timeoutsRef.current.values()) clearTimeout(t);
      timeoutsRef.current.clear();
    },
    [],
  );

  return { trigger, reset, clearTimer };
}

export default useMascotTransientState;
