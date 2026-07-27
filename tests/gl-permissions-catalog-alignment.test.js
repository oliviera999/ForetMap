'use strict';

/**
 * Garde-fou audit B6 : la liste de permissions inscrite dans le JWT GL à l'émission
 * (`getGlRolePermissions`) doit rester alignée sur le catalogue RBAC partagé
 * (`ROLE_PERMISSION_MATRIX`), qui fait désormais seul autorité à chaque requête.
 *
 * Une divergence ne crée plus de faille (les droits effectifs sont recalculés côté serveur),
 * mais afficherait à l'utilisateur des permissions qu'il n'a pas — ou l'inverse. Ce test
 * transforme ce risque de dérive silencieuse en échec visible.
 */

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { getGlRolePermissions } = require('../lib/gl/authRouteHelpers');
const { ROLE_PERMISSION_MATRIX } = require('../lib/rbac');

describe('Permissions GL : jeton émis vs catalogue RBAC', () => {
  it('admin → gl_admin', () => {
    assert.deepEqual(
      [...getGlRolePermissions('admin')].sort(),
      [...ROLE_PERMISSION_MATRIX.gl_admin].sort(),
    );
  });

  it('mj → gl_mj', () => {
    assert.deepEqual(
      [...getGlRolePermissions('mj')].sort(),
      [...ROLE_PERMISSION_MATRIX.gl_mj].sort(),
    );
  });

  it('joueur → gl_player', () => {
    assert.deepEqual(
      [...getGlRolePermissions('player')].sort(),
      [...ROLE_PERMISSION_MATRIX.gl_player].sort(),
    );
  });

  it('le MJ n’a pas gl.settings.manage, l’admin oui', () => {
    assert.ok(!ROLE_PERMISSION_MATRIX.gl_mj.includes('gl.settings.manage'));
    assert.ok(ROLE_PERMISSION_MATRIX.gl_admin.includes('gl.settings.manage'));
  });

  it('l’invité (gl_observateur) est en lecture seule', () => {
    assert.deepEqual([...ROLE_PERMISSION_MATRIX.gl_observateur], ['gl.read']);
  });
});
