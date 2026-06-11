'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  normalizeTaskLivingBeingsInput,
  serializeTaskLivingBeingsForDb,
  attachTaskLivingBeingsApiFields,
} = require('../lib/tasks/taskLivingBeings');

test('normalizeTaskLivingBeingsInput : tableau, JSON, CSV, dédup + trim', () => {
  assert.deepEqual(normalizeTaskLivingBeingsInput(['Chêne', ' Hêtre ', 'Chêne', '']), ['Chêne', 'Hêtre']);
  assert.deepEqual(normalizeTaskLivingBeingsInput('["Chêne","Hêtre"]'), ['Chêne', 'Hêtre']);
  assert.deepEqual(normalizeTaskLivingBeingsInput('Chêne, Hêtre , Chêne'), ['Chêne', 'Hêtre']);
  assert.deepEqual(normalizeTaskLivingBeingsInput(''), []);
  assert.deepEqual(normalizeTaskLivingBeingsInput(null), []);
});

test('normalizeTaskLivingBeingsInput : fallback uniquement si liste vide', () => {
  assert.deepEqual(normalizeTaskLivingBeingsInput('', 'Renard'), ['Renard']);
  assert.deepEqual(normalizeTaskLivingBeingsInput(['Loup'], 'Renard'), ['Loup']);
  assert.deepEqual(normalizeTaskLivingBeingsInput('', '  '), []);
});

test('serializeTaskLivingBeingsForDb : JSON ou null si vide', () => {
  assert.equal(serializeTaskLivingBeingsForDb(['A', 'B']), '["A","B"]');
  assert.equal(serializeTaskLivingBeingsForDb([]), null);
  assert.equal(serializeTaskLivingBeingsForDb(''), null);
});

test('attachTaskLivingBeingsApiFields : pose living_beings_list et retire living_beings', () => {
  const task = { id: 1, living_beings: '["A","B"]' };
  attachTaskLivingBeingsApiFields(task);
  assert.deepEqual(task.living_beings_list, ['A', 'B']);
  assert.ok(!('living_beings' in task));
  // tolère null / absence
  const empty = { id: 2, living_beings: null };
  attachTaskLivingBeingsApiFields(empty);
  assert.deepEqual(empty.living_beings_list, []);
  assert.doesNotThrow(() => attachTaskLivingBeingsApiFields(null));
});
