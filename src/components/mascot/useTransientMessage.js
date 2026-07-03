import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Message transitoire (feedback UI) auto-effacé après un délai.
 * Remplace les motifs `setXxxFeedback(msg)` + `setTimeout(() => setXxxFeedback(''), ms)`
 * dispersés dans le studio mascotte (audit §6.1) : le timer est **annulé** entre deux
 * déclenchements (le dernier message gagne) et **au démontage** (pas de setState orphelin).
 *
 * @param {number} defaultMs délai d'effacement par défaut (ms)
 * @returns {[string, (message: string, ms?: number) => void, () => void]}
 *   `[message, show, clear]` — `show('')` efface immédiatement ; `show(msg, ms)` permet
 *   un délai ponctuel différent du défaut.
 */
export function useTransientMessage(defaultMs = 2500) {
  const [message, setMessage] = useState('');
  const timerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clear = useCallback(() => {
    clearTimer();
    setMessage('');
  }, [clearTimer]);

  const show = useCallback(
    (nextMessage, ms) => {
      clearTimer();
      const text = String(nextMessage ?? '');
      setMessage(text);
      if (!text) return;
      const delay = Number(ms ?? defaultMs) || defaultMs;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setMessage('');
      }, delay);
    },
    [clearTimer, defaultMs],
  );

  useEffect(() => clearTimer, [clearTimer]);

  return [message, show, clear];
}

export default useTransientMessage;
