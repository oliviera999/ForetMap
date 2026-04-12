const test = require('node:test');
const assert = require('node:assert');

test('couverture emoji UI (constantes + chaîne unique)', async () => {
  const { buildEmojiFontCoverageString, FORETMAP_UI_EMOJI_EXTRAS } = await import('../src/constants/emojiFontCoverage.js');
  assert.ok(Array.isArray(FORETMAP_UI_EMOJI_EXTRAS));
  assert.ok(FORETMAP_UI_EMOJI_EXTRAS.includes('🪜'), 'badges difficulté moyenne');
  const s = buildEmojiFontCoverageString();
  assert.ok(s.includes('🪜'));
  assert.ok(s.includes('🌱'));
  assert.ok(s.length > 50);
});
