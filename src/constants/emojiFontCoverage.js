/**
 * Emojis d’interface hors catalogue repères (`MARKER_EMOJIS`) : badges tâches,
 * libellés carte/tâches/visite, progression. Documente la couverture attendue
 * du fichier `public/fonts/noto-color-emoji.woff2` (Noto Color Emoji complet).
 */
import { MARKER_EMOJIS } from './emojis.js';

export const FORETMAP_UI_EMOJI_EXTRAS = [
  '💾', '📷', '🧭', '📘', '✅', '🔴', '✨', '📁', '📸', '🔍', '✏️', '📋',
  '🪜', '🧗', '⛰️', '⏫', '🎯', '🛡️', '🔸', '🚨', '🚦', '👤', '🌐', '📗', '📖', '🔎', '🧩', '🔗', '📄',
  '🙋', '⏸️', '🔄', '🌍', '🏡', '○', '◔', '◕', '📅', '📍', '🏆',
];

/** Chaîne unique de graphemes (tests / futur outil de subset). */
export function buildEmojiFontCoverageString() {
  return [...new Set([...MARKER_EMOJIS, ...FORETMAP_UI_EMOJI_EXTRAS])].join('');
}
