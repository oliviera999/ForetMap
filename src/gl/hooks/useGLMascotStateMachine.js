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

function resolveStateForTeam(teamId, lastEvent) {
  const id = Number(teamId);
  if (!lastEvent) return GL_MASCOT_STATE.IDLE;
  const eventTeamId = lastEvent?.teamId != null ? Number(lastEvent.teamId) : null;
  if (lastEvent.eventType === 'score' && eventTeamId === id) {
    return GL_MASCOT_STATE.HAPPY;
  }
  if (lastEvent.eventType === 'narration') {
    if (eventTeamId == null || eventTeamId === id) {
      return GL_MASCOT_STATE.TALKING;
    }
  }
  return GL_MASCOT_STATE.IDLE;
}

export function useGLMascotStateMachine({ gameState }) {
  return useMemo(() => {
    const teams = Array.isArray(gameState?.teams) ? gameState.teams : [];
    const events = Array.isArray(gameState?.events) ? gameState.events : [];
    const lastEvent = events.length > 0 ? events[events.length - 1] : null;
    const map = new Map();
    for (const team of teams) {
      map.set(Number(team.id), resolveStateForTeam(team.id, lastEvent));
    }
    return {
      getStateForTeam(teamId) {
        return map.get(Number(teamId)) || GL_MASCOT_STATE.IDLE;
      },
    };
  }, [gameState]);
}
