import { useEffect, useRef } from 'react';

/** Gestes qui prouvent qu'une personne est devant la borne. */
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel', 'scroll'];

/**
 * Remise à zéro d'une **borne de démonstration** (`?kiosque=1`) : après `idleMs` sans
 * geste, `onIdle` est appelé une fois. Le compte à rebours repart à chaque interaction.
 *
 * Le hook ne décide pas de la remise à zéro elle-même (rechargement de la page, en
 * pratique) : il ne fait que mesurer l'inactivité, ce qui le rend testable à l'horloge.
 *
 * @param {{ enabled: boolean, idleMs: number, onIdle: () => void }} options
 */
export function useGlKioskIdleReset({ enabled = false, idleMs = 120_000, onIdle }) {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!enabled || !(idleMs > 0) || typeof window === 'undefined') return undefined;
    let timer = 0;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          onIdleRef.current?.();
        } catch (_) {
          /* la remise à zéro ne doit jamais casser la borne */
        }
      }, idleMs);
    };
    for (const type of ACTIVITY_EVENTS) window.addEventListener(type, arm, { passive: true });
    arm();
    return () => {
      clearTimeout(timer);
      for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, arm);
    };
  }, [enabled, idleMs]);
}
