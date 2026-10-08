'use strict';

/**
 * Réglages déclarés par domaine (`lib/settings/<domaine>.js`, agrégés par
 * `lib/settings/domains.js`) — sans base. Les réponses HTTP, elles, sont figées par
 * `tests/settings-registry-characterization.test.js`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SETTINGS_DOMAINS,
  assembleSettingsRegistry,
  settingsDomainOf,
} = require('../lib/settings/domains');
const { SETTINGS_REGISTRY } = require('../lib/settings');

test('le registre est l’agrégat des domaines, dans l’ordre de la liste', () => {
  const expectedKeys = SETTINGS_DOMAINS.flatMap(({ settings }) => Object.keys(settings));
  assert.deepEqual(Object.keys(SETTINGS_REGISTRY), expectedKeys);
  for (const { settings } of SETTINGS_DOMAINS) {
    for (const [key, meta] of Object.entries(settings)) {
      assert.equal(SETTINGS_REGISTRY[key], meta, key);
    }
  }
  assert.deepEqual(
    SETTINGS_DOMAINS.map((d) => d.domain),
    [
      'marque',
      'identité',
      'application',
      'terrain',
      'aide',
      'modules',
      'biodiversité',
      'tâches',
      'vie sociale',
      'pédagogie',
      'plan',
      'moodle',
      'lti',
      'confidentialité',
      'parcours',
      'zoom sur le lieu',
    ],
  );
});

test('chaque réglage a un seul domaine propriétaire', () => {
  for (const key of Object.keys(SETTINGS_REGISTRY)) {
    const owners = SETTINGS_DOMAINS.filter(({ settings }) => Object.hasOwn(settings, key));
    assert.equal(owners.length, 1, key);
  }
  assert.throws(
    () =>
      assembleSettingsRegistry([
        { domain: 'a', settings: { 'x.y': { scope: 'public', type: 'boolean', default: true } } },
        { domain: 'b', settings: { 'x.y': { scope: 'public', type: 'boolean', default: false } } },
      ]),
    /Réglage « x\.y » déclaré deux fois \(a, b\)/,
  );
});

test('les clés vivent dans leur domaine', () => {
  const cases = {
    'content.brand.app_name': 'marque',
    'ui.foret.brand': 'marque',
    'ui.auth.allow_register': 'identité',
    'content.auth.title': 'identité',
    'students.import.existing_strategy': 'identité',
    'security.jwt_ttl_base_seconds': 'identité',
    'integration.google.enabled': 'identité',
    'content.app.loader': 'application',
    'runtime.rest_poll_floor_ms': 'application',
    'system.maintenance_mode': 'application',
    'ops.allow_remote_logs': 'application',
    'ui.map.default_map_student': 'terrain',
    'ui.visit.mascot.default_id': 'terrain',
    'content.visit.mascot_dialog.defaults': 'terrain',
    'observations.journal_max_chars': 'terrain',
    'ui.help.show_context_hints': 'aide',
    'content.about.title': 'aide',
    'content.help.hint_prefix': 'aide',
    'ui.modules.forum_enabled': 'modules',
    'ui.biodiv.pedago_level_default': 'biodiversité',
    'tasks.student_max_active_assignments': 'tâches',
    'ui.reactions.allowed_emojis': 'vie sociale',
    'ui.plan.map_id': 'plan',
    'ui.staff_plan.access_mode': 'plan',
    'security.staff_plan_access_code_hash': 'plan',
    'privacy.external_assets_mode': 'confidentialité',
    'ui.place_focus.work_enabled': 'zoom sur le lieu',
    'ui.place_focus.max_zoom_percent': 'zoom sur le lieu',
    'cle.inconnue': null,
  };
  for (const [key, domain] of Object.entries(cases)) {
    assert.equal(settingsDomainOf(key), domain, key);
  }
  const pedagoKeys = Object.keys(SETTINGS_DOMAINS.find((d) => d.domain === 'pédagogie').settings);
  assert.ok(pedagoKeys.length > 0);
  assert.ok(pedagoKeys.every((k) => k.startsWith('learning.gating.')));
});
