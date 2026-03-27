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

export const PLANT_EMOJIS = [...new Set([
  ...EMOJI_CATEGORIES.biodiversite,
  '🍆', '🥔',
])];

export const MARKER_EMOJIS = [...new Set([
  ...PLANT_EMOJIS,
  ...EMOJI_CATEGORIES.techno,
  ...EMOJI_CATEGORIES.ecole,
  '🏠', '⚠️',
])];
