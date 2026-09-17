'use strict';

/**
 * Gel des matrices ForetMap admin / prof / prof_classe (aligné sur
 * tests/gl-permissions-catalog-alignment.test.js pour GL).
 */

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { ROLE_PERMISSION_MATRIX, PERMISSIONS } = require('../lib/rbac');
const { TEACHER_ACCESS_LOCKED_ROLE_SLUGS } = require('../lib/rbacRouteHelpers');

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

  it('admin a admin.settings.read/write et tours.manage', () => {
    assert.ok(ROLE_PERMISSION_MATRIX.admin.includes('admin.settings.read'));
    assert.ok(ROLE_PERMISSION_MATRIX.admin.includes('admin.settings.write'));
    assert.ok(ROLE_PERMISSION_MATRIX.admin.includes('tours.manage'));
  });

  it('prof (n3boss) a media.manage et forum.group.moderate, pas admin.impersonate', () => {
    assert.ok(ROLE_PERMISSION_MATRIX.prof.includes('media.manage'));
    assert.ok(ROLE_PERMISSION_MATRIX.prof.includes('forum.group.moderate'));
    assert.ok(!ROLE_PERMISSION_MATRIX.prof.includes('admin.impersonate'));
    assert.ok(ROLE_PERMISSION_MATRIX.prof.includes('stats.read.all'));
  });

  it('prof a zones.manage mais pas admin.settings.read', () => {
    assert.ok(ROLE_PERMISSION_MATRIX.prof.includes('zones.manage'));
    assert.ok(!ROLE_PERMISSION_MATRIX.prof.includes('admin.settings.read'));
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
        // Plan des personnels : un prof de classe est un personnel du lycée, il y entre.
        'staff_plan.access',
      ].sort(),
    );
    assert.ok(!keys.includes('users.create'));
    assert.ok(!keys.includes('students.import'));
    assert.ok(!keys.includes('tasks.manage'));
    assert.ok(!keys.includes('stats.read.all'));
    assert.ok(!keys.includes('zones.manage'));
    assert.ok(!keys.includes('visit.manage'));
  });

  it('visiteur : aucune permission ; personnel : la seule lecture du plan des personnels', () => {
    assert.deepEqual(ROLE_PERMISSION_MATRIX.visiteur, []);
    // `personnel` reste sans aucune action métier — `staff_plan.access` n'ouvre qu'une
    // lecture, celle du sous-domaine proflyautey, et c'est le profil qu'il vise.
    assert.deepEqual(ROLE_PERMISSION_MATRIX.personnel, ['staff_plan.access']);
  });

  /**
   * `teacher.access` est la porte d'entrée API des comptes sans fiche n3beur. La console
   * refuse de la retirer aux profils de `TEACHER_ACCESS_LOCKED_ROLE_SLUGS` ; cette liste
   * doit rester exactement celle des profils système dont la matrice la porte, sinon un
   * profil ajouté plus tard serait de nouveau « décochable » jusqu'au verrouillage total.
   */
  it('verrou teacher.access : la liste couvre exactement les profils système concernés', () => {
    const fromMatrix = Object.entries(ROLE_PERMISSION_MATRIX)
      .filter(([, keys]) => keys.includes('teacher.access'))
      .map(([slug]) => slug)
      .sort();
    assert.deepEqual([...TEACHER_ACCESS_LOCKED_ROLE_SLUGS].sort(), fromMatrix);
    assert.deepEqual(fromMatrix, ['admin', 'prof', 'prof_classe']);
  });
});
