'use strict';

// Tests purs (sans BDD) du moteur de composition d'équipes GL — lib/gl/teamComposition.js.
const { test } = require('node:test');
const assert = require('node:assert');
const {
  RECIPE_WEIGHTS,
  ENGINE_RECIPES,
  LOCK_VIOLATION_PENALTY,
  createSeededRng,
  seedFromLabel,
  generateSeedLabel,
  pairKey,
  targetSizeBounds,
  scoreComposition,
  computeComposition,
  summarizePairs,
} = require('../lib/gl/teamComposition');

const players = (n) => Array.from({ length: n }, (_, i) => ({ playerId: i + 1 }));
const flat = (slots) => slots.flat().sort((a, b) => a - b);

test('seedFromLabel est stable et createSeededRng déterministe', () => {
  assert.equal(seedFromLabel('brume-4172'), seedFromLabel('brume-4172'));
  assert.notEqual(seedFromLabel('brume-4172'), seedFromLabel('brume-4173'));
  const a = createSeededRng(seedFromLabel('x'));
  const b = createSeededRng(seedFromLabel('x'));
  for (let i = 0; i < 5; i += 1) assert.equal(a(), b());
  assert.match(generateSeedLabel(createSeededRng(3)), /^[a-z]+-\d{4}$/);
});

test('pairKey normalise l’ordre et targetSizeBounds encadre ⌊n/k⌋..⌈n/k⌉', () => {
  assert.equal(pairKey(7, 3), '3-7');
  assert.equal(pairKey(3, 7), '3-7');
  assert.deepEqual(targetSizeBounds(11, 3), { low: 3, high: 4 });
  assert.deepEqual(targetSizeBounds(8, 4), { low: 2, high: 2 });
});

test('recette random : tout le pool est placé, effectifs équilibrés, aucune itération', () => {
  const out = computeComposition({
    players: players(23),
    teamCount: 6,
    weights: RECIPE_WEIGHTS.random,
    rng: createSeededRng(11),
  });
  assert.equal(out.slots.length, 6);
  assert.deepEqual(
    flat(out.slots),
    players(23).map((p) => p.playerId),
  );
  const sizes = out.slots.map((s) => s.length);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `effectifs ${sizes}`);
  assert.equal(out.iterations, 0);
  assert.equal(out.cost, 0);
});

test('même graine ⇒ même composition ; graine différente ⇒ composition différente', () => {
  const run = (seed) =>
    computeComposition({
      players: players(16),
      teamCount: 4,
      weights: RECIPE_WEIGHTS.random,
      rng: createSeededRng(seedFromLabel(seed)),
    }).slots;
  assert.deepEqual(run('sente-1000'), run('sente-1000'));
  assert.notDeepEqual(run('sente-1000'), run('source-2000'));
});

test('random_memory sépare les paires déjà réunies quand c’est possible', () => {
  // 8 joueurs, 2 équipes : l'historique dit que 1-2-3-4 et 5-6-7-8 ont déjà joué ensemble.
  const history = new Map();
  for (const team of [
    [1, 2, 3, 4],
    [5, 6, 7, 8],
  ]) {
    for (let i = 0; i < 4; i += 1)
      for (let j = i + 1; j < 4; j += 1) history.set(pairKey(team[i], team[j]), 1);
  }
  const out = computeComposition({
    players: players(8),
    teamCount: 2,
    pairHistory: history,
    weights: RECIPE_WEIGHTS.random_memory,
    rng: createSeededRng(5),
  });
  const { repeatedPairs, newPairs } = summarizePairs(out.slots, history);
  // Optimum : 2 anciens + 2 nouveaux par équipe ⇒ 2 paires répétées par équipe = 4 au total.
  assert.equal(repeatedPairs, 4, `paires répétées ${repeatedPairs}`);
  assert.equal(newPairs, 8);
  assert.ok(out.improved >= 1);
  assert.deepEqual(flat(out.slots), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('la recherche locale ne dégrade jamais le coût et respecte la borne d’itérations', () => {
  const history = new Map();
  for (let i = 1; i <= 12; i += 1)
    for (let j = i + 1; j <= 12; j += 1) history.set(pairKey(i, j), ((i * j) % 5) / 5);
  const start = computeComposition({
    players: players(12),
    teamCount: 3,
    pairHistory: history,
    weights: RECIPE_WEIGHTS.random_memory,
    rng: createSeededRng(21),
    maxIterations: 1,
  });
  const full = computeComposition({
    players: players(12),
    teamCount: 3,
    pairHistory: history,
    weights: RECIPE_WEIGHTS.random_memory,
    rng: createSeededRng(21),
  });
  assert.ok(start.iterations <= 1);
  assert.ok(full.cost <= start.cost);
  assert.ok(full.iterations <= 2000);
});

test('scoreComposition : termes de profil (inter/intra/roles) et verrous', () => {
  const profiles = new Map([
    [1, { composite: 0.9, role: 'savant', hearts: 1, gems: 0 }],
    [2, { composite: 0.1, role: 'savant', hearts: 0, gems: 0 }],
    [3, { composite: 0.9, role: 'eclaireur', hearts: 1, gems: 1 }],
    [4, { composite: 0.1, role: 'gardien', hearts: 0, gems: 0 }],
  ]);
  const homogeneousSlots = [
    [1, 3],
    [2, 4],
  ];
  const mixedSlots = [
    [1, 2],
    [3, 4],
  ];
  const inter = { inter: 1 };
  assert.ok(
    scoreComposition({ slots: homogeneousSlots, profiles, weights: inter }).raw.inter >
      scoreComposition({ slots: mixedSlots, profiles, weights: inter }).raw.inter,
  );
  const intra = { intra: 1 };
  assert.ok(
    scoreComposition({ slots: mixedSlots, profiles, weights: intra }).raw.intra >
      scoreComposition({ slots: homogeneousSlots, profiles, weights: intra }).raw.intra,
  );
  // Rôles : [1,2] = 2 savants (1 rôle couvert sur 2 atteignables) ; [1,3] = 2 rôles.
  const roles = { roles: 1 };
  assert.equal(scoreComposition({ slots: [[1, 2]], profiles, weights: roles }).raw.roles, 1);
  assert.equal(scoreComposition({ slots: [[1, 3]], profiles, weights: roles }).raw.roles, 0);
  // Vitalité : plancher 1 — l'équipe [2,4] est à 0.
  const vit = scoreComposition({
    slots: homogeneousSlots,
    profiles,
    weights: { vitality: 1 },
    vitalityFloor: 1,
  });
  assert.equal(vit.raw.vitality, 1);
  // Verrous.
  const locked = scoreComposition({
    slots: mixedSlots,
    locks: { together: [[1, 3]], apart: [[1, 2]] },
  });
  assert.equal(locked.raw.lockViolations, 2);
  assert.equal(locked.terms.locks, 2 * LOCK_VIOLATION_PENALTY);
});

test('verrous « ensemble » / « séparés » sont respectés par la recherche locale', () => {
  const out = computeComposition({
    players: players(12),
    teamCount: 3,
    weights: RECIPE_WEIGHTS.random,
    locks: {
      together: [
        [1, 2],
        [3, 4],
      ],
      apart: [
        [5, 6],
        [1, 7],
      ],
    },
    rng: createSeededRng(77),
  });
  const slotOf = new Map();
  out.slots.forEach((team, idx) => team.forEach((p) => slotOf.set(p, idx)));
  assert.equal(slotOf.get(1), slotOf.get(2));
  assert.equal(slotOf.get(3), slotOf.get(4));
  assert.notEqual(slotOf.get(5), slotOf.get(6));
  assert.notEqual(slotOf.get(1), slotOf.get(7));
  assert.equal(out.breakdown.locks, 0);
});

test('les épingles fixent un joueur dans son équipe sans toucher aux effectifs', () => {
  const out = computeComposition({
    players: players(9),
    teamCount: 3,
    weights: RECIPE_WEIGHTS.random_memory,
    pairHistory: new Map([[pairKey(1, 2), 1]]),
    pins: [
      { playerId: 1, slot: 2 },
      { playerId: 2, slot: 2 },
    ],
    rng: createSeededRng(9),
  });
  assert.ok(out.slots[2].includes(1));
  assert.ok(out.slots[2].includes(2));
  assert.deepEqual(
    out.slots.map((s) => s.length),
    [3, 3, 3],
  );
});

test('cas limites : aucun joueur, aucune équipe, une seule équipe', () => {
  assert.deepEqual(
    computeComposition({ players: [], teamCount: 2, rng: createSeededRng(1) }).slots,
    [[], []],
  );
  assert.deepEqual(
    computeComposition({ players: players(3), teamCount: 0, rng: createSeededRng(1) }).slots,
    [],
  );
  const one = computeComposition({
    players: players(3),
    teamCount: 1,
    weights: RECIPE_WEIGHTS.random_memory,
    pairHistory: new Map([[pairKey(1, 2), 1]]),
    rng: createSeededRng(1),
  });
  assert.deepEqual(flat(one.slots), [1, 2, 3]);
  assert.equal(one.iterations, 0);
  assert.deepEqual(
    [...ENGINE_RECIPES].sort(),
    ['random', 'random_memory', 'mixed', 'roles', 'homogeneous'].sort(),
  );
});
