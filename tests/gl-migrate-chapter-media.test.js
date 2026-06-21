'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const { initSchema, execute, queryOne } = require('../database');
const { loadMediaKeyIndex } = require('../lib/glAssetManifest');
const { resolveMediaByStableKey } = require('../lib/mediaLibrary');
const {
  isLegacyGlMediaUrl,
  resolveLegacyGlStableKey,
  applyGlLegacyMediaRefs,
  migrateStoryHeroToSceneRef,
} = require('../lib/glLegacyMediaUrl');

function resolveUrlFromKey(stableKey) {
  return resolveMediaByStableKey(stableKey)?.url || null;
}

function migrateMarkdownField(markdown) {
  let next = migrateStoryHeroToSceneRef(markdown);
  return applyGlLegacyMediaRefs(next, (stableKey) => resolveUrlFromKey(stableKey));
}

test('migration chapitre — map legacy NULL + story scene:1 + biome résolu', async () => {
  await initSchema();
  const slug = `test-gl-media-mig-${Date.now()}`;
  const legacyPlateau = '/uploads/media-library/image/gl-plateau-1-tropiques-africains.jpg';
  const legacyStory =
    '![Hero](/uploads/media-library/image/gl-scene-ch1-point-eau-tari.png)\n\nTexte';
  const legacyBiotope =
    '![jungle](/uploads/media-library/image/gl-biome-jungle-afc-scene-liane.png)';

  await execute(
    `INSERT INTO gl_chapters (slug, title, biome, map_image_url, story_markdown, biotope_markdown, order_index, plateau_number)
     VALUES (?, 'Test migration média', 'test', ?, ?, ?, 9999, 1)`,
    [slug, legacyPlateau, legacyStory, legacyBiotope],
  );

  const row = await queryOne(
    'SELECT id, map_image_url, story_markdown, biotope_markdown FROM gl_chapters WHERE slug = ?',
    [slug],
  );
  const knownKeys = Object.keys(loadMediaKeyIndex());

  const nextMap = isLegacyGlMediaUrl(row.map_image_url)
    ? resolveUrlFromKey(resolveLegacyGlStableKey(row.map_image_url, knownKeys))
    : row.map_image_url;
  const nextStory = migrateMarkdownField(row.story_markdown);
  const nextBiotope = migrateMarkdownField(row.biotope_markdown);

  assert.ok(isLegacyGlMediaUrl(legacyPlateau));
  assert.match(nextStory, /!\[Hero\]\(scene:1\)/);
  if (resolveUrlFromKey('plateau-1_tropiques-africains')) {
    assert.strictEqual(nextMap, resolveUrlFromKey('plateau-1_tropiques-africains'));
  }
  const jungleUrl = resolveUrlFromKey('biome-realiste_jungle');
  if (jungleUrl) {
    assert.ok(nextBiotope.includes(jungleUrl), `biotope attendu avec ${jungleUrl}`);
  }

  await execute('DELETE FROM gl_chapters WHERE slug = ?', [slug]);
});
