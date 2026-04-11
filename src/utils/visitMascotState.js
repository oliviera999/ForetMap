const VISIT_MASCOT_STATE = {
  IDLE: 'idle',
  WALKING: 'walking',
  HAPPY: 'happy',
};

const VISIT_MASCOT_DIALOG = {
  move: [
    'Je te suis.',
    'On avance.',
    'Continuons la visite.',
  ],
  mark_seen: [
    'Bravo, repère validé.',
    'Super, zone visitée.',
    'Très bien, on continue.',
  ],
  idle: [
    'Je suis prêt.',
  ],
};

function pickMascotDialog(eventKey = 'idle') {
  const list = VISIT_MASCOT_DIALOG[eventKey] || VISIT_MASCOT_DIALOG.idle;
  if (!Array.isArray(list) || list.length === 0) return '';
  const idx = Math.floor(Math.random() * list.length);
  return list[idx] || '';
}

function resolveVisitMascotState({ happy = false, walking = false } = {}) {
  if (happy) return VISIT_MASCOT_STATE.HAPPY;
  if (walking) return VISIT_MASCOT_STATE.WALKING;
  return VISIT_MASCOT_STATE.IDLE;
}

export {
  VISIT_MASCOT_STATE,
  VISIT_MASCOT_DIALOG,
  pickMascotDialog,
  resolveVisitMascotState,
};
