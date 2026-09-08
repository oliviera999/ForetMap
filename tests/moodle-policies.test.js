'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  DEFAULT_POLICIES,
  compilePattern,
  normalizePolicies,
  compilePolicies,
  resolvePolicyForIdnumber,
  isCohortOfYear,
  normalizeChapterCourses,
  validatePoliciesSetting,
  parseEmailDomains,
  validateEmailDomainsSetting,
} = require('../lib/moodle/policies');
const { MOODLE_SETTINGS_REGISTRY, MOODLE_SETTING_KEYS } = require('../lib/moodle/settingsRegistry');
const { SETTINGS_REGISTRY } = require('../lib/settings');

test('politiques par défaut : première correspondance dans l’ordre, {year} substitué', () => {
  const compiled = compilePolicies(DEFAULT_POLICIES, '26');
  assert.strictEqual(resolvePolicyForIdnumber('26#6', compiled).key, 'niveau');
  assert.strictEqual(resolvePolicyForIdnumber('26#n3', compiled).key, 'n3');
  assert.strictEqual(resolvePolicyForIdnumber('26#603', compiled).key, 'classe6');
  assert.strictEqual(resolvePolicyForIdnumber('26#601-602', compiled).key, 'classe6');
  assert.strictEqual(resolvePolicyForIdnumber('26#403', compiled).key, 'classe');
  assert.strictEqual(resolvePolicyForIdnumber('25#603', compiled), null);
  assert.strictEqual(resolvePolicyForIdnumber('26#club-echecs', compiled), null);
  assert.strictEqual(resolvePolicyForIdnumber('', compiled), null);
});

test('isCohortOfYear : préfixe strict `<year>#`', () => {
  assert.strictEqual(isCohortOfYear('26#603', '26'), true);
  assert.strictEqual(isCohortOfYear('260#603', '26'), false);
  assert.strictEqual(isCohortOfYear('26#603', ''), false);
});

test('compilePattern : motif vide, trop long, regex invalide, préfixe échappé', () => {
  assert.ok(compilePattern('').error);
  assert.ok(compilePattern('a'.repeat(200)).error);
  assert.ok(compilePattern('(').error);
  const { regex } = compilePattern('^{year}#6$', 'a.b');
  assert.strictEqual(regex.test('a.b#6'), true);
  assert.strictEqual(regex.test('axb#6'), false);
});

test('normalizePolicies : validation typée', () => {
  assert.ok(normalizePolicies('x').error);
  assert.ok(normalizePolicies([{ key: 'bad key', pattern: '^x$' }]).error);
  assert.ok(normalizePolicies([{ key: 'k', pattern: '^x$', group_kind: 'wat' }]).error);
  assert.ok(normalizePolicies([{ key: 'k', pattern: '^x$', role: 'admin' }]).error);
  assert.ok(normalizePolicies([{ key: 'k', pattern: '^x$', role: 'gl_mj' }]).error);
  assert.ok(normalizePolicies([{ key: 'k', pattern: '^x$', n3beur: 'peut-être' }]).error);
  assert.ok(
    normalizePolicies([
      { key: 'k', pattern: '^x$' },
      { key: 'k', pattern: '^y$' },
    ]).error,
  );
  const ok = normalizePolicies([
    { key: 'k', pattern: '^x$', role: 'Visiteur', n3beur: '1', gl_class: 0 },
  ]);
  assert.deepStrictEqual(ok.policies[0], {
    key: 'k',
    pattern: '^x$',
    group_kind: 'class',
    role: 'visiteur',
    n3beur: true,
    gl_class: false,
    create_accounts: false,
    push_membership: false,
  });
  assert.strictEqual(validatePoliciesSetting(DEFAULT_POLICIES), null);
});

test('normalizeChapterCourses : entiers positifs, un cours pour un seul chapitre', () => {
  assert.deepStrictEqual(normalizeChapterCourses({ 1: 564, 2: '565', 3: '' }).chapterCourses, {
    1: 564,
    2: 565,
  });
  assert.ok(normalizeChapterCourses({ x: 1 }).error);
  assert.ok(normalizeChapterCourses({ 1: -1 }).error);
  assert.ok(normalizeChapterCourses({ 1: 564, 2: 564 }).error);
  assert.ok(normalizeChapterCourses([]).error);
});

test('email_domains : normalisation et validation', () => {
  assert.deepStrictEqual(parseEmailDomains(' @Lyautey.ma, ecole.fr ,'), ['lyautey.ma', 'ecole.fr']);
  assert.strictEqual(validateEmailDomainsSetting('lyautey.ma'), null);
  assert.ok(validateEmailDomainsSetting('pas un domaine'));
});

test('les réglages integration.moodle.* sont dans le registre global, portée admin, sans jeton', () => {
  for (const key of Object.values(MOODLE_SETTING_KEYS)) {
    assert.ok(SETTINGS_REGISTRY[key], `réglage manquant : ${key}`);
    assert.strictEqual(SETTINGS_REGISTRY[key].scope, 'admin');
    assert.ok(!/token|jeton/i.test(key), 'le jeton ne doit jamais être un réglage');
  }
  assert.strictEqual(
    MOODLE_SETTINGS_REGISTRY[MOODLE_SETTING_KEYS.policies].validate([
      { key: 'k', pattern: '(' },
    ]) !== null,
    true,
  );
});
