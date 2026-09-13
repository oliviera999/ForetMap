'use strict';

/**
 * Politiques de synchronisation par motif d'`idnumber` de cohorte
 * (docs/AUDIT_MOODLE_IDENTITES_2026-09.md, section 6.2).
 *
 * Module pur, sans base : sert au registre de réglages (validation à l'enregistrement), au
 * plan de synchronisation (choix de la politique d'une cohorte) et aux tests.
 *
 * Règles :
 *  - le tableau est ordonné, **la première entrée dont le motif correspond gagne** ;
 *  - `{year}` est remplacé par `integration.moodle.year_prefix` à l'évaluation ;
 *  - un motif est une expression régulière saisie par un administrateur : compilée dans un
 *    `try/catch`, refusée si invalide, bornée à 128 caractères ;
 *  - aucune cohorte non appariée n'est traitée : pas de motif attrape-tout.
 */

const PATTERN_MAX_LENGTH = 128;
const POLICY_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const POLICY_GROUP_KINDS = Object.freeze(['class', 'unit', 'club', 'team']);
const POLICY_ROLE_SLUG_RE = /^[a-z][a-z0-9_]{0,63}$/;

const DEFAULT_POLICIES = Object.freeze([
  {
    key: 'niveau',
    pattern: '^{year}#\\d$',
    group_kind: 'unit',
    role: null,
    n3beur: false,
    gl_class: false,
    create_accounts: false,
    push_membership: false,
  },
  {
    key: 'n3',
    // Toute cohorte dont l'`idnumber` contient « n3 » (ex. `26#n3`, `n3`, `club-n3`),
    // sans exiger le préfixe d'année — les n3beurs ne sont pas forcément préfixés `{year}#`.
    pattern: 'n3',
    group_kind: 'class',
    role: 'eleve_novice',
    n3beur: true,
    gl_class: false,
    create_accounts: true,
    push_membership: true,
  },
  {
    key: 'classe6',
    pattern: '^{year}#6\\d{2}(-6\\d{2})?$',
    group_kind: 'class',
    role: 'visiteur',
    n3beur: false,
    gl_class: true,
    create_accounts: true,
    push_membership: false,
  },
  {
    key: 'classe',
    pattern: '^{year}#[2-5]\\d{2}$',
    group_kind: 'class',
    role: 'visiteur',
    n3beur: false,
    gl_class: false,
    create_accounts: true,
    push_membership: false,
  },
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toBool(value) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false' || value == null || value === '') {
    return false;
  }
  return null;
}

/** Remplace `{year}` par le préfixe d'année ; le préfixe est échappé pour l'expression régulière. */
function substituteYear(pattern, yearPrefix) {
  const year = String(yearPrefix ?? '').trim();
  const escaped = year.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(pattern || '')
    .split('{year}')
    .join(escaped);
}

/** Compile un motif ; renvoie `{ regex }` ou `{ error }` — jamais d'exception. */
function compilePattern(pattern, yearPrefix = 'YY') {
  const raw = String(pattern ?? '');
  if (!raw.trim()) return { error: 'motif vide' };
  if (raw.length > PATTERN_MAX_LENGTH) {
    return { error: `motif trop long (max ${PATTERN_MAX_LENGTH} caractères)` };
  }
  try {
    return { regex: new RegExp(substituteYear(raw, yearPrefix)) };
  } catch (error) {
    return { error: `expression régulière invalide (${error.message})` };
  }
}

/**
 * Normalise une politique brute. Renvoie `{ policy }` ou `{ error }`.
 * Les booléens acceptent `true/false/1/0/'true'/'false'` ; tout autre contenu est refusé.
 */
function normalizePolicy(raw, index) {
  const at = `politique n°${index + 1}`;
  if (!isPlainObject(raw)) return { error: `${at} : objet attendu` };
  const key = String(raw.key ?? '').trim();
  if (!POLICY_KEY_RE.test(key)) {
    return { error: `${at} : clé invalide (lettres, chiffres, '_' ou '-', 64 max)` };
  }
  const pattern = String(raw.pattern ?? '');
  const compiled = compilePattern(pattern);
  if (compiled.error) return { error: `${at} (${key}) : ${compiled.error}` };
  const groupKind = String(raw.group_kind ?? 'class')
    .trim()
    .toLowerCase();
  if (!POLICY_GROUP_KINDS.includes(groupKind)) {
    return {
      error: `${at} (${key}) : group_kind invalide (${POLICY_GROUP_KINDS.join(', ')})`,
    };
  }
  let role = raw.role == null || raw.role === '' ? null : String(raw.role).trim().toLowerCase();
  if (role !== null && !POLICY_ROLE_SLUG_RE.test(role)) {
    return { error: `${at} (${key}) : rôle invalide` };
  }
  if (role === 'admin' || role === 'prof' || (role && role.startsWith('gl_'))) {
    return { error: `${at} (${key}) : le rôle ${role} ne peut pas être un rôle de groupe` };
  }
  const flags = {};
  for (const flag of ['n3beur', 'gl_class', 'create_accounts', 'push_membership']) {
    const value = toBool(raw[flag]);
    if (value === null) return { error: `${at} (${key}) : ${flag} doit être booléen` };
    flags[flag] = value;
  }
  return {
    policy: { key, pattern, group_kind: groupKind, role, ...flags },
  };
}

/**
 * Normalise la liste complète. Renvoie `{ policies }` ou `{ error }`.
 * Clés uniques ; liste vide acceptée (aucune cohorte n'est alors traitée).
 */
function normalizePolicies(raw) {
  if (!Array.isArray(raw)) return { error: 'liste de politiques attendue' };
  const policies = [];
  const seen = new Set();
  for (let i = 0; i < raw.length; i += 1) {
    const result = normalizePolicy(raw[i], i);
    if (result.error) return { error: result.error };
    if (seen.has(result.policy.key)) {
      return { error: `clé de politique en double : ${result.policy.key}` };
    }
    seen.add(result.policy.key);
    policies.push(result.policy);
  }
  return { policies };
}

/** Hook `validate` du registre de réglages : message d'erreur ou `null`. */
function validatePoliciesSetting(value) {
  const result = normalizePolicies(value);
  return result.error || null;
}

/** Hook `normalize` du registre : liste normalisée (suppose `validate` passé). */
function normalizePoliciesSetting(value) {
  const result = normalizePolicies(value);
  return result.policies || [];
}

/** Politiques compilées pour une année : `[{ ...policy, regex }]`. Les motifs invalides sont ignorés. */
function compilePolicies(policies, yearPrefix) {
  const out = [];
  for (const policy of Array.isArray(policies) ? policies : []) {
    const compiled = compilePattern(policy?.pattern, yearPrefix);
    if (compiled.regex) out.push({ ...policy, regex: compiled.regex });
  }
  return out;
}

/** Première politique dont le motif correspond à l'`idnumber`, sinon `null`. */
function resolvePolicyForIdnumber(idnumber, compiledPolicies) {
  const value = String(idnumber ?? '').trim();
  if (!value) return null;
  for (const policy of compiledPolicies || []) {
    if (policy.regex.test(value)) return policy;
  }
  return null;
}

/** Une cohorte « de l'année » : son `idnumber` commence par `<year>#`. */
function isCohortOfYear(idnumber, yearPrefix) {
  const value = String(idnumber ?? '').trim();
  const year = String(yearPrefix ?? '').trim();
  if (!value || !year) return false;
  return value.startsWith(`${year}#`);
}

/**
 * Cohorte proposée à la synchronisation : préfixe d'année **ou** politique hors préfixe
 * (cas typique : cohorte n3beurs sans `{year}#`).
 */
function isCohortListedForSync(idnumber, yearPrefix, compiledPolicies) {
  if (isCohortOfYear(idnumber, yearPrefix)) return true;
  return Boolean(resolvePolicyForIdnumber(idnumber, compiledPolicies));
}

/** Ancien motif n3 strict (préfixe d'année obligatoire) → motif « contient n3 ». */
const LEGACY_N3_POLICY_PATTERN = '^{year}#n3$';

/**
 * Remplace le motif n3 historique s'il est encore celui livré par défaut.
 * Les personnalisations admin (autre motif sur la clé `n3`) sont laissées telles quelles.
 */
function upgradeLegacyN3PolicyPattern(policies) {
  if (!Array.isArray(policies)) return policies;
  return policies.map((policy) => {
    if (
      policy &&
      policy.key === 'n3' &&
      String(policy.pattern || '') === LEGACY_N3_POLICY_PATTERN
    ) {
      return { ...policy, pattern: 'n3' };
    }
    return policy;
  });
}

// ---------------------------------------------------------------------------------------------
// Table chapitre → cours (`integration.moodle.chapter_courses`) : `{ "<gl_chapters.id>": <courseid> }`.
// Les identifiants ne se dérivent jamais l'un de l'autre (section 2.2) : table explicite.
// ---------------------------------------------------------------------------------------------

function normalizeChapterCourses(raw) {
  if (!isPlainObject(raw)) return { error: 'objet { chapitre: cours } attendu' };
  const out = {};
  const seenCourses = new Map();
  for (const [chapterKey, courseValue] of Object.entries(raw)) {
    const chapterId = Number.parseInt(String(chapterKey).trim(), 10);
    if (!Number.isInteger(chapterId) || chapterId <= 0) {
      return { error: `identifiant de chapitre invalide : ${chapterKey}` };
    }
    if (courseValue == null || courseValue === '') continue;
    const courseId = Number.parseInt(String(courseValue).trim(), 10);
    if (!Number.isInteger(courseId) || courseId <= 0) {
      return { error: `identifiant de cours invalide pour le chapitre ${chapterId}` };
    }
    if (seenCourses.has(courseId)) {
      return {
        error: `le cours ${courseId} est lié à deux chapitres (${seenCourses.get(courseId)} et ${chapterId})`,
      };
    }
    seenCourses.set(courseId, chapterId);
    out[String(chapterId)] = courseId;
  }
  return { chapterCourses: out };
}

function validateChapterCoursesSetting(value) {
  return normalizeChapterCourses(value).error || null;
}

function normalizeChapterCoursesSetting(value) {
  return normalizeChapterCourses(value).chapterCourses || {};
}

/** `integration.moodle.email_domains` : « a.fr, b.org » → `['a.fr', 'b.org']` (minuscules, sans `@`). */
function parseEmailDomains(value) {
  return String(value ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/^@+/, ''))
    .filter(Boolean);
}

function normalizeEmailDomainsSetting(value) {
  return parseEmailDomains(value).join(',');
}

function validateEmailDomainsSetting(value) {
  for (const domain of parseEmailDomains(value)) {
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return `domaine invalide : ${domain}`;
  }
  return null;
}

module.exports = {
  PATTERN_MAX_LENGTH,
  POLICY_GROUP_KINDS,
  DEFAULT_POLICIES,
  substituteYear,
  compilePattern,
  normalizePolicy,
  normalizePolicies,
  validatePoliciesSetting,
  normalizePoliciesSetting,
  compilePolicies,
  resolvePolicyForIdnumber,
  isCohortOfYear,
  isCohortListedForSync,
  LEGACY_N3_POLICY_PATTERN,
  upgradeLegacyN3PolicyPattern,
  normalizeChapterCourses,
  validateChapterCoursesSetting,
  normalizeChapterCoursesSetting,
  parseEmailDomains,
  normalizeEmailDomainsSetting,
  validateEmailDomainsSetting,
};
