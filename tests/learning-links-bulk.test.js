'use strict';

// Approbation en lot des rattachements et garde-fou de type (module commun aux deux produits).
//
// Deux constats d'usage que ces tests verrouillent :
//   - le rattachement automatique insère en `status = 'suggested'`, que le conditionnement
//     n'accepte pas : sans approbation groupée, l'écran produisait des liens que rien
//     n'activait jamais ;
//   - un lien BLOQUANT sur un type que le produit ne sait pas valider restait inerte pour
//     toujours, sans un mot — le professeur croyait avoir conditionné la fiche.

require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const bulk = require('../lib/learningLinksBulk');

/** Faux `execute` qui enregistre la requête au lieu de l'exécuter. */
function recorder(affectedRows = 0) {
  const calls = [];
  return {
    calls,
    db: {
      execute: async (sql, params) => {
        calls.push({ sql, params });
        return { affectedRows };
      },
    },
  };
}

test('isMarkableResourceType distingue les types réellement validables', () => {
  assert.equal(bulk.isMarkableResourceType('fm', 'tutorial'), true);
  assert.equal(bulk.isMarkableResourceType('fm', 'plant'), true);
  // Le glossaire est LIABLE côté ForetMap, mais pas validable : aucun bouton « marquer »
  // ne l'accompagne, donc aucun conditionnement ne peut s'y appliquer.
  assert.equal(bulk.isMarkableResourceType('fm', 'glossary'), false);
  assert.equal(bulk.isMarkableResourceType('gl', 'glossary'), true, 'G&L, lui, sait le valider');
  assert.equal(bulk.isMarkableResourceType('gl', 'species'), true);
});

test('le message de refus dit ce qui manque, pas seulement que c’est interdit', () => {
  const msg = bulk.nonMarkableGatingError('fm', 'glossary');
  assert.match(msg, /glossary/);
  assert.match(msg, /tutorial/, 'les types acceptés doivent être nommés');
  assert.match(msg, /non bloquant/, 'l’issue possible doit être dite');
});

test('review par identifiants : agit sur les lignes désignées, quel que soit leur statut', async () => {
  const { calls, db } = recorder(3);
  const res = await bulk.reviewSuggestedLinks(db, {
    product: 'fm',
    status: 'approved',
    ids: [4, 5, 6],
  });
  assert.equal(res.updated, 3);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /resource_question_links/);
  assert.doesNotMatch(
    calls[0].sql,
    /status = 'suggested'/,
    'forme historique : pas de filtre de statut',
  );
  assert.deepEqual(calls[0].params, ['approved', 4, 5, 6]);
});

test('review par ressource : ne touche QUE les propositions', async () => {
  const { calls, db } = recorder(7);
  const res = await bulk.reviewSuggestedLinks(db, {
    product: 'fm',
    status: 'approved',
    resourceType: 'tutorial',
    resourceRef: '16',
  });
  assert.equal(res.updated, 7);
  assert.match(calls[0].sql, /status = 'suggested'/);
  assert.deepEqual(calls[0].params, ['approved', 'tutorial', '16']);
});

test('review côté GL vise la table GL', async () => {
  const { calls, db } = recorder(1);
  await bulk.reviewSuggestedLinks(db, {
    product: 'gl',
    status: 'rejected',
    resourceType: 'species',
    resourceRef: 'SP1',
  });
  assert.match(calls[0].sql, /gl_resource_question_links/);
  assert.equal(calls[0].params[0], 'rejected');
});

test('review : entrées inexploitables ne déclenchent aucune écriture', async () => {
  const { calls, db } = recorder(9);
  assert.deepEqual(await bulk.reviewSuggestedLinks(db, { product: 'fm', status: 'bidon' }), {
    updated: 0,
  });
  assert.deepEqual(await bulk.reviewSuggestedLinks(db, { product: 'fm', status: 'approved' }), {
    updated: 0,
  });
  assert.equal(calls.length, 0, 'aucune requête ne doit partir');
});

test('review : le lot est borné (garde-fou de charge)', async () => {
  const { calls, db } = recorder(1);
  const ids = Array.from({ length: bulk.BULK_MAX + 50 }, (_, i) => i + 1);
  await bulk.reviewSuggestedLinks(db, { product: 'fm', status: 'approved', ids });
  assert.equal(calls[0].params.length, bulk.BULK_MAX + 1, 'statut + BULK_MAX identifiants');
});
