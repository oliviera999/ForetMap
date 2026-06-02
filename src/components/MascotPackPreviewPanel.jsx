import React from 'react';
import { VISIT_MASCOT_STATE } from '../utils/visitMascotState.js';
import { MascotPackSpriteCutPreview } from '../shared/mascot-pack/MascotPackSpriteCutPreview.jsx';

const STATE_OPTIONS = Object.values(VISIT_MASCOT_STATE).sort();

/**
 * Prévisualisation mascotte pack v1 après validation Zod.
 * @param {{ validated: { ok: true, pack: object, spriteCut: object } | null, title?: string }} props
 */
export default function MascotPackPreviewPanel({ validated, title = 'Prévisualisation' }) {
  return (
    <MascotPackSpriteCutPreview
      validated={validated}
      title={title}
      stateOptions={STATE_OPTIONS}
      defaultState={VISIT_MASCOT_STATE.IDLE}
    />
  );
}
