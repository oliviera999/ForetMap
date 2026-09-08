'use strict';

const { getSettings } = require('../settings');
const {
  LTI_SETTING_KEYS,
  LTI_SETTINGS_REGISTRY,
  normalizeLaunchBindings,
  normalizeLandingOptions,
  normalizeInstructorTargets,
} = require('./settingsRegistry');

function pick(flat, key) {
  return Object.prototype.hasOwnProperty.call(flat, key) && flat[key] !== undefined
    ? flat[key]
    : LTI_SETTINGS_REGISTRY[key].default;
}

async function loadLtiSettings() {
  const { flat } = await getSettings('admin');
  const bindings = normalizeLaunchBindings(pick(flat, LTI_SETTING_KEYS.launchBindings));
  const landings = normalizeLandingOptions(pick(flat, LTI_SETTING_KEYS.landingOptions));
  const targets = normalizeInstructorTargets(pick(flat, LTI_SETTING_KEYS.instructorTargets));
  const origin = String(pick(flat, LTI_SETTING_KEYS.publicOrigin) || '').trim();
  return {
    enabled: Boolean(pick(flat, LTI_SETTING_KEYS.enabled)),
    unknownUser: String(pick(flat, LTI_SETTING_KEYS.unknownUser) || 'refuse'),
    publicOrigin: origin.replace(/\/+$/, ''),
    instructorTargets: targets.targets || ['fm', 'gl'],
    launchBindings: bindings.bindings || [],
    landingOptions: landings.options || ['aiguillage'],
  };
}

module.exports = { loadLtiSettings, LTI_SETTING_KEYS };
