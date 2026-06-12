'use strict';

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_DESCRIPTION_LEN,
  PSEUDO_RE,
  EMAIL_RE,
  STUDENT_ROLE_SLUG_RE,
  RESERVED_ROLE_SLUGS,
  reservedRoleSlugError,
  PROFILE_PATCH_KEYS,
  isStaffRoleSlug,
  canConfigureStudentTierForumContext,
  normalizeEmail,
  jsonTextField,
  normalizeRoleEmoji,
  parseOptionalNonNegativeInt,
  parseOptionalMaxConcurrentTasks,
} = require('../lib/rbacRouteHelpers');

describe('rbacRouteHelpers (logique pure de routes/rbac.js, sans DB)', () => {
  it('constantes : MAX_DESCRIPTION_LEN et expressions régulières inchangées', () => {
    assert.equal(MAX_DESCRIPTION_LEN, 300);
    assert.ok(PSEUDO_RE.test('abc_123.x-y'));
    assert.ok(!PSEUDO_RE.test('ab'));
    assert.ok(!PSEUDO_RE.test('a'.repeat(31)));
    assert.ok(!PSEUDO_RE.test('avec espace'));
    assert.ok(EMAIL_RE.test('a.b@exemple.fr'));
    assert.ok(!EMAIL_RE.test('pas-un-email'));
    assert.ok(STUDENT_ROLE_SLUG_RE.test('eleve_novice'));
    assert.ok(STUDENT_ROLE_SLUG_RE.test('ELEVE_custom'));
    assert.ok(!STUDENT_ROLE_SLUG_RE.test('prof'));
  });

  it('RESERVED_ROLE_SLUGS : les 6 slugs système exacts', () => {
    assert.deepEqual(
      [...RESERVED_ROLE_SLUGS].sort(),
      ['admin', 'eleve_avance', 'eleve_chevronne', 'eleve_novice', 'prof', 'visiteur']
    );
  });

  it('reservedRoleSlugError : message pour un slug réservé (casse / espaces ignorés)', () => {
    for (const slug of ['admin', 'PROF', '  visiteur ', 'eleve_novice']) {
      const msg = reservedRoleSlugError(slug);
      assert.equal(typeof msg, 'string');
      assert.match(msg, /réservé au système/);
    }
  });

  it('reservedRoleSlugError : null pour un slug libre, vide ou null', () => {
    assert.equal(reservedRoleSlugError('prof_delegue'), null);
    assert.equal(reservedRoleSlugError('eleve_perso'), null);
    assert.equal(reservedRoleSlugError(''), null);
    assert.equal(reservedRoleSlugError(null), null);
    assert.equal(reservedRoleSlugError(undefined), null);
  });

  it('PROFILE_PATCH_KEYS : clés snake_case et alias camelCase reconnus', () => {
    for (const key of [
      'display_name', 'rank', 'emoji', 'min_done_tasks', 'display_order',
      'forum_participate', 'forumParticipate',
      'context_comment_participate', 'contextCommentParticipate',
      'max_concurrent_tasks', 'maxConcurrentTasks',
    ]) {
      assert.ok(PROFILE_PATCH_KEYS.has(key), `clé manquante : ${key}`);
    }
    assert.ok(!PROFILE_PATCH_KEYS.has('slug'));
    assert.ok(!PROFILE_PATCH_KEYS.has('is_system'));
  });

  it('isStaffRoleSlug : admin/prof/visiteur (trim + casse), refus du reste', () => {
    assert.equal(isStaffRoleSlug('admin'), true);
    assert.equal(isStaffRoleSlug(' PROF '), true);
    assert.equal(isStaffRoleSlug('Visiteur'), true);
    assert.equal(isStaffRoleSlug('eleve_novice'), false);
    assert.equal(isStaffRoleSlug(''), false);
    assert.equal(isStaffRoleSlug(null), false);
  });

  it('canConfigureStudentTierForumContext : staff exclu même avec rang faible', () => {
    assert.equal(canConfigureStudentTierForumContext('admin', 10), false);
    assert.equal(canConfigureStudentTierForumContext('prof', 0), false);
    assert.equal(canConfigureStudentTierForumContext('visiteur', 1), false);
  });

  it('canConfigureStudentTierForumContext : slug eleve_* accepté quel que soit le rang', () => {
    assert.equal(canConfigureStudentTierForumContext('eleve_novice', 9999), true);
    assert.equal(canConfigureStudentTierForumContext('eleve_perso', null), true);
  });

  it('canConfigureStudentTierForumContext : palier personnalisé selon rang < 400', () => {
    assert.equal(canConfigureStudentTierForumContext('palier_perso', 399), true);
    assert.equal(canConfigureStudentTierForumContext('palier_perso', 400), false);
    assert.equal(canConfigureStudentTierForumContext('palier_perso', 'abc'), false);
    // Number(null) === 0 : un rang null est traité comme 0, donc < 400.
    assert.equal(canConfigureStudentTierForumContext('palier_perso', null), true);
  });

  it('normalizeEmail : trim + minuscules, null si vide', () => {
    assert.equal(normalizeEmail('  A.B@Exemple.FR  '), 'a.b@exemple.fr');
    assert.equal(normalizeEmail(''), null);
    assert.equal(normalizeEmail('   '), null);
    assert.equal(normalizeEmail(null), null);
    assert.equal(normalizeEmail(undefined), null);
  });

  it('jsonTextField : null/Buffer/chaîne vide/valeurs scalaires', () => {
    assert.equal(jsonTextField(null), null);
    assert.equal(jsonTextField(undefined), null);
    assert.equal(jsonTextField(Buffer.from('été', 'utf8')), 'été');
    assert.equal(jsonTextField(''), null);
    assert.equal(jsonTextField('abc'), 'abc');
    assert.equal(jsonTextField(42), '42');
  });

  it('normalizeRoleEmoji : trim, null si vide, tronqué à 16 caractères', () => {
    assert.equal(normalizeRoleEmoji(' 🌲 '), '🌲');
    assert.equal(normalizeRoleEmoji(''), null);
    assert.equal(normalizeRoleEmoji('   '), null);
    assert.equal(normalizeRoleEmoji(null), null);
    assert.equal(normalizeRoleEmoji('x'.repeat(40)), 'x'.repeat(16));
  });

  it('parseOptionalNonNegativeInt : fallback sur null/vide, NaN si invalide ou négatif', () => {
    assert.equal(parseOptionalNonNegativeInt(null), null);
    assert.equal(parseOptionalNonNegativeInt('', 7), 7);
    assert.equal(parseOptionalNonNegativeInt(undefined, 0), 0);
    assert.equal(parseOptionalNonNegativeInt('12'), 12);
    assert.equal(parseOptionalNonNegativeInt(0), 0);
    assert.ok(Number.isNaN(parseOptionalNonNegativeInt('-1')));
    assert.ok(Number.isNaN(parseOptionalNonNegativeInt('abc')));
  });

  it('parseOptionalMaxConcurrentTasks : undefined passe-plat, null/vide → null (hériter)', () => {
    assert.equal(parseOptionalMaxConcurrentTasks(undefined), undefined);
    assert.equal(parseOptionalMaxConcurrentTasks(null), null);
    assert.equal(parseOptionalMaxConcurrentTasks(''), null);
  });

  it('parseOptionalMaxConcurrentTasks : bornes 0–99, NaN au-delà ou invalide', () => {
    assert.equal(parseOptionalMaxConcurrentTasks(0), 0);
    assert.equal(parseOptionalMaxConcurrentTasks('99'), 99);
    assert.equal(parseOptionalMaxConcurrentTasks('5'), 5);
    assert.ok(Number.isNaN(parseOptionalMaxConcurrentTasks(100)));
    assert.ok(Number.isNaN(parseOptionalMaxConcurrentTasks(-1)));
    assert.ok(Number.isNaN(parseOptionalMaxConcurrentTasks('abc')));
  });
});
