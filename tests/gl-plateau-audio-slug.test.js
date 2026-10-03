require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');

test('resolvePlateauAudioSlug — mapping prod', async () => {
  const { resolvePlateauAudioSlug, inferSaisonFromBiomeSlug } =
    await import('../src/gl/utils/resolvePlateauAudioSlug.js');
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
  assert.strictEqual(
    resolvePlateauAudioSlug(2, 'foret_mediterraneenne', null, keys),
    'plateau-2_mediterranee',
  );
  assert.strictEqual(
    resolvePlateauAudioSlug(4, 'desert_froid', null, keys),
    'plateau-4_desert-froid',
  );
  assert.strictEqual(resolvePlateauAudioSlug(5, 'taiga', null, keys), 'plateau-5_taiga');
  assert.strictEqual(
    resolvePlateauAudioSlug(5, 'toundra', 'hiver', keys),
    'plateau-5_toundra-nuit',
  );
  assert.strictEqual(
    resolvePlateauAudioSlug(5, 'toundra-hiver', null, keys),
    'plateau-5_toundra-nuit',
  );
  assert.strictEqual(inferSaisonFromBiomeSlug('toundra-ete'), 'ete');
});

const PROD_AUDIO_KEYS = [
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

test('resolvePlateauAudioSlug — année en 4 plateaux : la piste suit le biome joué', async () => {
  const { resolvePlateauAudioSlug } = await import('../src/gl/utils/resolvePlateauAudioSlug.js');
  const k = PROD_AUDIO_KEYS;
  // Plateau 1 : jungle_afc / savane.
  assert.strictEqual(resolvePlateauAudioSlug(1, 'jungle_afc', null, k), 'plateau-1_jungle');
  assert.strictEqual(resolvePlateauAudioSlug(1, 'savane', null, k), 'plateau-2_savane');
  assert.strictEqual(resolvePlateauAudioSlug(1, null, null, k), 'plateau-1_jungle');
  // Plateau 2 : sahara / forêt méditerranéenne.
  assert.strictEqual(resolvePlateauAudioSlug(2, 'sahara', null, k), 'plateau-1_desert-chaud');
  assert.strictEqual(
    resolvePlateauAudioSlug(2, 'foret_mediterraneenne', null, k),
    'plateau-2_mediterranee',
  );
  assert.strictEqual(resolvePlateauAudioSlug(2, null, null, k), 'plateau-1_desert-chaud');
  // Plateau 3 : forêt caducifoliée / landes.
  assert.strictEqual(
    resolvePlateauAudioSlug(3, 'foret_caducifoliee', null, k),
    'plateau-4_foret-caducifoliee',
  );
  assert.strictEqual(resolvePlateauAudioSlug(3, 'landes', null, k), 'plateau-3_landes');
  assert.strictEqual(resolvePlateauAudioSlug(3, null, null, k), 'plateau-4_foret-caducifoliee');
  // Plateau 4 : taïga, puis toundra de jour, puis nuit polaire (sous-biomes de case).
  assert.strictEqual(resolvePlateauAudioSlug(4, 'taiga', null, k), 'plateau-5_taiga');
  assert.strictEqual(resolvePlateauAudioSlug(4, 'toundra_ete', null, k), 'plateau-5_toundra-jour');
  assert.strictEqual(resolvePlateauAudioSlug(4, 'toundra', null, k), 'plateau-5_toundra-jour');
  assert.strictEqual(
    resolvePlateauAudioSlug(4, 'toundra_hiver', null, k),
    'plateau-5_toundra-nuit',
  );
  assert.strictEqual(resolvePlateauAudioSlug(4, 'transition', null, k), 'plateau-5_taiga');
  assert.strictEqual(resolvePlateauAudioSlug(4, null, null, k), 'plateau-5_taiga');
});

test('resolvePlateauAudioSlug — une image de plateau ne devient jamais une musique', async () => {
  const { resolvePlateauAudioSlug } = await import('../src/gl/utils/resolvePlateauAudioSlug.js');
  // Pistes attendues absentes : le repli par préfixe ne doit retenir que de l'audio.
  const keys = ['plateau-4_fond', 'plateau-4_desert-froid'];
  const index = {
    'plateau-4_fond': { relativePath: 'media-library/image/2026/10/fond.png' },
    'plateau-4_desert-froid': { relativePath: 'media-library/audio/2026/06/d.mp3' },
  };
  assert.strictEqual(
    resolvePlateauAudioSlug(4, 'taiga', null, keys, index),
    'plateau-4_desert-froid',
  );
  assert.strictEqual(
    resolvePlateauAudioSlug(4, 'taiga', null, ['plateau-4_fond'], {
      'plateau-4_fond': index['plateau-4_fond'],
    }),
    null,
  );
});
