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
    .filter(Boolean)
    .filter((item) => item.length <= 16);
  const unique = [...new Set(tokens)];
  return unique.length > 0 ? unique : [...fallback];
}

export const MARKER_EMOJIS_DEFAULT_SETTING = MARKER_EMOJIS.join(' ');
