'use strict';

// C1 (audit stabilité/perf 2026-09) — `getRoleBySlug` passe par le cache RBAC versionné.
//
// C'était le seul maillon RBAC non caché, et précisément celui qu'emprunte l'hydratation
// GL (`lib/auth/glHydration.js` → `buildAuthzPayloadForRoleSlug` → `getRoleBySlug`) :
// chaque requête GL payait une requête SQL de plus que son équivalent ForetMap.
//
// Vérifié SANS base (stub `require.cache` de database.js) :
//  1. le second appel pour le même slug ne requête pas la base ;
//  2. une écriture RBAC (version bumpée) périme l'entrée ;
//  3. un rôle absent (null) est caché aussi — même sémantique que `getPrimaryRoleForUser`.
const test = require('node:test');
const assert = require('node:assert');

const RELOADED_MODULES = ['../lib/rbac', '../lib/identity', '../lib/settings'];

function loadRbacWithFakeDb() {
  const dbPath = require.resolve('../database');
  const modulePaths = RELOADED_MODULES.map((p) => require.resolve(p));
  const previousDb = require.cache[dbPath];
  const previousModules = modulePaths.map((p) => require.cache[p]);

  const state = {
    rbacVersion: 1,
    roleQueries: 0,
    roles: new Map([
      ['gl_player', { id: 5, slug: 'gl_player', display_name: 'Joueur G&L', rank: 120 }],
    ]),
  };
  const fakeDb = {
    queryOne: async (sql, params = []) => {
      if (/FROM roles WHERE slug = \?/.test(String(sql))) {
        state.roleQueries += 1;
        return state.roles.get(String(params[0])) || null;
      }
      throw new Error(`Requête inattendue : ${sql}`);
    },
    queryAll: async () => [],
    execute: async () => ({ insertId: 0 }),
    getRbacWriteVersion: () => state.rbacVersion,
  };

  for (const p of modulePaths) delete require.cache[p];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };
  const rbac = require('../lib/rbac');

  return {
    rbac,
    state,
    restore() {
      for (const p of modulePaths) delete require.cache[p];
      if (previousDb) require.cache[dbPath] = previousDb;
      else delete require.cache[dbPath];
      modulePaths.forEach((p, i) => {
        if (previousModules[i]) require.cache[p] = previousModules[i];
      });
    },
  };
}

test('getRoleBySlug — le second appel est servi par le cache, sans requête SQL', async () => {
  const ctx = loadRbacWithFakeDb();
  try {
    const first = await ctx.rbac.getRoleBySlug('gl_player');
    assert.strictEqual(first?.id, 5);
    assert.strictEqual(ctx.state.roleQueries, 1);

    const second = await ctx.rbac.getRoleBySlug('gl_player');
    assert.deepStrictEqual(second, first);
    assert.strictEqual(ctx.state.roleQueries, 1, 'le second appel ne doit pas requêter la base');
  } finally {
    ctx.restore();
  }
});

test('getRoleBySlug — une écriture RBAC périme l’entrée (version bumpée)', async () => {
  const ctx = loadRbacWithFakeDb();
  try {
    await ctx.rbac.getRoleBySlug('gl_player');
    assert.strictEqual(ctx.state.roleQueries, 1);

    // Simule une écriture RBAC : database.js incrémente la version à chaque écriture
    // sur roles/user_roles/role_permissions (cf. rbac-write-detection.test.js).
    ctx.state.rbacVersion += 1;
    ctx.state.roles.set('gl_player', {
      id: 5,
      slug: 'gl_player',
      display_name: 'Joueur G&L renommé',
      rank: 120,
    });

    const refreshed = await ctx.rbac.getRoleBySlug('gl_player');
    assert.strictEqual(ctx.state.roleQueries, 2, 'l’entrée périmée doit être rechargée');
    assert.strictEqual(refreshed.display_name, 'Joueur G&L renommé');
  } finally {
    ctx.restore();
  }
});

test('getRoleBySlug — un slug inconnu (null) est caché aussi', async () => {
  const ctx = loadRbacWithFakeDb();
  try {
    assert.strictEqual(await ctx.rbac.getRoleBySlug('inexistant'), null);
    assert.strictEqual(await ctx.rbac.getRoleBySlug('inexistant'), null);
    assert.strictEqual(ctx.state.roleQueries, 1, 'le null doit être caché comme une valeur');
  } finally {
    ctx.restore();
  }
});
