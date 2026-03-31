export const EMOJI_CATEGORIES = {
  biodiversite: [
    '🌱', '🌿', '🍃', '🌾', '🌳', '🌲', '🌸', '🌺', '🍄', '🐝', '🦋', '🐞', '🪱', '🕷️',
    '🥬', '🥕', '🍅', '🫑', '🥒', '🍓', '🍋', '🍊', '🫘', '🌰', '🧅', '🧄', '🫚', '🍆', '🥔',
    '🌼', '🌻', '🌷', '🪻', '🌹', '🪴', '🌴', '🌵', '🌊', '🦔', '🐌', '🐛', '🐜', '🐦', '🕊️',
    '🐸', '🦎', '🐢', '🪺', '🪹', '🦗', '🦟', '🦂', '🪲', '🐾', '🪨', '💧',
  ],
  techno: [
    '⚙️', '🔧', '🔩', '🧲', '🔌', '💡', '🔋', '🔬', '💻', '🖥️', '🖨️', '📡', '🤖', '🛰️',
  ],
  ecole: [
    '📚', '📖', '📘', '📝', '📒', '📐', '📏', '🧮', '🏫', '👩‍🏫', '👨‍🏫', '🪑', '🧪', '🧫',
  ],
  terrain: [
    '📍', '🧭', '🗺️', '🏡', '🏠', '🚰', '🪣', '🌦️', '☀️', '🌧️', '🌬️', '🔥', '♻️', '⚠️',
    '🪵', '🧱', '🛠️', '🚜',
  ],
};

export const PLANT_EMOJIS = [...new Set([
  ...EMOJI_CATEGORIES.biodiversite,
  '🍆', '🥔',
])];

export const MARKER_EMOJIS = [...new Set([
  ...PLANT_EMOJIS,
  ...EMOJI_CATEGORIES.techno,
  ...EMOJI_CATEGORIES.ecole,
  ...EMOJI_CATEGORIES.terrain,
])];

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

export const MARKER_EMOJIS_DEFAULT_SETTING = MARKER_EMOJIS.join(' ');

/** Aligné sur `map_markers.emoji` (VARCHAR 16). */
export const MAP_MARKER_EMOJI_MAX_CHARS = 16;

/** Préfixe emoji dans `zones.name` : limite raisonnable (nom de zone total ≤ 255). */
export const ZONE_NAME_PREFIX_EMOJI_MAX_CHARS = 32;

function sortEmojisByLengthDesc(emojis) {
  return [...emojis].sort((a, b) => String(b).length - String(a).length);
}

/**
 * Extrait un préfixe emoji en tête (séquence + fin de chaîne ou espace puis suite).
 * Utilise Intl.Segmenter lorsqu'il est disponible.
 */
export function extractLeadingEmojiPrefix(str) {
  const raw = String(str || '').trimStart();
  if (!raw) return null;

  const hasValidBoundary = (prefixLen) => raw.length === prefixLen || raw[prefixLen] === ' ';

  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const seg = new Intl.Segmenter('fr', { granularity: 'grapheme' });
    let acc = '';
    let seenPictographic = false;
    for (const { segment } of seg.segment(raw)) {
      if (segment === ' ') {
        if (seenPictographic && acc.length > 0 && hasValidBoundary(acc.length)) return acc;
        return null;
      }
      const isZWJ = segment === '\u200D';
      const isVS = segment === '\uFE0F';
      const isSkin = /^[\u{1F3FB}-\u{1F3FF}]$/u.test(segment);
      const isPic = /\p{Extended_Pictographic}/u.test(segment);
      if (isPic || (seenPictographic && (isZWJ || isVS || isSkin))) {
        acc += segment;
        if (isPic) seenPictographic = true;
        continue;
      }
      break;
    }
    if (acc && seenPictographic && hasValidBoundary(acc.length)) return acc;
    return null;
  }

  const m = raw.match(/^\p{Extended_Pictographic}/u);
  if (!m) return null;
  const first = m[0];
  if (hasValidBoundary(first.length)) return first;
  return null;
}

/** Emoji en tête du nom de zone : liste connue (ordre longueur décroissante) puis emoji libre. */
export function detectLeadingMarkerEmoji(value, emojis = MARKER_EMOJIS) {
  const raw = String(value || '').trim();
  const sorted = sortEmojisByLengthDesc(emojis);
  const fromList = sorted.find((emoji) => raw === emoji || raw.startsWith(`${emoji} `));
  if (fromList) return fromList;
  return extractLeadingEmojiPrefix(raw);
}

export function stripLeadingMarkerEmoji(value, emojis = MARKER_EMOJIS) {
  const raw = String(value || '').trim();
  const sorted = sortEmojisByLengthDesc(emojis);
  for (const emoji of sorted) {
    if (raw === emoji) return '';
    if (raw.startsWith(`${emoji} `)) return raw.slice(emoji.length).trimStart();
  }
  const ext = extractLeadingEmojiPrefix(raw);
  if (ext && (raw === ext || raw.startsWith(`${ext} `))) {
    return raw === ext ? '' : raw.slice(ext.length).trimStart();
  }
  return raw;
}

/** Valeur saisie / collée pour champ emoji (troncature). */
export function clampEmojiInput(value, maxChars) {
  return String(value ?? '').slice(0, Math.max(0, Number(maxChars) || 0));
}
