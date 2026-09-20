'use strict';

/**
 * Non-régression : `passwordMustReset` des joueurs GL est relu en base à chaque
 * hydratation (même contrat que les permissions B6). Un JWT encore marqué
 * `passwordMustReset:true` après un change-password réussi (DB=0) ne doit plus
 * bloquer la session — `hydrateGlAuthFromClaims` propage `identity.passwordMustReset`.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadGlIdentity } = require('../lib/auth/glHydration');

describe('loadGlIdentity — passwordMustReset depuis la base', () => {
  it('expose passwordMustReset=false quand password_must_reset=0 (claim JWT ignoré)', async () => {
    const identity = await loadGlIdentity(
      { userType: 'gl_player', userId: '42', passwordMustReset: true },
      {
        queryOne: async (sql) => {
          assert.match(String(sql), /password_must_reset/i);
          return {
            id: 42,
            class_id: 1,
            team_id: null,
            is_active: 1,
            password_must_reset: 0,
          };
        },
      },
    );
    assert.ok(identity);
    assert.equal(identity.passwordMustReset, false);
  });

  it('expose passwordMustReset=true quand password_must_reset=1', async () => {
    const identity = await loadGlIdentity(
      { userType: 'gl_player', userId: '7', passwordMustReset: false },
      {
        queryOne: async () => ({
          id: 7,
          class_id: null,
          team_id: null,
          is_active: 1,
          password_must_reset: 1,
        }),
      },
    );
    assert.ok(identity);
    assert.equal(identity.passwordMustReset, true);
  });

  it('ne sélectionne pas password_must_reset pour un admin', async () => {
    let sawPasswordColumn = false;
    const identity = await loadGlIdentity(
      { userType: 'gl_admin', userId: '3', passwordMustReset: true },
      {
        queryOne: async (sql) => {
          if (/password_must_reset/i.test(String(sql))) sawPasswordColumn = true;
          return {
            id: 3,
            role: 'admin',
            display_name: 'MJ',
            is_active: 1,
            foretmap_user_id: 't3',
            user_is_active: 1,
            token_epoch: 0,
            teacher_access: 1,
          };
        },
      },
    );
    assert.ok(identity);
    assert.equal(sawPasswordColumn, false);
    assert.equal(identity.passwordMustReset, undefined);
  });

  it('refuse un joueur dont le compte users lié est désactivé ou dont l époque de jeton a changé', async () => {
    const base = { id: 9, class_id: 1, team_id: null, is_active: 1, password_must_reset: 0 };
    const inactive = await loadGlIdentity(
      { userType: 'gl_player', userId: '9' },
      { queryOne: async () => ({ ...base, user_is_active: 0, token_epoch: 0 }) },
    );
    assert.equal(inactive, null);
    const stale = await loadGlIdentity(
      { userType: 'gl_player', userId: '9', tokenEpoch: 1 },
      { queryOne: async () => ({ ...base, user_is_active: 1, token_epoch: 2 }) },
    );
    assert.equal(stale, null);
    const fresh = await loadGlIdentity(
      { userType: 'gl_player', userId: '9', tokenEpoch: 2 },
      { queryOne: async () => ({ ...base, user_is_active: 1, token_epoch: 2 }) },
    );
    assert.ok(fresh);
  });
});

describe('loadGlIdentity — staff GL = enseignant ForetMap (CDG-12)', () => {
  const staff = {
    id: 3,
    role: 'mj',
    display_name: 'MJ',
    is_active: 1,
    foretmap_user_id: 't3',
    user_is_active: 1,
    token_epoch: 0,
    teacher_access: 1,
  };
  const claims = { userType: 'gl_admin', userId: '3' };

  it('accepte encore une ligne gl_admins sans compte lié (données antérieures) ; la connexion la rattache', async () => {
    const identity = await loadGlIdentity(claims, {
      queryOne: async () => ({ ...staff, foretmap_user_id: null, user_is_active: null }),
    });
    assert.equal(identity?.roleSlug, 'gl_mj');
  });

  it('refuse un compte lié qui n’est pas (ou plus) un enseignant', async () => {
    const identity = await loadGlIdentity(claims, {
      queryOne: async () => ({ ...staff, user_is_active: null, teacher_access: null }),
    });
    assert.equal(identity, null);
  });

  it('refuse un enseignant désactivé ou privé de teacher.access', async () => {
    assert.equal(
      await loadGlIdentity(claims, { queryOne: async () => ({ ...staff, user_is_active: 0 }) }),
      null,
    );
    assert.equal(
      await loadGlIdentity(claims, { queryOne: async () => ({ ...staff, teacher_access: null }) }),
      null,
    );
    const ok = await loadGlIdentity(claims, { queryOne: async () => staff });
    assert.equal(ok?.roleSlug, 'gl_mj');
  });
});
