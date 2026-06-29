/**
 * Réparation du mojibake emoji (plan Excel / ancien xlsx) : les glyphes hors BMP
 * (ex. 🌫️ U+1F32B, 🧵 U+1F9F5) ont parfois été stockés avec seulement les 16 bits
 * bas (U+F32B, U+F9F5…), ce qui affiche des caractères PUA incorrects.
 */

/** Emojis canoniques GL — cases Souffle / Trame sur le plateau. */
export const GL_SOUFFLE_EMOJI = '🌫️';
export const GL_TRAME_EMOJI = '🧵';

const SUPPLEMENTARY_PLANE_OFFSET = 0x10000;
const MOJIBAKE_LOW_MIN = 0xf000;
const MOJIBAKE_LOW_MAX = 0xffff;
const VARIATION_SELECTOR_MIN = 0xfe00;
const VARIATION_SELECTOR_MAX = 0xfe0f;
/** Artefact d'une réparation trop large de U+FE0F (sélecteur de présentation emoji). */
const MISREPAIRED_VARIATION_SELECTOR = 0x1fe0f;

function isRepairableEmojiMojibakeCodePoint(codePoint) {
  if (codePoint < MOJIBAKE_LOW_MIN || codePoint > MOJIBAKE_LOW_MAX) return false;
  if (codePoint >= VARIATION_SELECTOR_MIN && codePoint <= VARIATION_SELECTOR_MAX) return false;
  const full = codePoint + SUPPLEMENTARY_PLANE_OFFSET;
  return full >= 0x1f000 && full <= 0x1ffff;
}

/**
 * Répare une chaîne contenant des emojis tronqués (BMP PUA → plan supplémentaire).
 * @param {unknown} value
 * @returns {string}
 */
export function repairSupplementaryPlaneEmojiMojibake(value) {
  if (value == null) return '';
  const s = String(value);
  if (!s) return '';
  let out = '';
  for (let i = 0; i < s.length; ) {
    const codePoint = s.codePointAt(i);
    const charLen = codePoint > 0xffff ? 2 : 1;
    if (codePoint === MISREPAIRED_VARIATION_SELECTOR) {
      out += '\uFE0F';
      i += charLen;
      continue;
    }
    if (isRepairableEmojiMojibakeCodePoint(codePoint)) {
      out += String.fromCodePoint(codePoint + SUPPLEMENTARY_PLANE_OFFSET);
      i += charLen;
      if (i < s.length && s.codePointAt(i) === 0xfe0f) {
        out += '\uFE0F';
        i += 1;
      }
      continue;
    }
    out += String.fromCodePoint(codePoint);
    i += charLen;
  }
  return out;
}
