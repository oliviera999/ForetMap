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
 * Liste polling (`GET /api/zones`) : `has_visit_body` sans `visit_body_json`.
 * Tant que le détail n'est pas chargé, envoyer `visit_editorial_blocks` vides
 * (reconstruits depuis les photos) écraserait le corps visite en base.
 */
export function isZoneVisitBodyReadyForSave(listZone, detailZone) {
  if (!listZone?.has_visit_body) return true;
  const raw = detailZone?.visit_body_json ?? listZone?.visit_body_json;
  return raw != null && String(raw).trim() !== '';
}

/**
 * Fusionne un instantané de liste (sans `visit_body_json`) avec un détail déjà
 * chargé : ne pas replacer le corps visite par `undefined` à chaque poll.
 */
export function mergeZoneListIntoDetail(prevDetail, listZone) {
  if (!listZone) return prevDetail;
  const prevHasBody =
    prevDetail &&
    String(prevDetail.id) === String(listZone.id) &&
    prevDetail.visit_body_json != null &&
    String(prevDetail.visit_body_json).trim() !== '';
  const listLacksBody =
    listZone.visit_body_json == null || String(listZone.visit_body_json).trim() === '';
  if (prevHasBody && listLacksBody) {
    return { ...prevDetail, ...listZone, visit_body_json: prevDetail.visit_body_json };
  }
  return listZone;
}

/**
 * Payload de sauvegarde de la zone (champs de formulaire + blocs éditoriaux normalisés).
 * `name` est le nom complet déjà calculé par `buildZoneName`. `current_plant` est forcé vide
 * (l'édition passe désormais par `living_beings`). Le caractère « infrastructure » d'une zone
 * n'est plus un drapeau propre : il découle des catégories affectées (`category_ids`).
 *
 * `omitVisitEditorialBlocks` : ne pas envoyer la clé — le PUT conserve le `body_json`
 * existant (liste allégée / détail pas encore chargé).
 */
export function buildZonePayload(name, form, visitEditorialBlocks, options = {}) {
  const payload = {
    name,
    // Colonne dédiée `zones.emoji` (audit C4) — le nom garde son préfixe pour compat.
    emoji: clampEmojiInput((form.zoneEmoji || '').trim(), ZONE_NAME_PREFIX_EMOJI_MAX_CHARS),
    current_plant: '',
    living_beings: form.livingBeings,
    category_ids: form.categoryIds || [],
    color: form.zoneColor,
    description: form.desc,
    visit_subtitle: form.visitSubtitle,
    visit_short_description: form.visitShortDesc,
    visit_details_title: form.visitDetailsTitle,
    visit_details_text: form.visitDetailsText,
    visit_editorial_blocks: normalizeVisitEditorialBlocksForSave(visitEditorialBlocks),
  };
  if (options.omitVisitEditorialBlocks) {
    delete payload.visit_editorial_blocks;
  }
  return payload;
}
