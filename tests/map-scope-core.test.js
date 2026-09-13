'use strict';

/**
 * Cœur du périmètre cartes (`lib/shared/mapScopeCore.js`) — décisions pures, sans base.
 *
 * Le dernier bloc vérifie l'**équivalence du miroir** : la règle d'affiliation est écrite
 * deux fois (CJS pour le serveur, ESM pour le bundle Vite) et les deux doivent trancher à
 * l'identique, sinon une carte masquée dans l'UI resterait lisible par l'API.
 */

require('./helpers/setup');
const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');

const {
  allowedMapIdsFromAffiliation,
  intersectMapScopes,
  canBypassMapScope,
  resolveGroupMapScope,
} = require('../lib/shared/mapScopeCore');

/** Raccourci : construit les arguments de `resolveGroupMapScope`. */
function scopeOf(directGroupIds, groups, scopePairs) {
  const scopesByGroup = new Map();
  for (const [groupId, mapIds] of scopePairs) scopesByGroup.set(groupId, mapIds);
  return resolveGroupMapScope({ directGroupIds, groups, scopesByGroup });
}

describe('mapScopeCore — périmètre de groupe', () => {
  const groups = [
    { id: 'lycee', parent_group_id: null },
    { id: '2nde3', parent_group_id: 'lycee' },
    { id: 'equipe-a', parent_group_id: '2nde3' },
    { id: 'club', parent_group_id: null },
  ];

  it('ne borne rien pour un compte sans groupe', () => {
    assert.strictEqual(scopeOf([], groups, []), null);
  });

  it('ne borne rien quand aucun groupe ne déclare de périmètre', () => {
    assert.strictEqual(scopeOf(['2nde3'], groups, []), null);
  });

  it('applique le périmètre du groupe direct', () => {
    assert.deepStrictEqual(scopeOf(['2nde3'], groups, [['2nde3', ['foret']]]), ['foret']);
  });

  it("hérite du périmètre de l'ancêtre le plus proche", () => {
    assert.deepStrictEqual(scopeOf(['equipe-a'], groups, [['lycee', ['n3']]]), ['n3']);
  });

  it("un sous-groupe qui déclare son périmètre n'est pas élargi par son parent", () => {
    const scope = scopeOf(['equipe-a'], groups, [
      ['lycee', ['foret', 'n3']],
      ['equipe-a', ['n3']],
    ]);
    assert.deepStrictEqual(scope, ['n3']);
  });

  it('additionne les périmètres de plusieurs appartenances', () => {
    const scope = scopeOf(['2nde3', 'club'], groups, [
      ['2nde3', ['foret']],
      ['club', ['n3']],
    ]);
    assert.deepStrictEqual([...scope].sort(), ['foret', 'n3']);
  });

  it('un seul groupe sans périmètre suffit à ne rien borner', () => {
    // Règle reprise de lib/groupScope.js : un groupe sans périmètre n'est pas borné, et les
    // appartenances s'additionnent — le club ouvert élargit donc la classe bornée.
    assert.strictEqual(scopeOf(['2nde3', 'club'], groups, [['2nde3', ['foret']]]), null);
  });

  it('ne boucle pas sur une parenté circulaire', () => {
    const cyclic = [
      { id: 'a', parent_group_id: 'b' },
      { id: 'b', parent_group_id: 'a' },
    ];
    assert.strictEqual(scopeOf(['a'], cyclic, []), null);
    assert.deepStrictEqual(scopeOf(['a'], cyclic, [['b', ['foret']]]), ['foret']);
  });

  it('ignore les identifiants vides et dédoublonne', () => {
    const scope = scopeOf(['2nde3', '  ', '2nde3'], groups, [
      ['2nde3', ['foret', 'foret', '', null]],
    ]);
    assert.deepStrictEqual(scope, ['foret']);
  });
});

describe('mapScopeCore — combinaison et dérogations', () => {
  it('traite `null` comme élément neutre de l’intersection', () => {
    assert.strictEqual(intersectMapScopes(null, null), null);
    assert.deepStrictEqual(intersectMapScopes(null, ['n3']), ['n3']);
    assert.deepStrictEqual(intersectMapScopes(['n3'], null), ['n3']);
  });

  it('intersecte deux périmètres et conserve une intersection vide', () => {
    assert.deepStrictEqual(intersectMapScopes(['foret', 'n3'], ['n3']), ['n3']);
    assert.deepStrictEqual(intersectMapScopes(['foret'], ['n3']), []);
  });

  it('ne borne ni les lectures sans session, ni les profs, ni les admins', () => {
    assert.strictEqual(canBypassMapScope(null), true);
    assert.strictEqual(canBypassMapScope({ userId: '' }), true);
    assert.strictEqual(canBypassMapScope({ userId: 'u1', permissions: ['teacher.access'] }), true);
    assert.strictEqual(canBypassMapScope({ userId: 'u1', roleSlug: 'admin' }), true);
  });

  it('borne un élève', () => {
    assert.strictEqual(
      canBypassMapScope({ userId: 'u1', roleSlug: 'eleve_novice', permissions: ['tasks.read'] }),
      false,
    );
  });
});

describe('mapScopeCore — affiliation (miroir du module front)', () => {
  let frontImpl;

  before(async () => {
    const mod = await import(pathToFileURL(join(__dirname, '../src/utils/mapAffiliation.js')).href);
    frontImpl = mod.allowedMapIdsFromAffiliation;
  });

  const CASES = [
    undefined,
    null,
    '',
    'both',
    'BOTH',
    'n3',
    'foret',
    'potager',
    'Potager',
    'plan-2',
    'espace inconnu',
    'a'.repeat(40),
  ];

  it('rend les mêmes décisions que src/utils/mapAffiliation.js', () => {
    for (const value of CASES) {
      assert.deepStrictEqual(
        allowedMapIdsFromAffiliation(value),
        frontImpl(value),
        `affiliation « ${String(value)} »`,
      );
    }
  });

  it('ne borne pas « both » et borne un slug de carte', () => {
    assert.strictEqual(allowedMapIdsFromAffiliation('both'), null);
    assert.deepStrictEqual(allowedMapIdsFromAffiliation('n3'), ['n3']);
    assert.deepStrictEqual(allowedMapIdsFromAffiliation('potager'), ['potager']);
  });
});
