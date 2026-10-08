import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * État des effets visuels du « zoom sur le lieu » (`PctPlaceFocusFx`), piloté par les
 * événements `onFx` de `usePlaceFocusSequence`.
 *
 * Phases : `in` (le zoom vole vers le lieu) → `hold` (fiche ouverte : le projecteur reste,
 * plus léger) → `out` (retour à la vue d'avant) → aucune. `cancel` éteint tout.
 *
 * @param {{ emoji?: boolean, spotlight?: boolean, sparkles?: boolean }} effects
 * @returns {{ fx: object|null, onFx: (event: object) => void }}
 */
export function usePlaceFocusFx({ emoji = false, spotlight = false, sparkles = false } = {}) {
  const [fx, setFx] = useState(null);
  const timerRef = useRef(null);
  const keyRef = useRef(0);
  const effectsRef = useRef({ emoji, spotlight, sparkles });
  effectsRef.current = { emoji, spotlight, sparkles };

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const onFx = useCallback(
    (event) => {
      const effects = effectsRef.current;
      const any = effects.emoji || effects.spotlight || effects.sparkles;
      if (!event || event.type === 'cancel' || !any) {
        clearTimer();
        setFx(null);
        return;
      }
      if (event.type !== 'in' && event.type !== 'out') return;
      const durationMs = Math.max(0, Number(event.durationMs) || 0);
      keyRef.current += 1;
      const key = keyRef.current;
      clearTimer();
      setFx((prev) => ({
        key,
        phase: event.type,
        place: event.place || prev?.place || null,
        fromScale: event.fromScale,
        toScale: event.toScale,
        durationMs,
        // Le trou du projecteur garde la taille prise une fois le lieu cadré.
        holeScale: event.type === 'in' ? event.toScale : prev?.holeScale || event.fromScale,
        effects: { ...effects },
      }));
      timerRef.current = setTimeout(
        () => {
          timerRef.current = null;
          setFx((cur) => {
            if (!cur || cur.key !== key) return cur;
            return event.type === 'in' ? { ...cur, phase: 'hold' } : null;
          });
        },
        // Les étincelles (700 ms dans `placeFocusFx.css`) débordent un peu le vol.
        event.type === 'in' && effects.sparkles ? Math.max(durationMs, 700) : durationMs,
      );
    },
    [clearTimer],
  );

  return useMemo(() => ({ fx, onFx }), [fx, onFx]);
}
