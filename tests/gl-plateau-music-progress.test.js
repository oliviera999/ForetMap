'use strict';

// Musique de plateau commune à la partie : biome de la case la plus avancée jamais atteinte
// (src/gl/utils/glPlateauMusicProgress.js). Plateau 4 fusionné : taïga → été → nuit polaire,
// la nuit étant irréversible dès qu'une équipe a atteint la première case `toundra_hiver`.
require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');

const loadModule = () => import('../src/gl/utils/glPlateauMusicProgress.js');

// Chemin réduit du plateau 4 : 3 cases de taïga, la charnière, 2 d'été, 2 de nuit.
const MARKERS = [
  { id: 101, order_index: 10, sous_biome_slug: 'taiga' },
  { id: 102, order_index: 20, sous_biome_slug: 'taiga' },
  { id: 103, order_index: 30, sous_biome_slug: 'taiga' },
  { id: 104, order_index: 40, sous_biome_slug: 'transition' },
  { id: 105, order_index: 50, sous_biome_slug: 'toundra_ete' },
  { id: 106, order_index: 60, sous_biome_slug: 'toundra_ete' },
  { id: 107, order_index: 70, sous_biome_slug: 'toundra_hiver' },
  { id: 108, order_index: 80, sous_biome_slug: 'toundra_hiver' },
];
const move = (teamId, markerId) => ({ eventType: 'move', teamId, payload: { markerId } });

test('la musique suit la case la plus avancée de toutes les équipes', async () => {
  const { resolvePlateauMusicBiomeSlug } = await loadModule();
  const state = (positions) => ({
    markers: MARKERS,
    teams: positions.map((markerId, i) => ({ id: i + 1, position_marker_id: markerId })),
    events: [],
  });
  assert.strictEqual(resolvePlateauMusicBiomeSlug(state([101, 102]), 'taiga'), 'taiga');
  // La charnière (`transition`) garde la musique de la taïga.
  assert.strictEqual(resolvePlateauMusicBiomeSlug(state([101, 104]), 'taiga'), 'taiga');
  assert.strictEqual(resolvePlateauMusicBiomeSlug(state([101, 105]), 'taiga'), 'toundra_ete');
  assert.strictEqual(resolvePlateauMusicBiomeSlug(state([107, 102]), 'taiga'), 'toundra_hiver');
});

test('la nuit polaire est irréversible : un recul ne la défait pas', async () => {
  const { resolvePlateauMusicBiomeSlug } = await loadModule();
  // L'équipe 1 a touché la nuit (107) puis a reculé de deux cases (105) : le journal s'en
  // souvient, la nuit reste.
  const gameState = {
    markers: MARKERS,
    teams: [
      { id: 1, position_marker_id: 105 },
      { id: 2, position_marker_id: 102 },
    ],
    events: [move(1, 103), move(1, 105), move(1, 107), move(1, 105), move(2, 102)],
  };
  assert.strictEqual(resolvePlateauMusicBiomeSlug(gameState, 'taiga'), 'toundra_hiver');
  // Forme brute (ligne SQL) acceptée aussi.
  assert.strictEqual(
    resolvePlateauMusicBiomeSlug(
      {
        markers: MARKERS,
        teams: [],
        events: [{ event_type: 'move', payload_json: JSON.stringify({ markerId: 108 }) }],
      },
      'taiga',
    ),
    'toundra_hiver',
  );
});

test('sans position ni sous-biome : biome du chapitre (comportement historique)', async () => {
  const { resolvePlateauMusicBiomeSlug, furthestReachedPathIndex } = await loadModule();
  assert.strictEqual(resolvePlateauMusicBiomeSlug({ markers: [], teams: [] }, 'savane'), 'savane');
  assert.strictEqual(
    resolvePlateauMusicBiomeSlug({ markers: MARKERS, teams: [], events: [] }, 'taiga'),
    'taiga',
  );
  const sansSousBiome = MARKERS.map((m) => ({ ...m, sous_biome_slug: null }));
  assert.strictEqual(
    resolvePlateauMusicBiomeSlug(
      { markers: sansSousBiome, teams: [{ id: 1, position_marker_id: 107 }] },
      'landes',
    ),
    'landes',
  );
  // Un repère d'un autre chapitre (journal d'un ancien chapitre) est ignoré.
  assert.strictEqual(furthestReachedPathIndex(MARKERS, [], [move(1, 999)]), null);
  assert.strictEqual(resolvePlateauMusicBiomeSlug(null, 'taiga'), 'taiga');
});
