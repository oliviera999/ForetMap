/**
 * Logique pure du formulaire de repère du studio de carte de chapitre GL
 * (`GLChapterMapStudio`). Constante de formulaire vide + transformations
 * marqueur ⇄ formulaire ⇄ payload API, sans dépendance React.
 * Couvert par `tests-ui/gl/glChapterMapStudioForm.test.js`.
 */

import { defaultEventConfigForQuestion } from './glMarkerEventConfig.js';
import {
  appearanceFormFromMarker,
  appearanceToPayload,
} from '../components/GLMarkerAppearanceEditor.jsx';
import { duplicateMapLabel, offsetPctCoordinate } from './glMapDuplicate.js';
import { resolveBiome, SOUS_BIOME_TRANSITION } from '../data/biomes.registry.js';

/**
 * Suggestions du champ « Sous-biome » d'un repère : les biomes du chapitre, leurs variantes
 * de saison (`toundra_ete`, `toundra_hiver` : la musique de plateau en tire le jour ou la
 * nuit polaire) et `transition` (case-charnière entre deux biomes).
 */
export function sousBiomeSlugOptions(chapterBiomes = []) {
  const options = [];
  const seen = new Set();
  const push = (value, label) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    options.push({ value, label });
  };
  for (const biome of Array.isArray(chapterBiomes) ? chapterBiomes : []) {
    const slug = String(biome?.slug || '').trim();
    if (!slug) continue;
    const name = biome.nom || slug;
    push(slug, name);
    if (resolveBiome(slug)?.saison) {
      push(`${slug}_ete`, `${name} — été`);
      push(`${slug}_hiver`, `${name} — hiver / nuit polaire`);
    }
  }
  push(SOUS_BIOME_TRANSITION, 'Case-charnière (aucun biome propre)');
  return options;
}

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

/** Brouillon d'événement à partir d'un marqueur API. */
export function eventDraftFromMarker(marker) {
  if (!marker) {
    return { eventType: 'question', eventConfig: defaultEventConfigForQuestion() };
  }
  return {
    eventType: marker.event_type ?? marker.eventType ?? 'question',
    eventConfig: marker.event_config ?? marker.eventConfig ?? defaultEventConfigForQuestion(),
  };
}

/** Payload POST pour dupliquer un repère (label « (copie) », position décalée). */
export function markerDuplicatePayloadFromMarker(marker, { offset } = {}) {
  if (!marker) return null;
  const form = toFormFromMarker(marker);
  form.label = duplicateMapLabel(form.label);
  form.xPct = offsetPctCoordinate(form.xPct, offset);
  form.yPct = offsetPctCoordinate(form.yPct, offset);
  return toMarkerPayload(form, eventDraftFromMarker(marker), appearanceFormFromMarker(marker));
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
