/**
 * Clés stables du profil d’interaction mascotte visite (pack v2).
 * Alignées sur les déclenchements historiques dans visit-views.jsx.
 */
import { z } from 'zod';
import { VISIT_MASCOT_STATE } from './visitMascotState.js';

export const VISIT_MASCOT_INTERACTION_EVENT = {
  MASCOT_DRAG_VERY_LARGE: 'mascotDragVeryLarge',
  MASCOT_DRAG_LARGE: 'mascotDragLarge',
  MARKER_MARKED_SEEN: 'markerMarkedSeen',
  MARKER_MARKED_SEEN_HAPPY: 'markerMarkedSeenHappy',
  MAP_READ_OPEN: 'mapReadOpen',
  MARKER_INSPECT_OPEN: 'markerInspectOpen',
};

/** @type {string[]} */
export const VISIT_MASCOT_INTERACTION_EVENT_KEYS = Object.freeze(Object.values(VISIT_MASCOT_INTERACTION_EVENT));

const STATE_VALUES = Object.values(VISIT_MASCOT_STATE);

export const interactionRuleSchema = z.object({
  mode: z.enum(['none', 'transient', 'happy']),
  state: z.string().optional(),
  durationMs: z.number().int().min(200).max(60_000).optional(),
}).superRefine((data, ctx) => {
  if (data.mode === 'transient') {
    const st = String(data.state || '').trim();
    if (!STATE_VALUES.includes(st)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['state'],
        message: `État transitoire requis (une valeur de VISIT_MASCOT_STATE).`,
      });
    }
  }
  if (data.mode === 'happy' && data.state) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['state'], message: 'Le mode happy n’utilise pas le champ state.' });
  }
});

/** Schéma : uniquement les clés connues, chaque valeur = règle. */
export function buildInteractionProfileSchema() {
  const shape = {};
  for (const key of VISIT_MASCOT_INTERACTION_EVENT_KEYS) {
    shape[key] = interactionRuleSchema.optional();
  }
  return z.object(shape).strict();
}

export const interactionProfileSchema = buildInteractionProfileSchema();

/** Profil par défaut = comportement ForetMap avant pack v2. */
/** Libellés UI (studio prof). */
export const VISIT_MASCOT_INTERACTION_LABELS = Object.freeze({
  [VISIT_MASCOT_INTERACTION_EVENT.MASCOT_DRAG_VERY_LARGE]: 'Déplacement très long sur le plan',
  [VISIT_MASCOT_INTERACTION_EVENT.MASCOT_DRAG_LARGE]: 'Déplacement long sur le plan',
  [VISIT_MASCOT_INTERACTION_EVENT.MARKER_MARKED_SEEN]: 'Marquage « vu » (repère ou zone)',
  [VISIT_MASCOT_INTERACTION_EVENT.MARKER_MARKED_SEEN_HAPPY]: 'Animation joyeuse au marquage vu',
  [VISIT_MASCOT_INTERACTION_EVENT.MAP_READ_OPEN]: 'Ouverture d’une zone (mascotte lit la carte)',
  [VISIT_MASCOT_INTERACTION_EVENT.MARKER_INSPECT_OPEN]: 'Ouverture d’un repère (inspection)',
});

export const DEFAULT_VISIT_MASCOT_INTERACTION_PROFILE = Object.freeze({
  [VISIT_MASCOT_INTERACTION_EVENT.MASCOT_DRAG_VERY_LARGE]: {
    mode: 'transient',
    state: VISIT_MASCOT_STATE.RUNNING,
    durationMs: 1000,
  },
  [VISIT_MASCOT_INTERACTION_EVENT.MASCOT_DRAG_LARGE]: {
    mode: 'transient',
    state: VISIT_MASCOT_STATE.SURPRISE,
    durationMs: 900,
  },
  [VISIT_MASCOT_INTERACTION_EVENT.MARKER_MARKED_SEEN]: {
    mode: 'transient',
    state: VISIT_MASCOT_STATE.CELEBRATE,
    durationMs: 1450,
  },
  [VISIT_MASCOT_INTERACTION_EVENT.MARKER_MARKED_SEEN_HAPPY]: { mode: 'happy' },
  [VISIT_MASCOT_INTERACTION_EVENT.MAP_READ_OPEN]: {
    mode: 'transient',
    state: VISIT_MASCOT_STATE.MAP_READ,
    durationMs: 1200,
  },
  [VISIT_MASCOT_INTERACTION_EVENT.MARKER_INSPECT_OPEN]: {
    mode: 'transient',
    state: VISIT_MASCOT_STATE.INSPECT,
    durationMs: 1200,
  },
});
