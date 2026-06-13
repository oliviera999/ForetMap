/**
 * Logique pure du modal de repère de carte (MarkerModal) — formulaire, payload,
 * dérivation des blocs image de visite. Extrait de `MarkerModal.jsx` (O6).
 */
import { MAP_MARKER_EMOJI_MAX_CHARS, clampEmojiInput } from '../constants/emojis';
import { orderedLivingBeingsForForm } from './livingBeings';
import { mergeDefaultVisitMediaImageBlocks, normalizeVisitEditorialBlocksForSave, parseVisitEditorialBlocksFromJson } from './visitEditorialBlocks.js';

/**
 * Construit l'objet de formulaire à partir d'un repère.
 * `defaultEmoji` : valeur d'emoji par défaut quand le repère n'en a pas (init vs. reset).
 */
export function markerFormFromMarker(marker, { defaultEmoji = '' } = {}) {
  const m = marker || {};
  // Init (sans defaultEmoji) : emoji trimé, repli ''. Reset (avec defaultEmoji) : `emoji || defaultEmoji`,
  // sans trim — comportement historique distinct entre l'init du useState et l'effet de réinitialisation.
  const emoji = defaultEmoji ? (m.emoji || defaultEmoji) : String(m.emoji ?? '').trim();
  return {
    label: m.label || '',
    living_beings: orderedLivingBeingsForForm(m.living_beings_list || m.living_beings, m.plant_name),
    note: m.note || '',
    emoji,
    visit_subtitle: m.visit_subtitle || '',
    visit_short_description: m.visit_short_description || '',
    visit_details_title: m.visit_details_title || 'Détails',
    visit_details_text: m.visit_details_text || '',
  };
}

/** Carte effective d'une tâche (champs résolus puis legacy). */
export function markerTaskMapId(t) {
  if (!t) return null;
  return t.map_id_resolved || t.map_id || t.zone_map_id || t.marker_map_id || null;
}

/** Payload de sauvegarde du repère (fusion marker + form + blocs éditoriaux normalisés). */
export function buildMarkerPayload(marker, form, visitEditorialBlocks) {
  const emojiVal = clampEmojiInput((form.emoji || '').trim(), MAP_MARKER_EMOJI_MAX_CHARS);
  return {
    ...marker,
    ...form,
    emoji: emojiVal,
    living_beings: form.living_beings,
    plant_name: '',
    visit_subtitle: form.visit_subtitle,
    visit_short_description: form.visit_short_description,
    visit_details_title: form.visit_details_title,
    visit_details_text: form.visit_details_text,
    visit_editorial_blocks: normalizeVisitEditorialBlocksForSave(visitEditorialBlocks),
  };
}

/**
 * Dérive les blocs image de visite affichés/éditables à partir du JSON brut du repère
 * et des médias disponibles. Reproduit la logique de l'effet du modal.
 */
export function computeMarkerVisitImageBlocks(visitBodyJson, visitMediaOptions) {
  const fromJson = parseVisitEditorialBlocksFromJson(visitBodyJson);
  const trimmedBody = visitBodyJson == null ? '' : String(visitBodyJson).trim();
  const imageBlocksFromJson = fromJson.filter((b) => b.type === 'image');
  const media = visitMediaOptions || [];
  if (!trimmedBody) {
    return media
      .map((m, i) => {
        const mediaId = Number(m?.id);
        if (!Number.isFinite(mediaId) || mediaId <= 0) return null;
        return {
          id: `default-img-${mediaId}`,
          type: 'image',
          media_ids: [mediaId],
          layout: 'single',
          size: i === 0 ? 'lg' : 'md',
          align: 'center',
          caption: String(m?.caption || '').trim(),
        };
      })
      .filter(Boolean);
  }
  const hasImageBlock = imageBlocksFromJson.length > 0;
  if (!hasImageBlock && media.length > 0) {
    return mergeDefaultVisitMediaImageBlocks(imageBlocksFromJson, media).filter((b) => b.type === 'image');
  }
  return imageBlocksFromJson;
}
