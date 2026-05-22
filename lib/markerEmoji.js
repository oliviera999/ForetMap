/** Colonne `map_markers.emoji` / `visit_markers.emoji` : VARCHAR(16). */
const MAP_MARKER_EMOJI_MAX_LEN = 16;

/**
 * Normalise l’emoji d’un repère carte / visite.
 * @param {unknown} value
 * @param {{ fallback?: string, allowEmpty?: boolean }} [opts]
 * @returns {string}
 */
function normalizeMarkerEmoji(value, opts = {}) {
  const { fallback = '🌱', allowEmpty = false } = opts;
  if (value === undefined || value === null) {
    return allowEmpty ? '' : fallback;
  }
  const s = String(value).trim();
  if (!s) {
    return allowEmpty ? '' : fallback;
  }
  return s.slice(0, MAP_MARKER_EMOJI_MAX_LEN);
}

module.exports = {
  MAP_MARKER_EMOJI_MAX_LEN,
  normalizeMarkerEmoji,
};
