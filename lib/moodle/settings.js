'use strict';

/**
 * Lecture typée des réglages `integration.moodle.*` (section 6.2) depuis `app_settings`.
 * Un seul appel `loadMoodleSettings()` par exécution : le résultat est passé aux modules purs.
 */

const { getSettings } = require('../settings');
const { httpError } = require('../shared/httpError');
const { MOODLE_SETTING_KEYS, MOODLE_SETTINGS_REGISTRY } = require('./settingsRegistry');
const {
  normalizePolicies,
  normalizeChapterCourses,
  parseEmailDomains,
  compilePolicies,
  upgradeLegacyN3PolicyPattern,
} = require('./policies');

const MOODLE_DISABLED_MESSAGE =
  'Intégration Moodle désactivée dans les réglages (integration.moodle.enabled)';

/**
 * Toute écriture (exécution réelle, annulation, décision sur un rapprochement ou un conflit,
 * miroir poussé vers Moodle) exige le réglage `integration.moodle.enabled` ; les lectures et les
 * simulations restent ouvertes (CDG-47).
 * @throws {Error} 409
 */
function assertMoodleEnabled(settings) {
  if (!settings?.enabled) throw httpError(409, MOODLE_DISABLED_MESSAGE);
}

function pick(flat, key) {
  return Object.prototype.hasOwnProperty.call(flat, key) && flat[key] !== undefined
    ? flat[key]
    : MOODLE_SETTINGS_REGISTRY[key].default;
}

/**
 * @returns {Promise<{
 *   enabled: boolean, yearPrefix: string, emailDomains: string[],
 *   policies: object[], compiledPolicies: object[], chapterCourses: Record<string, number>,
 *   thresholds: { createPct: number, deactivatePct: number, deactivateAbs: number, namematchPct: number, outboundRemoveAbs: number }
 * }>}
 */
async function loadMoodleSettings() {
  const { flat } = await getSettings('admin');
  const yearPrefix = String(pick(flat, MOODLE_SETTING_KEYS.yearPrefix) || '').trim();
  const policiesResult = normalizePolicies(pick(flat, MOODLE_SETTING_KEYS.policies));
  const policies = upgradeLegacyN3PolicyPattern(policiesResult.policies || []);
  const chapterResult = normalizeChapterCourses(pick(flat, MOODLE_SETTING_KEYS.chapterCourses));
  return {
    enabled: Boolean(pick(flat, MOODLE_SETTING_KEYS.enabled)),
    yearPrefix,
    emailDomains: parseEmailDomains(pick(flat, MOODLE_SETTING_KEYS.emailDomains)),
    policies,
    compiledPolicies: compilePolicies(policies, yearPrefix),
    chapterCourses: chapterResult.chapterCourses || {},
    thresholds: {
      createPct: Number(pick(flat, MOODLE_SETTING_KEYS.thresholdCreatePct)),
      deactivatePct: Number(pick(flat, MOODLE_SETTING_KEYS.thresholdDeactivatePct)),
      deactivateAbs: Number(pick(flat, MOODLE_SETTING_KEYS.thresholdDeactivateAbs)),
      namematchPct: Number(pick(flat, MOODLE_SETTING_KEYS.thresholdNamematchPct)),
      outboundRemoveAbs: Number(pick(flat, MOODLE_SETTING_KEYS.thresholdOutboundRemoveAbs)),
    },
  };
}

module.exports = {
  loadMoodleSettings,
  assertMoodleEnabled,
  MOODLE_DISABLED_MESSAGE,
  MOODLE_SETTING_KEYS,
};
