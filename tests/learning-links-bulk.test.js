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
  // Le glossaire ForetMap se valide depuis la migration 201 (« j'ai appris ce terme ») :
  // un lien bloquant y a donc enfin un sens. Il ne l'avait pas avant.
  assert.equal(bulk.isMarkableResourceType('fm', 'glossary'), true);
  assert.equal(bulk.isMarkableResourceType('gl', 'glossary'), true);
  assert.equal(bulk.isMarkableResourceType('gl', 'species'), true);
  // Le contrôle reste utile comme INVARIANT : un type sans geste de validation doit être
  // refusé le jour où quelqu'un en ajoute un, sans quoi on retombe dans l'impasse.
  assert.equal(bulk.isMarkableResourceType('fm', 'feuillet'), false, 'type inconnu de ForetMap');
  assert.equal(bulk.isMarkableResourceType('fm', ''), false);
});

test('le message de refus dit ce qui manque, pas seulement que c’est interdit', () => {
  const msg = bulk.nonMarkableGatingError('fm', 'feuillet');
  assert.match(msg, /feuillet/);
  assert.match(msg, /tutorial/, 'les types acceptés doivent être nommés');
  assert.match(msg, /glossary/, 'le glossaire fait maintenant partie des validables');
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

// ---------------------------------------------------------------------------
// setLinksGating — « rendre bloquant » en lot (docs/AUDIT_VALIDATION_QUIZ_2026-09.md, lot 4).
// ---------------------------------------------------------------------------

test('gating par ressource : ne touche que les liens APPROUVÉS, et seulement ceux qui changent', async () => {
  const { calls, db } = recorder(2);
  const res = await bulk.setLinksGating(db, {
    product: 'fm',
    isGating: true,
    resourceType: 'tutorial',
    resourceRef: '12',
  });
  assert.equal(res.ok, true);
  assert.equal(res.updated, 2);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /resource_question_links/);
  assert.match(calls[0].sql, /status = 'approved'/);
  assert.deepEqual(calls[0].params, [1, 'tutorial', '12', 1]);
});

test('gating par ressource : refuse de rendre bloquant un type non validable', async () => {
  const { calls, db } = recorder(1);
  const res = await bulk.setLinksGating(db, {
    product: 'fm',
    isGating: true,
    resourceType: 'feuillet',
    resourceRef: 'F1',
  });
  assert.equal(res.ok, false);
  assert.match(res.error, /validation de lecture/);
  assert.equal(calls.length, 0, 'aucune écriture');
});

test('gating par identifiants : le type validable est vérifié en SQL, ligne par ligne', async () => {
  const { calls, db } = recorder(3);
  const res = await bulk.setLinksGating(db, { product: 'gl', isGating: true, ids: [1, 2, 3] });
  assert.equal(res.updated, 3);
  assert.match(calls[0].sql, /gl_resource_question_links/);
  assert.match(calls[0].sql, /resource_type IN \(/, 'garde-fou des types validables');
  assert.deepEqual(calls[0].params.slice(0, 4), [1, 1, 2, 3]);
});

test('gating par identifiants, vers non bloquant : aucun garde-fou de type nécessaire', async () => {
  const { calls, db } = recorder(1);
  await bulk.setLinksGating(db, { product: 'fm', isGating: false, ids: [7] });
  assert.doesNotMatch(calls[0].sql, /resource_type IN/);
  assert.deepEqual(calls[0].params, [0, 7]);
});

test('gating : le lot est borné et les entrées vides n’écrivent rien', async () => {
  const { calls, db } = recorder(0);
  const many = Array.from({ length: bulk.BULK_MAX + 50 }, (_, i) => i + 1);
  await bulk.setLinksGating(db, { product: 'fm', isGating: true, ids: many });
  assert.equal(calls[0].params.filter((p) => typeof p === 'number').length - 1, bulk.BULK_MAX);
  const empty = await bulk.setLinksGating(db, { product: 'fm', isGating: true });
  assert.equal(empty.updated, 0);
  assert.equal(calls.length, 1);
});
