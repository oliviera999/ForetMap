require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');

test('glLegacyMediaUrl — détection et alias plateau / scène', async () => {
  const {
    isLegacyGlMediaUrl,
    resolveLegacyGlStableKey,
    resolveGlBoardImageUrl,
    migrateStoryHeroToSceneRef,
  } = await import('../src/gl/utils/glLegacyMediaUrl.js');

  const legacyPlateau = '/uploads/media-library/image/gl-plateau-1-tropiques-africains.jpg';
  assert.strictEqual(isLegacyGlMediaUrl(legacyPlateau), true);
  assert.strictEqual(resolveLegacyGlStableKey(legacyPlateau), 'plateau-1_tropiques-africains');

  const legacyScene = '/uploads/media-library/image/gl-scene-ch2-epreuve-grise.png';
  assert.strictEqual(resolveLegacyGlStableKey(legacyScene), 'recit_02-chap2_la-grise-mediterranee');

  const board = resolveGlBoardImageUrl({
    mapImageUrl: legacyPlateau,
    conventionBoard: '/uploads/media-library/image/2026/06/board.jpg',
    conventionChapter: null,
    placeholderUrl: '/placeholder.svg',
  });
  assert.strictEqual(board, '/uploads/media-library/image/2026/06/board.jpg');

  const hero = '![Couverture](/uploads/media-library/image/gl-scene-ch3-silence-vent.png)\nTexte';
  assert.strictEqual(migrateStoryHeroToSceneRef(hero), '![Couverture](scene:1)\nTexte');
});

test('applyGlLegacyMediaRefs — réécrit les images biome legacy', async () => {
  const { applyGlLegacyMediaRefs } = await import('../src/gl/utils/glLegacyMediaUrl.js');
  const input = '![jungle](/uploads/media-library/image/gl-biome-jungle-afc-scene-liane.png)';
  const output = applyGlLegacyMediaRefs(input, (key) =>
    key === 'biome-realiste_jungle' ? '/uploads/media-library/image/2026/06/jungle.png' : null,
  );
  assert.match(output, /\/uploads\/media-library\/image\/2026\/06\/jungle\.png/);
});
