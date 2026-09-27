'use strict';

// Agrégations pures du modèle de lecture des statistiques (`lib/stats/statsReadModel.js`, B5).
// Les lectures SQL sont couvertes de bout en bout par `stats-snapshot.test.js`.

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EMPTY_ASSIGNMENT_COUNTS,
  assignmentCounterForStatus,
  summarizeAssignments,
  engagementStatsForUser,
} = require('../lib/stats/statsReadModel');

test('assignmentCounterForStatus : validée, en cours, en attente ; le reste ne compte qu’au total', () => {
  assert.equal(assignmentCounterForStatus('validated'), 'done');
  assert.equal(assignmentCounterForStatus('available'), 'pending');
  assert.equal(assignmentCounterForStatus('in_progress'), 'pending');
  assert.equal(assignmentCounterForStatus('done'), 'submitted');
  assert.equal(assignmentCounterForStatus('proposed'), null);
  assert.equal(assignmentCounterForStatus('on_hold'), null);
  assert.equal(assignmentCounterForStatus(null), null);
});

test('summarizeAssignments : compteurs et total', () => {
  assert.deepEqual(summarizeAssignments([]), { done: 0, pending: 0, submitted: 0, total: 0 });
  assert.deepEqual(
    summarizeAssignments(
      ['validated', 'validated', 'available', 'in_progress', 'done', 'proposed'].map((status) => ({
        status,
      })),
    ),
    { done: 2, pending: 2, submitted: 1, total: 6 },
  );
});

test('engagementStatsForUser : zéros par défaut, clés comparées en chaîne', () => {
  const plantMap = new Map([['42', { species: 3, events: 7 }]]);
  const tutMap = new Map([['42', 2]]);
  assert.deepEqual(engagementStatsForUser(42, plantMap, tutMap), {
    plant_species_observed: 3,
    plant_observation_events: 7,
    tutorials_read: 2,
  });
  assert.deepEqual(engagementStatsForUser('inconnu', plantMap, tutMap), {
    plant_species_observed: 0,
    plant_observation_events: 0,
    tutorials_read: 0,
  });
  assert.ok(Object.isFrozen(EMPTY_ASSIGNMENT_COUNTS));
});
