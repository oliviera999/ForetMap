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

  it('prof_classe : socle tuteur sans vue globale, sans création de comptes, sans n3boss', () => {
    const keys = ROLE_PERMISSION_MATRIX.prof_classe;
    assert.deepEqual(
      [...keys].sort(),
      [
        'groups.manage',
        'groups.read',
        'observations.read.group',
        'stats.read.group',
        // Plan des personnels : un prof de classe est un personnel du lycée, il y entre.
        'staff_plan.access',
        // Clés d'identification (lot biodiversité 6) : édition pédagogique, sans périmètre jardin.
        'id_keys.manage',
        // Droits de l'apprenant (réalignement du 22/09/2026) — inertes tant que
        // `task_assignments` est centrée sur l'élève, mais présents en base de production.
        'tasks.propose',
        'tasks.assign_self',
        'tasks.unassign_self',
        'tasks.done_self',
      ].sort(),
    );
    assert.ok(!keys.includes('users.create'));
    assert.ok(!keys.includes('students.import'));
    assert.ok(!keys.includes('tasks.manage'));
    assert.ok(!keys.includes('tasks.validate'));
    assert.ok(!keys.includes('stats.read.all'));
    assert.ok(!keys.includes('stats.export'));
    assert.ok(!keys.includes('observations.read.all'));
    assert.ok(!keys.includes('zones.manage'));
    assert.ok(!keys.includes('visit.manage'));
    // Interface de type apprenant : pas la porte n3boss (réalignement du 22/09/2026).
    assert.ok(!keys.includes('teacher.access'));
  });

  it('prof (n3boss) n’administre pas les profils RBAC', () => {
    assert.ok(!ROLE_PERMISSION_MATRIX.prof.includes('admin.roles.manage'));
    assert.ok(ROLE_PERMISSION_MATRIX.admin.includes('admin.roles.manage'));
  });

  it('visiteur : aucune permission ; personnel : la seule lecture du plan des personnels', () => {
    assert.deepEqual(ROLE_PERMISSION_MATRIX.visiteur, []);
    // `personnel` reste sans aucune action métier — `staff_plan.access` n'ouvre qu'une
    // lecture, celle du sous-domaine proflyautey, et c'est le profil qu'il vise.
    assert.deepEqual(ROLE_PERMISSION_MATRIX.personnel, ['staff_plan.access']);
  });

  /**
   * `teacher.access` ouvre l'interface n3boss et une partie des routes de la console. La
   * console refuse de la retirer aux profils de `TEACHER_ACCESS_LOCKED_ROLE_SLUGS` ; cette
   * liste doit rester exactement celle des profils système dont la matrice la porte.
   *
   * Dans les deux sens. Un profil verrouillé dont la matrice ne porterait pas la permission
   * serait **inenregistrable** depuis la console (400 sur tout `PUT .../permissions`) : c'est
   * exactement ce qui est arrivé à « Prof de classe » entre le retrait de la permission en
   * base et ce lot.
   */
  it('verrou teacher.access : la liste couvre exactement les profils système concernés', () => {
    const fromMatrix = Object.entries(ROLE_PERMISSION_MATRIX)
      .filter(([, keys]) => keys.includes('teacher.access'))
      .map(([slug]) => slug)
      .sort();
    assert.deepEqual([...TEACHER_ACCESS_LOCKED_ROLE_SLUGS].sort(), fromMatrix);
    assert.deepEqual(fromMatrix, ['admin', 'prof']);
  });
});
