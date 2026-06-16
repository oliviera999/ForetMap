/**
 * Logique pure du modal de zone de carte (ZoneInfoModal) — préfixe emoji du nom,
 * validation et payload de sauvegarde. Extrait de `ZoneInfoModal.jsx` (O6, 2e niveau).
 *
 * Les blocs image de visite et la carte effective d'une tâche réutilisent les helpers
 * mutualisés du modal frère MarkerModal (`markerModalForm.js`) : logique strictement
 * identique entre zone et repère.
 */
import {
  ZONE_NAME_PREFIX_EMOJI_MAX_CHARS,
  clampEmojiInput,
  stripLeadingMarkerEmoji,
} from '../constants/emojis';
import { normalizeVisitEditorialBlocksForSave } from './visitEditorialBlocks.js';

export {
  computeMarkerVisitImageBlocks as computeZoneVisitImageBlocks,
  markerTaskMapId as zoneTaskMapId,
} from './markerModalForm.js';

/**
 * Construit le nom complet de la zone (préfixe emoji + nom nettoyé) à enregistrer.
 * Renvoie `null` si le nom (sans emoji de tête) est vide → la sauvegarde doit être bloquée.
 * `emojiParsingList` sert à retirer un éventuel emoji déjà présent en tête du nom saisi.
 */
export function buildZoneName(
  zoneName,
  zoneEmoji,
  { markerEmojis = [], emojiParsingList = [] } = {},
) {
  const cleanName = stripLeadingMarkerEmoji(zoneName, emojiParsingList);
  if (!cleanName) return null;
  const prefixEmoji = clampEmojiInput(
    (zoneEmoji || '').trim() || markerEmojis[0] || '📍',
    ZONE_NAME_PREFIX_EMOJI_MAX_CHARS,
  );
  return `${prefixEmoji} ${cleanName}`.trim();
}

/**
 * Payload de sauvegarde de la zone (champs de formulaire + blocs éditoriaux normalisés).
 * `name` est le nom complet déjà calculé par `buildZoneName`. `current_plant` est forcé vide
 * (l'édition passe désormais par `living_beings`).
 */
export function buildZonePayload(name, form, visitEditorialBlocks) {
  return {
    name,
    current_plant: '',
    living_beings: form.livingBeings,
    stage: form.stage,
    color: form.zoneColor,
    description: form.desc,
    visit_subtitle: form.visitSubtitle,
    visit_short_description: form.visitShortDesc,
    visit_details_title: form.visitDetailsTitle,
    visit_details_text: form.visitDetailsText,
    visit_editorial_blocks: normalizeVisitEditorialBlocksForSave(visitEditorialBlocks),
  };
}
