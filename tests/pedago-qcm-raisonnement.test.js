'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const { initSchema, queryOne, queryAll } = require('../database');

before(async () => {
  await initSchema();
});

test('questions de raisonnement ForetMap QF91xx sont insérées avec un vrai feedback', async () => {
  const rows = await queryAll(
    `SELECT question_code, categorie_slug, reponse_correcte, feedback_correct, question
       FROM quiz_questions
      WHERE question_code REGEXP '^QF91[0-9]{2}$'
      ORDER BY question_code`,
  );
  assert.ok(rows.length >= 8, 'au moins 8 questions QF91xx');
  for (const row of rows) {
    assert.ok(row.feedback_correct && String(row.feedback_correct).trim());
    assert.notStrictEqual(String(row.feedback_correct).trim(), String(row.question).trim());
    assert.match(
      String(row.categorie_slug),
      /ecologie_reseaux|cycle_azote|sol_compost|energie_matiere|evolution_biodiversite|populations_equilibres|plantes_biologie/,
    );
  }
  const links = await queryOne(
    `SELECT COUNT(*) AS n FROM resource_question_links
      WHERE question_code REGEXP '^QF91[0-9]{2}$'`,
  );
  assert.ok(
    Number(links.n) >= 2,
    'QF9105 / QF9109 au moins doivent garder un lien plante après la purge pertinence',
  );
});

test('questions de raisonnement GL GQCM91xx restent sur des slugs existants', async () => {
  const rows = await queryAll(
    `SELECT question_code, biome_slug, categorie_slug, niveau, feedback_correct, question
       FROM gl_qcm_questions
      WHERE question_code REGEXP '^GQCM91[0-9]{2}$'
      ORDER BY question_code`,
  );
  assert.ok(rows.length >= 7, 'au moins 7 questions GQCM91xx');
  const biomes = new Set(rows.map((row) => row.biome_slug));
  assert.ok(
    ![...biomes].includes('jungle_afc') || rows.every((row) => row.question_code !== 'GQCM9040'),
  );
  for (const row of rows) {
    assert.ok(
      ['faune', 'flore', 'ecosystemes', 'biome', 'geologie', 'perturbations'].includes(
        row.categorie_slug,
      ),
    );
    assert.ok(row.feedback_correct && !String(row.feedback_correct).includes(String(row.question)));
    assert.ok(!/6ème|6eme/i.test(String(row.niveau || '')));
  }
  const jungle = rows.find((row) => row.biome_slug === 'jungle_afc');
  if (jungle) {
    assert.ok(!/castor/i.test(jungle.question));
  }
});
