'use strict';

// Audit ForetMap du 19/11/2026, P2 : le socle `questionCrudCore` sert aussi les QCM de
// Gnomes & Licornes, dont les tables ont le même risque (clé unique d'emplacement
// `uq_gl_qcm_biome_cat_num`, `uq_gl_qcm_lore_chap_cat_num`). L'emplacement est contrôlé de
// façon générique avant l'upsert : on vérifie ici, sans base, que les trois éditeurs (quiz
// ForetMap, QCM biomes G&L, QCM lore G&L) refusent un emplacement pris (409) au lieu d'écrire.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { upsertQuizQuestion } = require('../lib/fmQuizCrud');
const { upsertGlQcmQuestion } = require('../lib/glQcmCrud');
const { upsertGlQcmLoreQuestion } = require('../lib/glQcmLoreCrud');
const { filterImportSlotConflicts } = require('../lib/shared/questionCrudCore');

const COMMON = {
  question: 'Quel est le rôle d’un décomposeur ?',
  choix_a: 'Recycler la matière',
  choix_b: 'Produire de la lumière',
  choix_c: 'Voler',
  choix_d: 'Briller',
  reponse_correcte: 'A',
  niveau: 'college',
  numero_dans_categorie: 3,
};

/** Base factice : catalogues connus, question nouvelle, emplacement pris par `OWNER`. */
function fakeDeps(table, owner = 'OWNER1') {
  const writes = [];
  return {
    writes,
    queryAll: async (sql) => {
      if (/SELECT slug FROM/i.test(sql)) {
        return [{ slug: 'cat' }, { slug: 'foret' }, { slug: 'chap1' }];
      }
      return [];
    },
    queryOne: async (sql, params) => {
      if (new RegExp(`FROM ${table} WHERE question_code = \\?`, 'i').test(sql)) return null;
      if (new RegExp(`FROM ${table} WHERE .*numero_dans_categorie = \\?`, 'i').test(sql)) {
        assert.equal(params.at(-1), 'NEW1', 'le code de la question est exclu du contrôle');
        return { question_code: owner };
      }
      return null;
    },
    execute: async (sql, params) => {
      writes.push({ sql, params });
      return { affectedRows: 1 };
    },
  };
}

for (const [label, upsert, table, extra] of [
  ['quiz ForetMap', upsertQuizQuestion, 'quiz_questions', { categorie_slug: 'cat' }],
  [
    'QCM biomes G&L',
    upsertGlQcmQuestion,
    'gl_qcm_questions',
    { categorie_slug: 'cat', biome_slug: 'foret' },
  ],
  [
    'QCM lore G&L',
    upsertGlQcmLoreQuestion,
    'gl_qcm_lore_questions',
    { categorie_slug: 'cat', chapitre_slug: 'chap1' },
  ],
]) {
  test(`P2 — ${label} : emplacement pris → 409, aucune écriture`, async () => {
    const deps = fakeDeps(table);
    await assert.rejects(
      () => upsert(deps, { ...COMMON, ...extra, question_code: 'NEW1' }, { requireNew: true }),
      (err) => {
        assert.equal(err.status, 409);
        assert.match(err.message, /OWNER1/);
        return true;
      },
    );
    assert.equal(deps.writes.length, 0);
  });
}

test('filterImportSlotConflicts : base, doublon du fichier, réécriture à sa propre place', async () => {
  const slot = { table: 'quiz_questions', columns: ['categorie_slug', 'numero_dans_categorie'] };
  const deps = {
    queryAll: async () => [
      { question_code: 'QF0001', categorie_slug: 'cat', numero_dans_categorie: 1 },
      { question_code: 'QF0002', categorie_slug: 'cat', numero_dans_categorie: 2 },
    ],
  };
  const rows = [
    {
      rowNumber: 2,
      payload: { question_code: 'QF0001', categorie_slug: 'cat', numero_dans_categorie: 1 },
    },
    {
      rowNumber: 3,
      payload: { question_code: 'QF0009', categorie_slug: 'cat', numero_dans_categorie: 2 },
    },
    {
      rowNumber: 4,
      payload: { question_code: 'QF0010', categorie_slug: 'cat', numero_dans_categorie: 5 },
    },
    {
      rowNumber: 5,
      payload: { question_code: 'QF0011', categorie_slug: 'cat', numero_dans_categorie: 5 },
    },
  ];
  const { rows: kept, errors } = await filterImportSlotConflicts(deps, rows, slot);
  assert.deepEqual(
    kept.map((r) => r.payload.question_code),
    ['QF0001', 'QF0010'],
  );
  assert.deepEqual(
    errors.map((e) => e.row),
    [3, 5],
  );
  assert.match(errors[0].error, /QF0002/);
  assert.match(errors[1].error, /ligne 4/);
});
