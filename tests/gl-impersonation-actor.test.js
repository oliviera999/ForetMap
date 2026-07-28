'use strict';

/**
 * Tests purs (sans BDD) pour la relecture de l'acteur d'impersonation GL.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { actorStillMayImpersonate } = require('../lib/auth/glHydration');

describe('actorStillMayImpersonate', () => {
  it('autorise sans impersonation', async () => {
    const ok = await actorStillMayImpersonate({ userType: 'gl_player', userId: '1' }, {
      queryOne: async () => {
        throw new Error('ne doit pas interroger la base');
      },
    });
    assert.equal(ok, true);
  });

  it('refuse si l’acteur n’est pas gl_admin', async () => {
    const ok = await actorStillMayImpersonate(
      {
        impersonating: true,
        actorUserType: 'gl_player',
        actorUserId: '9',
      },
      { queryOne: async () => ({ id: 9, role: 'admin', is_active: 1 }) },
    );
    assert.equal(ok, false);
  });

  it('refuse un acteur désactivé', async () => {
    const ok = await actorStillMayImpersonate(
      {
        impersonating: true,
        actorUserType: 'gl_admin',
        actorUserId: '3',
      },
      { queryOne: async () => ({ id: 3, role: 'admin', is_active: 0 }) },
    );
    assert.equal(ok, false);
  });

  it('refuse un acteur introuvable', async () => {
    const ok = await actorStillMayImpersonate(
      {
        impersonating: true,
        actorUserType: 'gl_admin',
        actorUserId: '3',
      },
      { queryOne: async () => null },
    );
    assert.equal(ok, false);
  });

  it('accepte un MJ ou admin actif', async () => {
    const mj = await actorStillMayImpersonate(
      {
        impersonating: true,
        actorUserType: 'gl_admin',
        actorUserId: '3',
      },
      { queryOne: async () => ({ id: 3, role: 'mj', is_active: 1 }) },
    );
    assert.equal(mj, true);
    const admin = await actorStillMayImpersonate(
      {
        impersonating: true,
        actorUserType: 'gl_admin',
        actorUserId: '4',
      },
      { queryOne: async () => ({ id: 4, role: 'admin', is_active: 1 }) },
    );
    assert.equal(admin, true);
  });
});
