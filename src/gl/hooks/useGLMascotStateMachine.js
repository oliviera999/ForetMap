import { useMemo } from 'react';
import { VISIT_MASCOT_STATE } from '../../utils/visitMascotState.js';

export const GL_MASCOT_STATE = {
  IDLE: VISIT_MASCOT_STATE.IDLE,
  WALKING: VISIT_MASCOT_STATE.WALKING,
  TALKING: VISIT_MASCOT_STATE.TALK,
  HAPPY: VISIT_MASCOT_STATE.HAPPY,
  SAD: VISIT_MASCOT_STATE.ANGRY,
  VICTORY: VISIT_MASCOT_STATE.HAPPY,
};

export function useGLMascotStateMachine({ gameState }) {
  return useMemo(() => {
    const map = new Map();
    const teams = Array.isArray(gameState?.teams) ? gameState.teams : [];
    const events = Array.isArray(gameState?.events) ? gameState.events : [];
    const lastEvent = events.length > 0 ? events[events.length - 1] : null;
    for (const team of teams) {
      const teamId = Number(team.id);
      let state = GL_MASCOT_STATE.IDLE;
      if (lastEvent?.eventType === 'narration') {
        state = GL_MASCOT_STATE.TALKING;
      }
      if (lastEvent?.eventType === 'score' && Number(lastEvent?.teamId) === teamId) {
        state = GL_MASCOT_STATE.HAPPY;
      }
      map.set(teamId, state);
    }
    return {
      getStateForTeam(teamId) {
        return map.get(Number(teamId)) || GL_MASCOT_STATE.IDLE;
      },
    };
  }, [gameState]);
}
