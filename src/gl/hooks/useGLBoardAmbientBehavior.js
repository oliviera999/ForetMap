import { useEffect, useRef } from 'react';
import { getAmbientActions, runBehaviorAction } from '../../utils/mascotBehaviorEngine.js';

/**
 * Comportements ambiants des mascottes d'équipe sur le plateau GL : pour chaque
 * équipe, joue les déclencheurs `periodic` du pack de sa mascotte (toutes les
 * `everyMs`). S'appuie sur le **moteur de comportement partagé** (`mascotBehaviorEngine`)
 * et la primitive GL `triggerTransient(teamId, state, durationMs)`.
 *
 * Respecte `prefers-reduced-motion`. Symétrique de `useAmbientMascotBehavior` côté visite.
 *
 * @param {object} params
 * @param {Array<{ id: number|string, mascot_id?: string }>} params.teams
 * @param {(team: object) => (object|null)} params.resolveEntry Entrée catalogue d'une équipe.
 * @param {(teamId: number|string, state: string, durationMs: number) => void} params.triggerTransient
 * @param {boolean} [params.prefersReducedMotion]
 */
export function useGLBoardAmbientBehavior({
  teams = [],
  resolveEntry,
  triggerTransient,
  prefersReducedMotion = false,
}) {
  const triggerRef = useRef(triggerTransient);
  triggerRef.current = triggerTransient;
  const resolveRef = useRef(resolveEntry);
  resolveRef.current = resolveEntry;

  // Signature stable : (teamId → déclencheurs périodiques) pour relancer les timers au besoin.
  const list = Array.isArray(teams) ? teams : [];
  const signature = JSON.stringify(
    list.map((team) => {
      const entry = typeof resolveEntry === 'function' ? resolveEntry(team) : null;
      const actions = getAmbientActions(entry);
      return [team?.id, actions.map((a) => [a.key, a.state, a.durationMs, a.everyMs])];
    }),
  );

  useEffect(() => {
    if (prefersReducedMotion || typeof window === 'undefined') return undefined;
    const timers = [];
    for (const team of list) {
      const teamId = team?.id;
      if (teamId == null) continue;
      const entry = typeof resolveRef.current === 'function' ? resolveRef.current(team) : null;
      const actions = getAmbientActions(entry);
      for (const action of actions) {
        if (!(Number(action.everyMs) >= 1000)) continue;
        timers.push(
          window.setInterval(() => {
            runBehaviorAction(action, {
              playState: (state, durationMs) => triggerRef.current?.(teamId, state, durationMs),
            });
          }, Number(action.everyMs)),
        );
      }
    }
    return () => timers.forEach((id) => window.clearInterval(id));
    // `signature` capture les déclencheurs périodiques par équipe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefersReducedMotion, signature]);
}

export default useGLBoardAmbientBehavior;
