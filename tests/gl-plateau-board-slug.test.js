require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');

test('resolvePlateauBoardSlug — préfixe plateau-N_* (prod)', async () => {
  const { resolvePlateauBoardSlug } = await import('../src/gl/utils/resolvePlateauBoardSlug.js');
  const prodKeys = [
    'plateau-1_tropiques-africains',
    'plateau-2_sahara-mediterranee',
    'plateau-2_sahara-mediterranee_variante',
    'plateau-3_forets-landes-atlantiques',
    'plateau-4_taiga-desert_froid',
    'plateau-5_toundra-arctique',
  ];

  assert.strictEqual(resolvePlateauBoardSlug(1, prodKeys), 'plateau-1_tropiques-africains');
  assert.strictEqual(resolvePlateauBoardSlug(2, prodKeys), 'plateau-2_sahara-mediterranee');
  assert.strictEqual(resolvePlateauBoardSlug(3, prodKeys), 'plateau-3_forets-landes-atlantiques');
  assert.strictEqual(resolvePlateauBoardSlug(4, prodKeys), 'plateau-4_taiga-desert_froid');
  assert.strictEqual(resolvePlateauBoardSlug(5, prodKeys), 'plateau-5_toundra-arctique');
});

test('resolvePlateauBoardSlug — ignore les clés audio du même plateau', async () => {
  const { resolvePlateauBoardSlug } = await import('../src/gl/utils/resolvePlateauBoardSlug.js');
  const keys = ['plateau-1_jungle', 'plateau-1_tropiques-africains'];
  const index = {
    'plateau-1_jungle': { relativePath: 'media-library/audio/2026/06/a.mp3' },
    'plateau-1_tropiques-africains': { relativePath: 'media-library/image/2026/06/b.jpg' },
  };
  assert.strictEqual(resolvePlateauBoardSlug(1, keys, index), 'plateau-1_tropiques-africains');
});

test('resolvePlateauBoardSlug — préfère plateau-N_fond si présent', async () => {
  const { resolvePlateauBoardSlug } = await import('../src/gl/utils/resolvePlateauBoardSlug.js');
  const keys = ['plateau-1_tropiques-africains', 'plateau-1_fond'];
  const index = {
    'plateau-1_tropiques-africains': { relativePath: 'media-library/image/2026/06/a.jpg' },
    'plateau-1_fond': { relativePath: 'media-library/image/2026/06/fond.jpg' },
  };
  assert.strictEqual(resolvePlateauBoardSlug(1, keys, index), 'plateau-1_fond');
});
