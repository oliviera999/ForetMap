'use strict';

// Édition d'une question du Quiz : la question et ses liens glossaire par mots-clés sont
// écrits dans UNE transaction (audit du 25/09/2026, § 1.3.3 et § 3.2.3). Avant, une panne
// après la purge des liens (`origin = 'keyword'`) laissait la question à jour et ses
// rattachements effacés. Test sans base : transaction factice avec instantané.

const { test } = require('node:test');
const assert = require('node:assert');
const { upsertQuizQuestionInTransaction } = require('../lib/fmQuizCrud');

const BODY = {
  question_code: 'QF9901',
  categorie_slug: 'vivant_classification',
  numero_dans_categorie: 1,
  question: 'Comment les plantes fabriquent-elles leur matière ?',
  choix_a: 'Photosynthèse',
  choix_b: 'Respiration',
  choix_c: 'Digestion',
  reponse_correcte: 'A',
  niveau: 'college',
  tags: 'photosynthese',
};

function buildStore() {
  return {
    question: { question_code: 'QF9901', question: 'Ancien énoncé' },
    links: [
      { resource_ref: 'GLFM99', origin: 'keyword' },
      { resource_ref: 'GLFM50', origin: 'import' },
    ],
  };
}

function buildDeps(store, { failOnLinkInsert = false } = {}) {
  const calls = [];
  const deps = {
    queryAll: async (sql) => {
      calls.push(sql);
      if (/FROM quiz_categories/i.test(sql)) return [{ slug: 'vivant_classification' }];
      if (/FROM glossary_terms/i.test(sql)) {
        return [
          {
            glossary_code: 'GLFM01',
            terme: 'Photosynthèse',
            variantes: '',
            categorie: 'flore',
            definition_courte: 'Production de matière par la lumière',
          },
        ];
      }
      return [];
    },
    queryOne: async (sql) => {
      calls.push(sql);
      if (/SELECT question_code FROM quiz_questions/i.test(sql)) {
        return { question_code: store.question.question_code };
      }
      return { ...store.question };
    },
    execute: async (sql, params) => {
      calls.push(sql);
      if (/INSERT INTO quiz_questions/i.test(sql)) {
        store.question = { question_code: 'QF9901', question: params[3] };
      } else if (/DELETE FROM resource_question_links/i.test(sql)) {
        assert.match(sql, /origin = 'keyword'/);
        store.links = store.links.filter((l) => l.origin !== 'keyword');
      } else if (/INSERT IGNORE INTO resource_question_links/i.test(sql)) {
        if (failOnLinkInsert) throw new Error('PANNE_INJECTEE_LIENS');
        store.links.push({ resource_ref: params[0], origin: 'keyword' });
      }
      return { insertId: 0, affectedRows: 1 };
    },
  };
  return { deps, calls };
}

function fakeWithTransaction(store, deps, counter) {
  return async (work) => {
    counter.count += 1;
    const snapshot = structuredClone(store);
    try {
      return await work(deps);
    } catch (err) {
      store.question = snapshot.question;
      store.links = snapshot.links;
      throw err;
    }
  };
}

test('édition : panne après la purge des liens → question et liens restaurés', async () => {
  const store = buildStore();
  const initial = structuredClone(store);
  const { deps } = buildDeps(store, { failOnLinkInsert: true });
  const counter = { count: 0 };
  await assert.rejects(
    upsertQuizQuestionInTransaction(fakeWithTransaction(store, deps, counter), BODY, {
      question_code: 'QF9901',
      requireExisting: true,
    }),
    /PANNE_INJECTEE_LIENS/,
  );
  assert.strictEqual(counter.count, 1, 'une seule transaction pour la question et ses liens');
  assert.deepStrictEqual(store, initial);
});

test('édition réussie : question, purge et liens par mots-clés dans la même transaction', async () => {
  const store = buildStore();
  const { deps, calls } = buildDeps(store);
  const counter = { count: 0 };
  const result = await upsertQuizQuestionInTransaction(
    fakeWithTransaction(store, deps, counter),
    BODY,
    { question_code: 'QF9901', requireExisting: true },
  );
  assert.strictEqual(counter.count, 1);
  assert.strictEqual(result.created, false);
  assert.strictEqual(result.glossaryLinks, 1);
  assert.strictEqual(store.question.question, BODY.question);
  // La curation (origin='import') survit ; l'ancien lien par mots-clés est remplacé.
  assert.deepStrictEqual(store.links.map((l) => `${l.resource_ref}:${l.origin}`).sort(), [
    'GLFM01:keyword',
    'GLFM50:import',
  ]);
  const upsertAt = calls.findIndex((sql) => /INSERT INTO quiz_questions/i.test(sql));
  const purgeAt = calls.findIndex((sql) => /DELETE FROM resource_question_links/i.test(sql));
  assert.ok(upsertAt >= 0 && purgeAt > upsertAt, 'la purge suit l’upsert, dans la transaction');
});
