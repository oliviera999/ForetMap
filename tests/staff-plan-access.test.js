'use strict';

/**
 * Porte d'entrée du plan des personnels : liste de profils autorisés et permission RBAC.
 */

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  parseAllowedRoleSlugs,
  formatAllowedRoleSlugs,
  accountMayAccessStaffPlan,
  DEFAULT_ALLOWED_ROLE_SLUGS,
  STAFF_PLAN_PERMISSION,
} = require('../lib/staffPlanAccess');

describe('parseAllowedRoleSlugs / formatAllowedRoleSlugs', () => {
  it('accepte CSV, JSON et ignore les slugs hors catalogue', () => {
    assert.deepEqual(parseAllowedRoleSlugs('admin;personnel'), ['personnel', 'admin']);
    assert.deepEqual(parseAllowedRoleSlugs('["prof","admin"]'), ['prof', 'admin']);
    assert.deepEqual(parseAllowedRoleSlugs('admin,gl_mj,personnel'), ['personnel', 'admin']);
    assert.deepEqual(parseAllowedRoleSlugs(''), []);
    assert.deepEqual(parseAllowedRoleSlugs(null), []);
  });

  it('sérialise en ;-séparé dans l’ordre canonique', () => {
    assert.equal(formatAllowedRoleSlugs(['prof', 'admin', 'personnel']), 'personnel;prof;admin');
    assert.equal(
      formatAllowedRoleSlugs(DEFAULT_ALLOWED_ROLE_SLUGS),
      'personnel;prof_classe;prof;admin',
    );
  });
});

describe('accountMayAccessStaffPlan', () => {
  it('autorise via la liste même sans permission RBAC', () => {
    assert.equal(
      accountMayAccessStaffPlan({ roleSlug: 'eleve_novice', permissions: [] }, ['eleve_novice']),
      true,
    );
  });

  it('autorise via staff_plan.access même hors liste', () => {
    assert.equal(
      accountMayAccessStaffPlan({ roleSlug: 'admin', permissions: [STAFF_PLAN_PERMISSION] }, [
        'personnel',
      ]),
      true,
    );
  });

  it('autorise un profil maison via staff_plan.access', () => {
    assert.equal(
      accountMayAccessStaffPlan(
        { roleSlug: 'vie_scolaire', permissions: [STAFF_PLAN_PERMISSION] },
        ['admin'],
      ),
      true,
    );
  });

  it('refuse sans permission et hors liste', () => {
    assert.equal(
      accountMayAccessStaffPlan({ roleSlug: 'eleve_novice', permissions: [] }, ['admin']),
      false,
    );
  });

  it('refuse sans auth', () => {
    assert.equal(accountMayAccessStaffPlan(null, ['admin']), false);
  });
});
