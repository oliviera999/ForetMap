/**
 * Logique pure du formulaire de repère du studio de carte de chapitre GL
 * (`GLChapterMapStudio`). Constante de formulaire vide + transformations
 * marqueur ⇄ formulaire ⇄ payload API, sans dépendance React.
 * Couvert par `tests-ui/gl/glChapterMapStudioForm.test.js`.
 */

import { defaultEventConfigForQuestion } from '../../utils/glMarkerEventConfig.js';
import { appearanceToPayload } from '../components/GLMarkerAppearanceEditor.jsx';

/** Formulaire de repère vide (valeurs par défaut). */
export const EMPTY_MARKER_FORM = {
  label: '',
  xPct: 50,
  yPct: 50,
  description: '',
  orderIndex: 0,
  sousBiomeSlug: '',
  effetMecanique: '',
};

/** Construit l'état de formulaire à partir d'un marqueur API. */
export function toFormFromMarker(marker) {
  if (!marker) return EMPTY_MARKER_FORM;
  return {
    label: marker.label || '',
    xPct: Number(marker.x_pct ?? 50),
    yPct: Number(marker.y_pct ?? 50),
    description: marker.description || '',
    orderIndex: Number(marker.order_index || 0),
    sousBiomeSlug: marker.sous_biome_slug || '',
    effetMecanique: marker.effet_mecanique || '',
  };
}

/** Construit le payload API à partir du formulaire, du brouillon d'événement et de l'apparence. */
export function toMarkerPayload(form, eventDraft, appearanceForm) {
  return {
    label: String(form.label || '').trim(),
    xPct: Number(form.xPct),
    yPct: Number(form.yPct),
    eventType: String(eventDraft?.eventType || 'question').trim(),
    description: String(form.description || '').trim(),
    orderIndex: Number(form.orderIndex) || 0,
    sousBiomeSlug: String(form.sousBiomeSlug || '').trim() || null,
    effetMecanique: String(form.effetMecanique || '').trim() || null,
    eventConfig: eventDraft?.eventConfig || defaultEventConfigForQuestion(),
    ...appearanceToPayload(appearanceForm),
  };
}
