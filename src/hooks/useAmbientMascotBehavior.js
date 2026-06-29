import { useEffect, useRef } from 'react';
import {
  getPeriodicTriggers,
  periodicTriggersSignature,
  resolveTriggerDialogLines,
} from '../utils/visitMascotCustomBehaviors.js';

/**
 * Moteur de comportements ambiants data-driven : joue les déclencheurs `periodic`
 * d'un pack mascotte (jouer un état pendant `durationMs` toutes les `everyMs`).
 *
 * S'appuie sur le mécanisme générique `triggerTransientState(state, durationMs)`
 * (machine à états visite / GL board). Respecte `prefers-reduced-motion`.
 *
 * @param {object} params
 * @param {object|null} params.entry Entrée catalogue résolue (porte `customTriggers`).
 * @param {(state: string, durationMs: number) => void} params.triggerTransientState
 * @param {boolean} [params.enabled]
 * @param {boolean} [params.prefersReducedMotion]
 * @param {((lines: string[]) => void)|null} [params.showDialog] Affiche une bulle optionnelle.
 */
export default function useAmbientMascotBehavior({
  entry = null,
  triggerTransientState,
  enabled = true,
  prefersReducedMotion = false,
  showDialog = null,
} = {}) {
  const triggerRef = useRef(triggerTransientState);
  triggerRef.current = triggerTransientState;
  const showRef = useRef(showDialog);
  showRef.current = showDialog;
  const entryRef = useRef(entry);
  entryRef.current = entry;

  const periodic = getPeriodicTriggers(entry);
  const signature = periodicTriggersSignature(periodic);

  useEffect(() => {
    if (!enabled || prefersReducedMotion) return undefined;
    if (typeof window === 'undefined' || !periodic.length) return undefined;
    const timers = periodic.map((trig) =>
      window.setInterval(() => {
        if (typeof triggerRef.current === 'function') {
          triggerRef.current(trig.state, Number(trig.durationMs) || 1000);
        }
        // Bulle : profil de dialogue central (dialogProfile[clé]) ou inline.
        const lines = resolveTriggerDialogLines(entryRef.current, trig);
        if (lines.length && typeof showRef.current === 'function') {
          showRef.current(lines);
        }
      }, Number(trig.everyMs)),
    );
    return () => timers.forEach((id) => window.clearInterval(id));
    // `signature` capture les champs pertinents des déclencheurs périodiques.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, prefersReducedMotion, signature]);
}
