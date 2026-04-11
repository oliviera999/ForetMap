const VISIT_MASCOT_STATE = {
  IDLE: 'idle',
  WALKING: 'walking',
  HAPPY: 'happy',
};

const VISIT_MASCOT_DIALOG = {
  move: [
    'Je trottine derriere toi.',
    'Le sentier du gnome est ouvert.',
    'On explore la foret ensemble.',
  ],
  mark_seen: [
    'Bravo, zone benie du gnome.',
    'Excellent, repere valide.',
    'Parfait, la foret te remercie.',
  ],
  idle: [
    'Ton gnome gardien est pret.',
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
