require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');

test('resolvePlateauAudioSlug — mapping prod', async () => {
  const { resolvePlateauAudioSlug, inferSaisonFromBiomeSlug } = await import('../src/gl/utils/resolvePlateauAudioSlug.js');
  const keys = [
    'plateau-1_jungle',
    'plateau-1_desert-chaud',
    'plateau-2_savane',
    'plateau-2_mediterranee',
    'plateau-3_landes',
    'plateau-4_foret-caducifoliee',
    'plateau-4_desert-froid',
    'plateau-5_taiga',
    'plateau-5_toundra-jour',
    'plateau-5_toundra-nuit',
  ];

  assert.strictEqual(resolvePlateauAudioSlug(1, 'jungle', null, keys), 'plateau-1_jungle');
  assert.strictEqual(resolvePlateauAudioSlug(1, 'sahara', null, keys), 'plateau-1_desert-chaud');
  assert.strictEqual(resolvePlateauAudioSlug(2, 'savane', null, keys), 'plateau-2_savane');
  assert.strictEqual(resolvePlateauAudioSlug(2, 'foret_mediterraneenne', null, keys), 'plateau-2_mediterranee');
  assert.strictEqual(resolvePlateauAudioSlug(4, 'desert_froid', null, keys), 'plateau-4_desert-froid');
  assert.strictEqual(resolvePlateauAudioSlug(5, 'taiga', null, keys), 'plateau-5_taiga');
  assert.strictEqual(resolvePlateauAudioSlug(5, 'toundra', 'hiver', keys), 'plateau-5_toundra-nuit');
  assert.strictEqual(resolvePlateauAudioSlug(5, 'toundra-hiver', null, keys), 'plateau-5_toundra-nuit');
  assert.strictEqual(inferSaisonFromBiomeSlug('toundra-ete'), 'ete');
});
