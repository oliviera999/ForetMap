'use strict';

/**
 * Révocation d'une prise de contrôle GL.
 *
 * `POST /api/gl/admin/impersonate` vérifie que l'acteur est un staff GL actif — mais
 * seulement au moment où il délivre le jeton. Les requêtes suivantes ne relisaient que
 * l'identité du **joueur** contrôlé : un MJ désactivé, supprimé, ou rétrogradé hors du
 * staff gardait donc le contrôle du compte jusqu'à l'expiration du JWT (90 min à 7 jours),
 * alors que ses propres droits, eux, étaient bien révoqués à la requête suivante.
 *
 * Côté ForetMap, `hydrateAuthFromTokenClaims` revérifie `admin.impersonate` à chaque
 * requête : c'est ce contrat qui est repris ici (audit B6).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { actorStillMayImpersonate, hydrateGlAuthFromClaims } = require('../lib/auth/glHydration');

const PLAYER_CLAIMS = {
  product: 'gl',
  userType: 'gl_player',
  userId: '42',
  impersonating: true,
  actorUserType: 'gl_admin',
  actorUserId: '9',
  actorRoleSlug: 'gl_mj',
};

/** `queryOne` factice : répond à la lecture de l'acteur puis à celle du joueur. */
function depsWithActor(actorRow) {
  return {
    queryOne: async (sql) => {
      if (/FROM gl_admins/i.test(String(sql))) return actorRow;
      if (/FROM gl_players/i.test(String(sql))) {
        return { id: 42, class_id: 1, team_id: null, is_active: 1, password_must_reset: 0 };
      }
      return null;
    },
  };
}

describe('actorStillMayImpersonate', () => {
  it('laisse passer une session ordinaire (pas de prise de contrôle)', async () => {
    assert.equal(
      await actorStillMayImpersonate({ userType: 'gl_player' }, depsWithActor(null)),
      true,
    );
  });

  it('accepte un staff GL actif (admin ou mj)', async () => {
    for (const role of ['admin', 'mj', 'MJ']) {
      assert.equal(
        await actorStillMayImpersonate(PLAYER_CLAIMS, depsWithActor({ id: 9, role, is_active: 1 })),
        true,
        `rôle ${role}`,
      );
    }
  });

  it('refuse un acteur désactivé', async () => {
    assert.equal(
      await actorStillMayImpersonate(
        PLAYER_CLAIMS,
        depsWithActor({ id: 9, role: 'mj', is_active: 0 }),
      ),
      false,
    );
  });

  it('refuse un acteur supprimé', async () => {
    assert.equal(await actorStillMayImpersonate(PLAYER_CLAIMS, depsWithActor(null)), false);
  });

  it('refuse un acteur rétrogradé hors du staff', async () => {
    assert.equal(
      await actorStillMayImpersonate(
        PLAYER_CLAIMS,
        depsWithActor({ id: 9, role: 'observateur', is_active: 1 }),
      ),
      false,
    );
  });

  it('refuse des claims d’acteur incomplets ou d’un autre type', async () => {
    assert.equal(
      await actorStillMayImpersonate(
        { ...PLAYER_CLAIMS, actorUserId: null },
        depsWithActor({ id: 9, role: 'mj', is_active: 1 }),
      ),
      false,
    );
    assert.equal(
      await actorStillMayImpersonate(
        { ...PLAYER_CLAIMS, actorUserType: 'teacher' },
        depsWithActor({ id: 9, role: 'mj', is_active: 1 }),
      ),
      false,
    );
  });
});

describe('hydrateGlAuthFromClaims — prise de contrôle', () => {
  it('hydrate normalement tant que l’acteur reste un staff actif', async () => {
    const auth = await hydrateGlAuthFromClaims(
      PLAYER_CLAIMS,
      depsWithActor({ id: 9, role: 'mj', is_active: 1 }),
    );
    assert.ok(auth, 'auth attendue');
    assert.equal(auth.userType, 'gl_player');
    assert.equal(auth.impersonating, true);
    assert.equal(auth.impersonatedBy.userId, '9');
  });

  it('rend null dès que l’acteur est désactivé (session coupée à la requête suivante)', async () => {
    const auth = await hydrateGlAuthFromClaims(
      PLAYER_CLAIMS,
      depsWithActor({ id: 9, role: 'mj', is_active: 0 }),
    );
    assert.equal(auth, null);
  });

  it('n’affecte pas une session de joueur ordinaire', async () => {
    const auth = await hydrateGlAuthFromClaims(
      { product: 'gl', userType: 'gl_player', userId: '42' },
      depsWithActor(null),
    );
    assert.ok(auth, 'auth attendue');
    assert.equal(auth.impersonating, undefined);
  });
});
