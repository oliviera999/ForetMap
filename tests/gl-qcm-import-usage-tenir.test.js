'use strict';

/**
 * Import XLSX des QCM biomes et colonne `usage_tenir` (« Posée en partie », migration 345).
 *
 * La migration 345 a retiré du tirage de « Tenir à deux » les questions de taxonomie générée
 * (« À quelle famille appartient… », « … nom scientifique … »). L'import créait pourtant toute
 * nouvelle question avec la valeur par défaut de la colonne (`usage_tenir = 1`) : une question
 * de taxonomie importée après la migration revenait dans le tirage des cases. Désormais :
 * - une question de taxonomie CRÉÉE par l'import passe à `usage_tenir = 0` ;
 * - une question existante garde le réglage du prof (l'import ne le touche pas) ;
 * - les autres questions créées restent posées en partie.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isQuestionTaxonomie } = require('../lib/glUsageTenir');
const { applyQcmImport } = require('../lib/glQcmImport');

test('isQuestionTaxonomie : même critère que la migration 345 (accents et casse ignorés)', () => {
  assert.equal(isQuestionTaxonomie('À quelle famille appartient le chêne vert ?'), true);
  assert.equal(isQuestionTaxonomie('A quelle famille appartient le chêne vert ?'), true);
  assert.equal(isQuestionTaxonomie('à QUELLE famille appartient le chêne ?'), true);
  assert.equal(isQuestionTaxonomie('Quel est le nom scientifique du suricate ?'), true);
  assert.equal(isQuestionTaxonomie('Retrouve le NOM SCIENTIFIQUE de cette plante.'), true);
  assert.equal(isQuestionTaxonomie('Que mange le suricate ?'), false);
  assert.equal(isQuestionTaxonomie('Dans quelle famille vit le suricate ?'), false);
  assert.equal(isQuestionTaxonomie(''), false);
  assert.equal(isQuestionTaxonomie(null), false);
});

/** Base factice : enregistre les écritures, connaît un biome, une question déjà en base. */
function fakeDeps({ existing = [] } = {}) {
  const writes = [];
  return {
    writes,
    deps: {
      async queryAll(sql) {
        if (/FROM gl_biomes/.test(sql)) return [{ slug: 'toundra' }];
        if (/SELECT question_code FROM gl_qcm_questions/.test(sql)) {
          return existing.map((question_code) => ({ question_code }));
        }
        if (/FROM gl_glossary_terms/.test(sql)) return [];
        return [];
      },
      async execute(sql, params) {
        writes.push({ sql: String(sql), params });
        return { affectedRows: 1 };
      },
    },
  };
}

const categorie = { categorie_slug: 'faune', categorie_nom: 'Faune' };
const question = (id, texte) => ({
  id,
  biome_slug: 'toundra',
  categorie_slug: 'faune',
  numero_dans_categorie: id,
  question: texte,
  choix_a: 'Un',
  choix_b: 'Deux',
  choix_c: 'Trois',
  choix_d: 'Quatre',
  reponse_correcte: 'A',
});

test('import : une question de taxonomie créée sort du tirage ; existante ou ordinaire, rien ne change', async () => {
  const { deps, writes } = fakeDeps({ existing: ['QCM0002'] });
  const report = await applyQcmImport(
    deps,
    [categorie],
    [
      question(1, 'Quel est le nom scientifique du renard polaire ?'),
      question(2, 'À quelle famille appartient le lemming ?'),
      question(3, 'Que mange le renard polaire en hiver ?'),
    ],
  );
  assert.equal(report.totals.valid, 3, JSON.stringify(report));
  const retraits = writes.filter((w) => /SET usage_tenir = 0/.test(w.sql));
  assert.equal(retraits.length, 1, 'un seul UPDATE groupé');
  // QCM0001 : créée et taxonomique → retirée. QCM0002 : existante → réglage du prof gardé.
  // QCM0003 : créée, ordinaire → reste posée en partie.
  assert.deepEqual(retraits[0].params, ['QCM0001']);
  assert.equal(report.totals.usage_tenir_retirees, 1);
});

test('import à blanc (dryRun) : aucune écriture', async () => {
  const { deps, writes } = fakeDeps();
  await applyQcmImport(
    deps,
    [categorie],
    [question(1, 'Quel est le nom scientifique du renard polaire ?')],
    {
      dryRun: true,
    },
  );
  assert.equal(writes.length, 0);
});
