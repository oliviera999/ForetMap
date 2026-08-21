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
          return { id: 3, role: 'admin', display_name: 'MJ', is_active: 1 };
        },
      },
    );
    assert.ok(identity);
    assert.equal(sawPasswordColumn, false);
    assert.equal(identity.passwordMustReset, undefined);
  });
});
