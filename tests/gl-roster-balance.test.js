'use strict';

// Tests unitaires purs (sans BDD) des helpers de répartition aléatoire des
// effectifs GL. Le flux complet par route est couvert dans gl-games-roster.test.js.
const { test } = require('node:test');
const assert = require('node:assert');
const { computeBalancedAssignments, shuffleInPlace } = require('../lib/glRoster');

// RNG déterministe (générateur congruentiel) pour des assertions reproductibles.
function seededRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

test('shuffleInPlace conserve les mêmes éléments', () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = shuffleInPlace([...input], seededRng(42));
  assert.deepEqual(
    [...out].sort((a, b) => a - b),
    input,
  );
});

test('computeBalancedAssignments répartit tout le pool sur des équipes valides', () => {
  const assignments = computeBalancedAssignments({
    pool: [1, 2, 3, 4, 5],
    teamIds: [10, 20],
    rng: seededRng(7),
  });
  assert.equal(assignments.length, 5);
  assert.ok(assignments.every((a) => a.teamId === 10 || a.teamId === 20));
  const players = assignments.map((a) => a.playerId).sort((x, y) => x - y);
  assert.deepEqual(players, [1, 2, 3, 4, 5]);
});

test('computeBalancedAssignments équilibre depuis zéro (écart ≤ 1)', () => {
  const assignments = computeBalancedAssignments({
    pool: [1, 2, 3, 4, 5, 6, 7],
    teamIds: [10, 20],
    rng: seededRng(123),
  });
  const counts = { 10: 0, 20: 0 };
  assignments.forEach((a) => {
    counts[a.teamId] += 1;
  });
  assert.ok(Math.abs(counts[10] - counts[20]) <= 1);
});

test('computeBalancedAssignments tient compte des effectifs existants (mode fill)', () => {
  // Équipe 10 déjà à 4, équipe 20 à 1 : les nouveaux doivent surtout aller en 20.
  const assignments = computeBalancedAssignments({
    pool: [101, 102, 103],
    teamIds: [10, 20],
    currentCounts: new Map([
      [10, 4],
      [20, 1],
    ]),
    rng: seededRng(99),
  });
  const counts = { 10: 4, 20: 1 };
  assignments.forEach((a) => {
    counts[a.teamId] += 1;
  });
  // Total 5 + 3 = 8 → équilibrage 4/4.
  assert.equal(counts[10], 4);
  assert.equal(counts[20], 4);
});

test('computeBalancedAssignments gère un pool vide', () => {
  const assignments = computeBalancedAssignments({ pool: [], teamIds: [10, 20] });
  assert.deepEqual(assignments, []);
});

test('computeBalancedAssignments sans équipe retourne une liste vide', () => {
  const assignments = computeBalancedAssignments({ pool: [1, 2], teamIds: [] });
  assert.deepEqual(assignments, []);
});
