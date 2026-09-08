'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  LTI_SETTINGS_REGISTRY,
  LTI_SETTING_KEYS,
  LANDING_VALUES,
  DEFAULT_LAUNCH_BINDINGS,
  normalizeLaunchBindings,
  normalizeLandingOptions,
  normalizeInstructorTargets,
} = require('../lib/lti/settingsRegistry');
const { SETTINGS_REGISTRY } = require('../lib/settings');

test('les réglages integration.lti.* sont dans le registre, portée admin, sans secret', () => {
  for (const key of Object.values(LTI_SETTING_KEYS)) {
    assert.ok(SETTINGS_REGISTRY[key], `réglage manquant : ${key}`);
    assert.strictEqual(SETTINGS_REGISTRY[key].scope, 'admin');
    assert.ok(!/token|private|issuer|jwks|secret/i.test(key));
  }
  assert.strictEqual(LTI_SETTINGS_REGISTRY[LTI_SETTING_KEYS.unknownUser].default, 'refuse');
  assert.ok(DEFAULT_LAUNCH_BINDINGS.some((b) => b.moodle_course_id === 511 && b.product === 'fm'));
  assert.ok(
    DEFAULT_LAUNCH_BINDINGS.some((b) => b.moodle_course_id === 564 && b.gl_chapter_id === 1),
  );
});

test('unknown_user refuse ou queue, jamais create', () => {
  const validate = LTI_SETTINGS_REGISTRY[LTI_SETTING_KEYS.unknownUser].validate;
  assert.strictEqual(validate('refuse'), null);
  assert.strictEqual(validate('queue'), null);
  assert.ok(validate('create'));
  assert.ok(validate('yes'));
});

test('both impose landing = aiguillage', () => {
  const bad = normalizeLaunchBindings([
    { moodle_course_id: 1, product: 'both', landing: 'gl_game' },
  ]);
  assert.ok(bad.error);
  const ok = normalizeLaunchBindings([
    { moodle_course_id: 1, product: 'both', landing: 'aiguillage' },
  ]);
  assert.ok(ok.bindings);
  assert.strictEqual(ok.bindings[0].landing, 'aiguillage');
});

test('landing doit appartenir aux options connues ; product fm|gl|both', () => {
  assert.ok(normalizeLaunchBindings([{ moodle_course_id: 1, product: 'xx' }]).error);
  assert.ok(
    normalizeLaunchBindings([{ moodle_course_id: 1, product: 'fm', landing: 'dashboard' }]).error,
  );
  const ok = normalizeLaunchBindings([
    { moodle_course_id: 42, product: 'fm', landing: 'fm_tasks', label: 'Salle' },
  ]);
  assert.strictEqual(ok.bindings[0].gl_chapter_id, null);
  assert.strictEqual(ok.bindings[0].label, 'Salle');
});

test('cours Moodle en double refusés ; landing_options force aiguillage', () => {
  assert.ok(
    normalizeLaunchBindings([
      { moodle_course_id: 1, product: 'fm' },
      { moodle_course_id: 1, product: 'gl' },
    ]).error,
  );
  const landings = normalizeLandingOptions(['fm_map', 'gl_home']);
  assert.ok(landings.options.includes('aiguillage'));
  assert.ok(LANDING_VALUES.includes('fm_tasks'));
  assert.ok(normalizeLandingOptions(['nope']).error);
});

test('instructor_targets : au moins fm ou gl', () => {
  assert.deepStrictEqual(normalizeInstructorTargets(['gl', 'fm', 'gl']).targets, ['gl', 'fm']);
  assert.ok(normalizeInstructorTargets([]).error);
  assert.ok(normalizeInstructorTargets('fm').error);
});
