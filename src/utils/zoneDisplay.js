/**
 * Emoji et titre d'affichage d'une zone — colonne dédiée `zones.emoji` (audit C4)
 * en source de vérité, repli sur l'ancien préfixe du nom pour les lignes non migrées.
 */
import {
  MARKER_EMOJIS,
  detectLeadingMarkerEmoji,
  stripLeadingMarkerEmoji,
} from '../constants/emojis';

/** @returns {string} emoji de la zone ('' si aucun). */
export function zoneEmojiOf(zone, emojiParsingList = MARKER_EMOJIS) {
  const fromColumn = String(zone?.emoji || '').trim();
  if (fromColumn) return fromColumn;
  return detectLeadingMarkerEmoji(zone?.name || '', emojiParsingList) || '';
}

/** @returns {string} titre de la zone sans préfixe emoji. */
export function zoneTitleOf(zone, emojiParsingList = MARKER_EMOJIS) {
  const name = String(zone?.name || '');
  return stripLeadingMarkerEmoji(name, emojiParsingList) || name;
}
