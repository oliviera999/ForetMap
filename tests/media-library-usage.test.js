'use strict';

// Tests du cœur pur du scanner d'usage (sans base de données).

const { test } = require('node:test');
const assert = require('node:assert');
const {
  extractMediaUrlRefs,
  extractIntroSlugRefs,
  buildItemLookup,
  resolveRef,
  collectUsageFromRows,
  usageMapToObject,
  buildSelectColumns,
  GL_SOURCES,
} = require('../lib/mediaLibraryUsage');

const ITEMS = [
  { relativePath: 'media-library/image/2026/06/aaa.png', stableKey: 'embleme_foret' },
  { relativePath: 'media-library/image/2026/06/bbb.png', stableKey: 'intro_01_la-boite' },
  { relativePath: 'media-library/audio/2026/06/ccc.mp3', stableKey: 'intro_audio_loop' },
  { relativePath: 'media-library/image/2026/06/ddd.png', stableKey: 'unused_one' },
];

function glSource(table) {
  return GL_SOURCES.find((s) => s.table === table);
}

test('extractMediaUrlRefs trouve les URLs média-library dans markdown et JSON', () => {
  assert.deepStrictEqual(
    extractMediaUrlRefs('Voir ![x](/uploads/media-library/image/2026/06/aaa.png) et fin'),
    ['media-library/image/2026/06/aaa.png']
  );
  assert.deepStrictEqual(
    extractMediaUrlRefs('[{"url":"/uploads/media-library/image/2026/06/bbb.png"}]'),
    ['media-library/image/2026/06/bbb.png']
  );
  assert.deepStrictEqual(extractMediaUrlRefs('aucune image ici'), []);
  assert.deepStrictEqual(extractMediaUrlRefs(null), []);
});

test('extractIntroSlugRefs extrait les clés de scènes et audio', () => {
  const value = JSON.stringify({
    scenes: [{ id: 'boite', imageKey: 'GL_intro_01_la-boite' }, { id: 'seuil', imageKey: '' }],
    audio: { loopKey: 'GL_intro_audio_loop', finalKey: '' },
  });
  assert.deepStrictEqual(extractIntroSlugRefs(value), [
    { slug: 'GL_intro_01_la-boite', field: 'scène boite' },
    { slug: 'GL_intro_audio_loop', field: 'audio (boucle)' },
  ]);
  assert.deepStrictEqual(extractIntroSlugRefs('json invalide {'), []);
});

test('resolveRef apparie URL et slug (avec normalisation GL_)', () => {
  const lookup = buildItemLookup(ITEMS);
  assert.strictEqual(
    resolveRef(lookup, { kind: 'url', value: 'media-library/image/2026/06/aaa.png' }),
    'media-library/image/2026/06/aaa.png'
  );
  // slug stocké en config = GL_intro_01_la-boite → clé stable = intro_01_la-boite
  assert.strictEqual(
    resolveRef(lookup, { kind: 'slug', value: 'GL_intro_01_la-boite' }),
    'media-library/image/2026/06/bbb.png'
  );
  assert.strictEqual(resolveRef(lookup, { kind: 'url', value: 'media-library/inconnu.png' }), null);
});

test('collectUsageFromRows — gl_chapters (URL directe + markdown)', () => {
  const lookup = buildItemLookup(ITEMS);
  const usageMap = new Map();
  const columns = new Set(['id', 'title', 'map_image_url', 'story_markdown']);
  const rows = [
    {
      id: 7,
      title: 'Forêt',
      map_image_url: '/uploads/media-library/image/2026/06/aaa.png',
      story_markdown: 'récit ![y](/uploads/media-library/image/2026/06/bbb.png)',
    },
  ];
  collectUsageFromRows({ source: glSource('gl_chapters'), rows, columns, app: 'gl', lookup }, usageMap);
  const usage = usageMapToObject(usageMap);

  const aaa = usage['media-library/image/2026/06/aaa.png'];
  assert.strictEqual(aaa.count, 1);
  assert.deepStrictEqual(aaa.locations[0], {
    app: 'gl', kind: 'Chapitre', label: 'Forêt', field: 'image de carte', id: 7,
  });
  assert.strictEqual(usage['media-library/image/2026/06/bbb.png'].locations[0].field, 'récit');
});

test('collectUsageFromRows — gl_settings intro (slugs)', () => {
  const lookup = buildItemLookup(ITEMS);
  const usageMap = new Map();
  const columns = new Set(['key', 'value_json']);
  const rows = [
    {
      key: 'content.intro',
      value_json: JSON.stringify({
        scenes: [{ id: 'boite', imageKey: 'GL_intro_01_la-boite' }],
        audio: { loopKey: 'GL_intro_audio_loop' },
      }),
    },
    { key: 'modules', value_json: '{"intro_enabled":true}' },
  ];
  collectUsageFromRows({ source: glSource('gl_settings'), rows, columns, app: 'gl', lookup }, usageMap);
  const usage = usageMapToObject(usageMap);

  assert.strictEqual(usage['media-library/image/2026/06/bbb.png'].locations[0].kind, 'Intro / réglages');
  assert.strictEqual(usage['media-library/audio/2026/06/ccc.mp3'].count, 1);
  // média non référencé : absent de l'index
  assert.strictEqual(usage['media-library/image/2026/06/ddd.png'], undefined);
});

test('collectUsageFromRows déduplique les emplacements identiques', () => {
  const lookup = buildItemLookup(ITEMS);
  const usageMap = new Map();
  const columns = new Set(['id', 'title', 'map_image_url']);
  const rows = [
    { id: 1, title: 'A', map_image_url: '/uploads/media-library/image/2026/06/aaa.png' },
    { id: 1, title: 'A', map_image_url: '/uploads/media-library/image/2026/06/aaa.png' },
  ];
  collectUsageFromRows({ source: glSource('gl_chapters'), rows, columns, app: 'gl', lookup }, usageMap);
  assert.strictEqual(usageMapToObject(usageMap)['media-library/image/2026/06/aaa.png'].count, 1);
});

test('buildSelectColumns ne sélectionne que les colonnes présentes', () => {
  const cols = new Set(['id', 'title', 'map_image_url']); // sans story_markdown ni theme_json
  const selected = buildSelectColumns(glSource('gl_chapters'), cols);
  assert.deepStrictEqual(selected, ['id', 'title', 'map_image_url']);
});
