export const EMOJI_CATEGORIES = {
  biodiversite: [
    '🌱', '🌿', '🍃', '🌾', '🌳', '🌲', '🌸', '🌺', '🍄', '🐝', '🦋', '🐞', '🪱', '🕷️',
    '🥬', '🥕', '🍅', '🫑', '🥒', '🍓', '🍋', '🍊', '🫘', '🌰', '🧅', '🧄', '🫚', '🪨', '💧',
  ],
  techno: [
    '⚙️', '🔧', '🔩', '🧲', '🔌', '💡', '🔋', '🔬', '💻', '🖥️', '🖨️', '📡', '🤖', '🛰️',
  ],
  ecole: [
    '📚', '📖', '📘', '📝', '📒', '📐', '📏', '🧮', '🏫', '👩‍🏫', '👨‍🏫', '🪑', '🧪', '🧫',
  ],
};

export const MARKER_EMOJIS = [...new Set([
  ...EMOJI_CATEGORIES.biodiversite,
  ...EMOJI_CATEGORIES.techno,
  ...EMOJI_CATEGORIES.ecole,
  '🏠', '⚠️',
])];

export const PLANT_EMOJIS = [...new Set([
  ...EMOJI_CATEGORIES.biodiversite,
  '🍆', '🥔',
])];
