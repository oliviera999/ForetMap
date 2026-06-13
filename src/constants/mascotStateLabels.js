/**
 * Libellés et liste ordonnée des états d'animation de mascotte (UI éditeur WYSIWYG).
 * @see src/utils/visitMascotState.js
 */
import { VISIT_MASCOT_STATE } from '../utils/visitMascotState.js';

/** États canoniques triés alphabétiquement (clés). */
export const STATE_OPTIONS = Object.values(VISIT_MASCOT_STATE).sort();

/** Libellés humains par état. */
export const STATE_LABELS = {
  [VISIT_MASCOT_STATE.IDLE]: 'Repos',
  [VISIT_MASCOT_STATE.WALKING]: 'Marche',
  [VISIT_MASCOT_STATE.HAPPY]: 'Joyeuse',
  [VISIT_MASCOT_STATE.RUNNING]: 'Course',
  [VISIT_MASCOT_STATE.HAPPY_JUMP]: 'Saut joyeux',
  [VISIT_MASCOT_STATE.SPIN]: 'Rotation',
  [VISIT_MASCOT_STATE.INSPECT]: 'Inspection',
  [VISIT_MASCOT_STATE.MAP_READ]: 'Lecture carte',
  [VISIT_MASCOT_STATE.CELEBRATE]: 'Célébration',
  [VISIT_MASCOT_STATE.TALK]: 'Dialogue',
  [VISIT_MASCOT_STATE.ALERT]: 'Alerte',
  [VISIT_MASCOT_STATE.ANGRY]: 'Fâchée',
  [VISIT_MASCOT_STATE.SURPRISE]: 'Surprise',
};
