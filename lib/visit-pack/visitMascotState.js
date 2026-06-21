import { VISIT_MASCOT_DIALOG_LEGACY } from './visitMascotDialogEvents.js';
import { pickMascotDialogFromDefaults } from './visitMascotDialogApply.js';

const VISIT_MASCOT_DIALOG = VISIT_MASCOT_DIALOG_LEGACY;

const VISIT_MASCOT_STATE = {
  IDLE: 'idle',
  WALKING: 'walking',
  HAPPY: 'happy',
  RUNNING: 'running',
  HAPPY_JUMP: 'happy_jump',
  SPIN: 'spin',
  INSPECT: 'inspect',
  MAP_READ: 'map_read',
  CELEBRATE: 'celebrate',
  TALK: 'talk',
  ALERT: 'alert',
  ANGRY: 'angry',
  SURPRISE: 'surprise',
};

function pickMascotDialog(eventKey = 'idle') {
  return pickMascotDialogFromDefaults(eventKey);
}

function resolveVisitMascotState({
  state = '',
  happy = false,
  walking = false,
  running = false,
  celebrating = false,
  inspecting = false,
  mapReading = false,
  spinning = false,
  talking = false,
  alert = false,
  angry = false,
  surprise = false,
} = {}) {
  const explicitState = state;
  const normalizedState = String(explicitState || '')
    .trim()
    .toLowerCase();
  const knownStates = new Set(Object.values(VISIT_MASCOT_STATE));
  if (knownStates.has(normalizedState)) return normalizedState;
  if (celebrating) return VISIT_MASCOT_STATE.CELEBRATE;
  if (spinning) return VISIT_MASCOT_STATE.SPIN;
  if (angry) return VISIT_MASCOT_STATE.ANGRY;
  if (alert) return VISIT_MASCOT_STATE.ALERT;
  if (surprise) return VISIT_MASCOT_STATE.SURPRISE;
  if (inspecting) return VISIT_MASCOT_STATE.INSPECT;
  if (mapReading) return VISIT_MASCOT_STATE.MAP_READ;
  if (talking) return VISIT_MASCOT_STATE.TALK;
  if (running) return VISIT_MASCOT_STATE.RUNNING;
  if (happy) return VISIT_MASCOT_STATE.HAPPY;
  if (walking) return VISIT_MASCOT_STATE.WALKING;
  return VISIT_MASCOT_STATE.IDLE;
}

export { VISIT_MASCOT_STATE, VISIT_MASCOT_DIALOG, pickMascotDialog, resolveVisitMascotState };
