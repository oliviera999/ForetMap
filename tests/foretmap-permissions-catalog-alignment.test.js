'use strict';

/**
 * Gel des matrices ForetMap admin / prof / prof_classe (aligné sur
 * tests/gl-permissions-catalog-alignment.test.js pour GL).
 */

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { ROLE_PERMISSION_MATRIX, PERMISSIONS } = require('../lib/rbac');

const catalogKeys = new Set(PERMISSIONS.map((row) => row[0]));

describe('Permissions ForetMap : matrices catalogue', () => {
  it('chaque clé de matrice figure au catalogue', () => {
    for (const [role, keys] of Object.entries(ROLE_PERMISSION_MATRIX)) {
      if (String(role).startsWith('gl_')) continue;
      for (const key of keys) {
        assert.ok(catalogKeys.has(key), `${role} → ${key} absent du catalogue`);
      }
    }
  });

  it('admin a media.manage et integrations.moodle.manage', () => {
    assert.ok(ROLE_PERMISSION_MATRIX.admin.includes('media.manage'));
    assert.ok(ROLE_PERMISSION_MATRIX.admin.includes('integrations.moodle.manage'));
    assert.ok(ROLE_PERMISSION_MATRIX.admin.includes('admin.impersonate'));
  });

  it('prof (n3boss) a media.manage et forum.group.moderate, pas admin.impersonate', () => {
    assert.ok(ROLE_PERMISSION_MATRIX.prof.includes('media.manage'));
    assert.ok(ROLE_PERMISSION_MATRIX.prof.includes('forum.group.moderate'));
    assert.ok(!ROLE_PERMISSION_MATRIX.prof.includes('admin.impersonate'));
    assert.ok(ROLE_PERMISSION_MATRIX.prof.includes('stats.read.all'));
  });

  it('prof_classe : socle tuteur sans tâches ni vue globale ni création comptes', () => {
    const keys = ROLE_PERMISSION_MATRIX.prof_classe;
    assert.deepEqual(
      [...keys].sort(),
      [
        'groups.manage',
        'groups.read',
        'observations.read.group',
        'stats.read.group',
        'teacher.access',
      ].sort(),
    );
    assert.ok(!keys.includes('users.create'));
    assert.ok(!keys.includes('students.import'));
    assert.ok(!keys.includes('tasks.manage'));
    assert.ok(!keys.includes('stats.read.all'));
    assert.ok(!keys.includes('zones.manage'));
    assert.ok(!keys.includes('visit.manage'));
  });

  it('visiteur et personnel : aucune permission d’action', () => {
    assert.deepEqual(ROLE_PERMISSION_MATRIX.visiteur, []);
    assert.deepEqual(ROLE_PERMISSION_MATRIX.personnel, []);
  });
});
