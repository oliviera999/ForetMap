import { describe, expect, it } from 'vitest';

import {
  N3BEUR_RANK_EXCLUSIVE_MAX,
  isEleveRoleSlug,
  isGroupPromotableRoleSlug,
  isN3beurAccount,
  isN3beurRole,
} from '../../src/shared/n3beurRolesCore.js';

describe('isN3beurRole', () => {
  it('paliers système eleve_* : n3beurs', () => {
    expect(isN3beurRole({ slug: 'eleve_novice', rank: 100 })).toBe(true);
    expect(isN3beurRole({ slug: 'eleve_avance', rank: 200 })).toBe(true);
    expect(isN3beurRole('eleve_chevronne')).toBe(true);
  });

  it('encadrement et profils en lecture seule : jamais n3beurs', () => {
    for (const slug of ['admin', 'prof', 'prof_classe', 'visiteur', 'personnel']) {
      expect(isN3beurRole({ slug, rank: 350 })).toBe(false);
    }
  });

  it('profils du sous-produit GL : jamais n3beurs', () => {
    expect(isN3beurRole({ slug: 'gl_player', rank: 120 })).toBe(false);
    expect(isN3beurRole({ slug: 'gl_observateur', rank: 60 })).toBe(false);
  });

  it('profil personnalisé : n3beur sous le rang de l’encadrement', () => {
    expect(isN3beurRole({ slug: 'jardinier', rank: 300 })).toBe(true);
    expect(isN3beurRole({ slug: 'jardinier', rank: N3BEUR_RANK_EXCLUSIVE_MAX })).toBe(false);
    expect(isN3beurRole({ slug: 'jardinier', rank: 500 })).toBe(false);
  });

  it('profil inconnu sans rang exploitable : exclu (on ne devine pas)', () => {
    expect(isN3beurRole({ slug: 'jardinier' })).toBe(false);
    expect(isN3beurRole({ slug: 'jardinier', rank: 'x' })).toBe(false);
    expect(isN3beurRole({ slug: '', rank: 100 })).toBe(false);
    expect(isN3beurRole(null)).toBe(false);
  });

  it('accepte les alias de colonnes des lignes SQL', () => {
    expect(isN3beurRole({ role_slug: 'eleve_novice' })).toBe(true);
    expect(isN3beurRole({ primary_role_slug: 'visiteur' })).toBe(false);
    expect(isN3beurRole({ primary_role_slug: 'jardinier', primary_role_rank: 150 })).toBe(true);
  });
});

describe('isEleveRoleSlug', () => {
  it('reconnaît les paliers système, insensible à la casse et aux espaces', () => {
    expect(isEleveRoleSlug(' Eleve_Novice ')).toBe(true);
    expect(isEleveRoleSlug('visiteur')).toBe(false);
    expect(isEleveRoleSlug(null)).toBe(false);
  });
});

describe('isGroupPromotableRoleSlug', () => {
  it('profil absent ou lecture seule : promu par un groupe n3beur', () => {
    expect(isGroupPromotableRoleSlug(null)).toBe(true);
    expect(isGroupPromotableRoleSlug('visiteur')).toBe(true);
    expect(isGroupPromotableRoleSlug('personnel')).toBe(true);
  });

  it('encadrement et profils personnalisés : préservés, donc non promus', () => {
    expect(isGroupPromotableRoleSlug('prof_classe')).toBe(false);
    expect(isGroupPromotableRoleSlug('prof')).toBe(false);
    expect(isGroupPromotableRoleSlug('jardinier')).toBe(false);
  });
});

describe('isN3beurAccount', () => {
  it('profil n3beur : n3beur, avec ou sans groupe', () => {
    expect(isN3beurAccount({ role: { slug: 'eleve_novice' } })).toBe(true);
    expect(isN3beurAccount({ role: { slug: 'eleve_novice' }, inN3beurGroup: true })).toBe(true);
  });

  it('profil encore « visiteur » mais membre d’un groupe n3beur : n3beur', () => {
    expect(isN3beurAccount({ role: { slug: 'visiteur' }, inN3beurGroup: true })).toBe(true);
    expect(isN3beurAccount({ role: null, inN3beurGroup: true })).toBe(true);
  });

  it('visiteur hors groupe n3beur : exclu', () => {
    expect(isN3beurAccount({ role: { slug: 'visiteur' }, inN3beurGroup: false })).toBe(false);
    expect(isN3beurAccount({})).toBe(false);
  });

  it('prof de classe rattaché à une classe n3beur : toujours exclu', () => {
    expect(isN3beurAccount({ role: { slug: 'prof_classe', rank: 350 }, inN3beurGroup: true })).toBe(
      false,
    );
  });
});
