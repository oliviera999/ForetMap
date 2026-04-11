const VISIT_MASCOT_STATE = {
  IDLE: 'idle',
  WALKING: 'walking',
  HAPPY: 'happy',
  TALK: 'talk',
  ALERT: 'alert',
  ANGRY: 'angry',
  SURPRISE: 'surprise',
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
  talk: [
    'Je te raconte ce que je vois ici.',
    'Regarde ce detail, il est important.',
  ],
  alert: [
    'Attention, il y a quelque chose a verifier.',
    'Je detecte une zone qui merite ton regard.',
  ],
  angry: [
    'Oups... ce coin de la foret ne va pas bien.',
    'Je rale un peu, aidons la nature ici.',
  ],
  surprise: [
    'Oh ! Tu as vu ca ?',
    'Surprise, cette zone cache un detail.',
  ],
};

function pickMascotDialog(eventKey = 'idle') {
  const list = VISIT_MASCOT_DIALOG[eventKey] || VISIT_MASCOT_DIALOG.idle;
  if (!Array.isArray(list) || list.length === 0) return '';
  const idx = Math.floor(Math.random() * list.length);
  return list[idx] || '';
}

function resolveVisitMascotState({
  state = '',
  happy = false,
  walking = false,
  talking = false,
  alert = false,
  angry = false,
  surprise = false,
} = {}) {
  const explicitState = state;
  const normalizedState = String(explicitState || '').trim().toLowerCase();
  const knownStates = new Set(Object.values(VISIT_MASCOT_STATE));
  if (knownStates.has(normalizedState)) return normalizedState;
  if (angry) return VISIT_MASCOT_STATE.ANGRY;
  if (alert) return VISIT_MASCOT_STATE.ALERT;
  if (surprise) return VISIT_MASCOT_STATE.SURPRISE;
  if (talking) return VISIT_MASCOT_STATE.TALK;
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
