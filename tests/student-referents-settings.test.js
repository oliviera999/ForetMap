'use strict';

// Élèves référents automatiques — réglages `tasks.student_referent_*` (lot 2) : défauts,
// bornes serveur dérivées de `lib/tasks/referentBounds.js`, aucune valeur en dur ailleurs.

require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { SETTINGS_REGISTRY, validateSettingCandidate } = require('../lib/settings');
const {
  MAX_TASK_REFERENTS,
  RESERVED_STAFF_REFERENT_SEATS,
  STUDENT_REFERENT_BOUNDS,
} = require('../lib/tasks/referentBounds');

const KEYS = {
  'tasks.student_referent_enabled': false,
  'tasks.student_referent_group_id': '',
  'tasks.student_referent_min_validations': 2,
  'tasks.student_referent_max_series_per_student': 0,
  'tasks.student_referent_max_students_per_series': 0,
  'tasks.student_referent_inactivity_days': 0,
  'tasks.student_referent_notify_managers': true,
};

test('réglages déclarés, portée teacher, défauts du prompt (fonction inerte par défaut)', () => {
  for (const [key, def] of Object.entries(KEYS)) {
    const meta = SETTINGS_REGISTRY[key];
    assert.ok(meta, key);
    assert.equal(meta.scope, 'teacher', key);
    assert.deepEqual(meta.default, def, key);
  }
});

test('bornes : 1–20, 0–50, 0–13 (deux places enseignants), 0–730', async () => {
  assert.equal(MAX_TASK_REFERENTS, 15);
  assert.equal(
    STUDENT_REFERENT_BOUNDS.maxStudentsPerSeries.max,
    MAX_TASK_REFERENTS - RESERVED_STAFF_REFERENT_SEATS,
  );
  const cases = [
    ['tasks.student_referent_min_validations', 0, 1, 20, 21],
    ['tasks.student_referent_max_series_per_student', -1, 0, 50, 51],
    ['tasks.student_referent_max_students_per_series', -1, 0, 13, 14],
    ['tasks.student_referent_inactivity_days', -1, 0, 730, 731],
  ];
  for (const [key, tooLow, min, max, tooHigh] of cases) {
    assert.equal(await validateSettingCandidate(key, min), min, key);
    assert.equal(await validateSettingCandidate(key, max), max, key);
    await assert.rejects(validateSettingCandidate(key, tooLow), /min/, key);
    await assert.rejects(validateSettingCandidate(key, tooHigh), /max/, key);
  }
  await assert.rejects(
    validateSettingCandidate('tasks.student_referent_group_id', 'x'.repeat(65)),
    /trop long/,
  );
});

test('MAX_TASK_REFERENTS : plus aucune valeur en dur hors du module de bornes', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib/tasks/taskService.js'), 'utf8');
  assert.doesNotMatch(src, /MAX_TASK_REFERENTS\s*=\s*\d/);
});
