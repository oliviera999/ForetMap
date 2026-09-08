'use strict';

/**
 * Réglages administrateur de l'entrée LTI (section 21.5). Portée `admin`, fusionnés
 * dans `SETTINGS_REGISTRY`. Les secrets (issuer, clés) restent dans `.env`.
 */

const LANDING_VALUES = Object.freeze(['aiguillage', 'gl_game', 'gl_home', 'fm_map', 'fm_tasks']);
const PRODUCT_VALUES = Object.freeze(['fm', 'gl', 'both']);
const UNKNOWN_USER_VALUES = Object.freeze(['refuse', 'queue']);
const INSTRUCTOR_TARGET_VALUES = Object.freeze(['fm', 'gl']);

const DEFAULT_LANDING_OPTIONS = LANDING_VALUES.slice();

const DEFAULT_LAUNCH_BINDINGS = Object.freeze([
  { moodle_course_id: 564, product: 'gl', gl_chapter_id: 1, landing: 'aiguillage', label: '' },
  { moodle_course_id: 565, product: 'gl', gl_chapter_id: 2, landing: 'aiguillage', label: '' },
  { moodle_course_id: 566, product: 'gl', gl_chapter_id: 3, landing: 'aiguillage', label: '' },
  { moodle_course_id: 567, product: 'gl', gl_chapter_id: 4, landing: 'aiguillage', label: '' },
  { moodle_course_id: 595, product: 'gl', gl_chapter_id: 5, landing: 'aiguillage', label: '' },
  { moodle_course_id: 570, product: 'gl', gl_chapter_id: 6, landing: 'aiguillage', label: '' },
  { moodle_course_id: 511, product: 'fm', gl_chapter_id: null, landing: 'aiguillage', label: '' },
]);

const LTI_SETTING_KEYS = Object.freeze({
  enabled: 'integration.lti.enabled',
  unknownUser: 'integration.lti.unknown_user',
  publicOrigin: 'integration.lti.public_origin',
  instructorTargets: 'integration.lti.instructor_targets',
  launchBindings: 'integration.lti.launch_bindings',
  landingOptions: 'integration.lti.landing_options',
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeLandingOptions(raw) {
  if (raw == null || raw === '') return { options: DEFAULT_LANDING_OPTIONS.slice() };
  if (!Array.isArray(raw)) return { error: 'liste d’options d’arrivée attendue' };
  const options = [];
  const seen = new Set();
  for (const item of raw) {
    const v = String(item || '').trim();
    if (!LANDING_VALUES.includes(v)) return { error: `option d’arrivée inconnue : ${v}` };
    if (seen.has(v)) continue;
    seen.add(v);
    options.push(v);
  }
  if (!options.includes('aiguillage')) options.unshift('aiguillage');
  return { options };
}

function normalizeInstructorTargets(raw) {
  if (raw == null || raw === '') return { targets: ['fm', 'gl'] };
  if (!Array.isArray(raw)) return { error: 'liste de cibles enseignant attendue' };
  const targets = [];
  const seen = new Set();
  for (const item of raw) {
    const v = String(item || '').trim();
    if (!INSTRUCTOR_TARGET_VALUES.includes(v)) return { error: `cible enseignant inconnue : ${v}` };
    if (seen.has(v)) continue;
    seen.add(v);
    targets.push(v);
  }
  if (!targets.length) return { error: 'au moins une cible enseignant (fm ou gl)' };
  return { targets };
}

function normalizeBinding(raw, index) {
  const at = `liaison n°${index + 1}`;
  if (!isPlainObject(raw)) return { error: `${at} : objet attendu` };
  const courseId = Number(raw.moodle_course_id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return { error: `${at} : identifiant de cours Moodle invalide` };
  }
  const product = String(raw.product || '').trim();
  if (!PRODUCT_VALUES.includes(product)) {
    return { error: `${at} : product doit être fm, gl ou both` };
  }
  const landing = String(raw.landing || 'aiguillage').trim() || 'aiguillage';
  if (!LANDING_VALUES.includes(landing)) {
    return { error: `${at} : landing inconnu` };
  }
  if (product === 'both' && landing !== 'aiguillage') {
    return { error: `${at} : une liaison « les deux produits » doit arriver sur l’aiguillage` };
  }
  let chapter =
    raw.gl_chapter_id == null || raw.gl_chapter_id === '' ? null : Number(raw.gl_chapter_id);
  if (chapter != null && (!Number.isInteger(chapter) || chapter <= 0)) {
    return { error: `${at} : chapitre G&L invalide` };
  }
  if (product === 'fm') chapter = null;
  return {
    binding: {
      moodle_course_id: courseId,
      product,
      gl_chapter_id: chapter,
      landing,
      label: String(raw.label || '')
        .trim()
        .slice(0, 120),
    },
  };
}

function normalizeLaunchBindings(raw) {
  if (raw == null || raw === '')
    return { bindings: DEFAULT_LAUNCH_BINDINGS.map((b) => ({ ...b })) };
  if (!Array.isArray(raw)) return { error: 'liste de liaisons attendue' };
  const bindings = [];
  const seen = new Set();
  for (let i = 0; i < raw.length; i += 1) {
    const result = normalizeBinding(raw[i], i);
    if (result.error) return { error: result.error };
    if (seen.has(result.binding.moodle_course_id)) {
      return { error: `cours Moodle en double : ${result.binding.moodle_course_id}` };
    }
    seen.add(result.binding.moodle_course_id);
    bindings.push(result.binding);
  }
  return { bindings };
}

function validateUnknownUser(value) {
  const v = String(value || '').trim();
  if (!UNKNOWN_USER_VALUES.includes(v)) return 'unknown_user doit valoir refuse ou queue';
  return null;
}

function validatePublicOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'origine publique invalide';
    return null;
  } catch {
    return 'origine publique invalide';
  }
}

const LTI_SETTINGS_REGISTRY = {
  [LTI_SETTING_KEYS.enabled]: { scope: 'admin', type: 'boolean', default: false },
  [LTI_SETTING_KEYS.unknownUser]: {
    scope: 'admin',
    type: 'enum',
    values: UNKNOWN_USER_VALUES.slice(),
    default: 'refuse',
    validate: validateUnknownUser,
  },
  [LTI_SETTING_KEYS.publicOrigin]: {
    scope: 'admin',
    type: 'string',
    maxLength: 255,
    default: '',
    validate: validatePublicOrigin,
  },
  [LTI_SETTING_KEYS.instructorTargets]: {
    scope: 'admin',
    type: 'json',
    shape: 'array',
    default: ['fm', 'gl'],
    validate: (v) => normalizeInstructorTargets(v).error || null,
    normalize: (v) => normalizeInstructorTargets(v).targets,
  },
  [LTI_SETTING_KEYS.launchBindings]: {
    scope: 'admin',
    type: 'json',
    shape: 'array',
    default: DEFAULT_LAUNCH_BINDINGS.map((b) => ({ ...b })),
    validate: (v) => normalizeLaunchBindings(v).error || null,
    normalize: (v) => normalizeLaunchBindings(v).bindings,
  },
  [LTI_SETTING_KEYS.landingOptions]: {
    scope: 'admin',
    type: 'json',
    shape: 'array',
    default: DEFAULT_LANDING_OPTIONS.slice(),
    validate: (v) => normalizeLandingOptions(v).error || null,
    normalize: (v) => normalizeLandingOptions(v).options,
  },
};

module.exports = {
  LTI_SETTING_KEYS,
  LTI_SETTINGS_REGISTRY,
  LANDING_VALUES,
  PRODUCT_VALUES,
  DEFAULT_LAUNCH_BINDINGS,
  DEFAULT_LANDING_OPTIONS,
  normalizeLaunchBindings,
  normalizeLandingOptions,
  normalizeInstructorTargets,
};
