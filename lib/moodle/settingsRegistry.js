'use strict';

/**
 * Réglages administrateur du lien Moodle (docs/AUDIT_MOODLE_IDENTITES_2026-09.md, section 6.2).
 *
 * Tous en portée `admin`, aucun public. Le jeton Web Services n'est PAS un réglage (I-9 :
 * `.env` seulement). Ces descripteurs sont fusionnés dans `SETTINGS_REGISTRY` de
 * `lib/settings.js` ; ils sont isolés ici pour rester lisibles et testables sans base.
 */

const {
  DEFAULT_POLICIES,
  validatePoliciesSetting,
  normalizePoliciesSetting,
  validateChapterCoursesSetting,
  normalizeChapterCoursesSetting,
  validateEmailDomainsSetting,
  normalizeEmailDomainsSetting,
} = require('./policies');

const MOODLE_SETTING_KEYS = Object.freeze({
  enabled: 'integration.moodle.enabled',
  yearPrefix: 'integration.moodle.year_prefix',
  emailDomains: 'integration.moodle.email_domains',
  policies: 'integration.moodle.policies',
  chapterCourses: 'integration.moodle.chapter_courses',
  thresholdCreatePct: 'integration.moodle.threshold_create_pct',
  thresholdDeactivatePct: 'integration.moodle.threshold_deactivate_pct',
  thresholdDeactivateAbs: 'integration.moodle.threshold_deactivate_abs',
  thresholdNamematchPct: 'integration.moodle.threshold_namematch_pct',
  thresholdOutboundRemoveAbs: 'integration.moodle.threshold_outbound_remove_abs',
});

const MOODLE_SETTINGS_REGISTRY = {
  [MOODLE_SETTING_KEYS.enabled]: { scope: 'admin', type: 'boolean', default: false },
  // Préfixe d'année des `idnumber` de cohorte (`26#…`) : deux à quatre caractères alphanumériques.
  [MOODLE_SETTING_KEYS.yearPrefix]: {
    scope: 'admin',
    type: 'string',
    maxLength: 8,
    default: '26',
    validate: (value) =>
      /^[A-Za-z0-9]{1,8}$/.test(String(value || ''))
        ? null
        : 'préfixe d’année invalide (1 à 8 caractères alphanumériques)',
  },
  [MOODLE_SETTING_KEYS.emailDomains]: {
    scope: 'admin',
    type: 'string',
    maxLength: 512,
    default: '',
    validate: validateEmailDomainsSetting,
    normalize: normalizeEmailDomainsSetting,
  },
  [MOODLE_SETTING_KEYS.policies]: {
    scope: 'admin',
    type: 'json',
    shape: 'array',
    default: DEFAULT_POLICIES.map((policy) => ({ ...policy })),
    validate: validatePoliciesSetting,
    normalize: normalizePoliciesSetting,
  },
  [MOODLE_SETTING_KEYS.chapterCourses]: {
    scope: 'admin',
    type: 'json',
    shape: 'object',
    default: {},
    validate: validateChapterCoursesSetting,
    normalize: normalizeChapterCoursesSetting,
  },
  [MOODLE_SETTING_KEYS.thresholdCreatePct]: {
    scope: 'admin',
    type: 'number',
    min: 0,
    max: 1000,
    default: 30,
  },
  [MOODLE_SETTING_KEYS.thresholdDeactivatePct]: {
    scope: 'admin',
    type: 'number',
    min: 0,
    max: 100,
    default: 10,
  },
  [MOODLE_SETTING_KEYS.thresholdDeactivateAbs]: {
    scope: 'admin',
    type: 'number',
    min: 0,
    max: 100000,
    default: 50,
  },
  [MOODLE_SETTING_KEYS.thresholdNamematchPct]: {
    scope: 'admin',
    type: 'number',
    min: 0,
    max: 100,
    default: 20,
  },
  [MOODLE_SETTING_KEYS.thresholdOutboundRemoveAbs]: {
    scope: 'admin',
    type: 'number',
    min: 0,
    max: 100000,
    default: 50,
  },
};

module.exports = { MOODLE_SETTING_KEYS, MOODLE_SETTINGS_REGISTRY };
