import {
  detectLeadingEmojiPrefix,
  extractLeadingEmojiPrefix,
  stripLeadingEmojiPrefix,
} from '../shared/emojiPrefixCore.js';

export const EMOJI_CATEGORIES = {
  biodiversite: [
    '🌱',
    '🌿',
    '🍃',
    '🌾',
    '🌳',
    '🌲',
    '🌸',
    '🌺',
    '🍄',
    '🐝',
    '🦋',
    '🐞',
    '🪱',
    '🕷️',
    '🥬',
    '🥕',
    '🍅',
    '🫑',
    '🥒',
    '🍓',
    '🍋',
    '🍊',
    '🫘',
    '🌰',
    '🧅',
    '🧄',
    '🫚',
    '🍆',
    '🥔',
    '🌼',
    '🌻',
    '🌷',
    '🪻',
    '🌹',
    '🪴',
    '🌴',
    '🌵',
    '🌊',
    '🦔',
    '🐌',
    '🐛',
    '🐜',
    '🐦',
    '🕊️',
    '🐸',
    '🦎',
    '🐢',
    '🪺',
    '🪹',
    '🦗',
    '🦟',
    '🦂',
    '🪲',
    '🐾',
    '🪨',
    '💧',
  ],
  techno: ['⚙️', '🔧', '🔩', '🧲', '🔌', '💡', '🔋', '🔬', '💻', '🖥️', '🖨️', '📡', '🤖', '🛰️'],
  ecole: ['📚', '📖', '📘', '📝', '📒', '📐', '📏', '🧮', '🏫', '👩‍🏫', '👨‍🏫', '🪑', '🧪', '🧫'],
  terrain: [
    '📍',
    '🧭',
    '🗺️',
    '🏡',
    '🏠',
    '🚰',
    '🪣',
    '🌦️',
    '☀️',
    '🌧️',
    '🌬️',
    '🔥',
    '♻️',
    '⚠️',
    '🪵',
    '🧱',
    '🛠️',
    '🚜',
  ],
};

export const PLANT_EMOJIS = [...new Set([...EMOJI_CATEGORIES.biodiversite, '🍆', '🥔'])];

export const MARKER_EMOJIS = [
  ...new Set([
    ...PLANT_EMOJIS,
    ...EMOJI_CATEGORIES.techno,
    ...EMOJI_CATEGORIES.ecole,
    ...EMOJI_CATEGORIES.terrain,
  ]),
];

export function parseEmojiListSetting(rawValue, fallback = MARKER_EMOJIS) {
  const raw = String(rawValue || '').trim();
  if (!raw) return [...fallback];
  const tokens = raw
    .replace(/,/g, ' ')
    .split(/\s+/)
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return [...new Set([...fallback, ...tokens])];
}

/** Aligné sur `map_markers.emoji` (VARCHAR 16). */
export const MAP_MARKER_EMOJI_MAX_CHARS = 16;

/** Préfixe emoji dans `zones.name` : limite raisonnable (nom de zone total ≤ 255). */
export const ZONE_NAME_PREFIX_EMOJI_MAX_CHARS = 32;

/**
 * Emoji en tête d'un nom de zone / de repère : l'implémentation est partagée
 * (`src/shared/emojiPrefixCore.js`) pour que les produits sans dépendance à ForetMap — le
 * Plan Lyautey — l'utilisent sans importer ce catalogue. Ici, la liste `MARKER_EMOJIS` reste
 * la valeur par défaut, comportement historique inchangé.
 */
export { extractLeadingEmojiPrefix };

/** Emoji en tête du nom de zone : liste connue (ordre longueur décroissante) puis emoji libre. */
export function detectLeadingMarkerEmoji(value, emojis = MARKER_EMOJIS) {
  return detectLeadingEmojiPrefix(value, emojis);
}

export function stripLeadingMarkerEmoji(value, emojis = MARKER_EMOJIS) {
  return stripLeadingEmojiPrefix(value, emojis);
}

/**
 * Valeur saisie / collée pour champ emoji (troncature).
 * Coupe en POINTS DE CODE (comme le VARCHAR MySQL), jamais au milieu d'une paire de
 * substitution, et retire un éventuel liant (ZWJ) ou sélecteur orphelin en fin de coupe —
 * l'ancien `String.slice` (unités UTF-16) pouvait scinder une séquence 👩‍🏫 en deux glyphes.
 */
export function clampEmojiInput(value, maxChars) {
  const max = Math.max(0, Number(maxChars) || 0);
  const cps = Array.from(String(value ?? ''));
  let kept = cps.slice(0, max);
  while (kept.length > 0 && kept[kept.length - 1] === '\u200D') kept.pop();
  return kept.join('');
}
