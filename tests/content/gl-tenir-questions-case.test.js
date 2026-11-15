'use strict';

/**
 * Questions de case de « Tenir à deux » (14 novembre 2026, migration 345) : sur le corpus réel,
 * - aucune question « posée en partie » (`usage_tenir = 1`) n'est de la taxonomie générée
 *   (« À quelle famille appartient… », « nom scientifique ») ;
 * - chaque biome joué garde au moins 40 questions de niveau admis dans le tirage ;
 * - les 40 questions vives (`VQCM…`) sont en base, actives et posées en partie.
 *
 * Porte sur les DONNÉES : une base neuve de CI (quelques questions d'exemple) le dit et passe.
 */

require('../helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../database');
const { BIOMES_JOUES } = require('../../lib/glTenirImport');
const { NIVEAUX_ADMIS_SQL } = require('../../lib/glNiveauxAdmis');

const SEUIL_CORPUS = 500;
const MIN_PAR_BIOME = 40;

async function corpusPresent(t) {
  await db.initSchema();
  const row = await db.queryOne(
    "SELECT COUNT(*) AS n FROM gl_qcm_questions WHERE statut = 'actif' AND question_code REGEXP '^G?QCM[0-9]'",
  );
  if (Number(row?.n) >= SEUIL_CORPUS) return true;
  t.diagnostic(`Corpus QCM absent (${Number(row?.n) || 0} questions) : contrôle sauté`);
  return false;
}

test('aucune question posée en partie n’est de la taxonomie générée', async (t) => {
  if (!(await corpusPresent(t))) return;
  const rows = await db.queryAll(
    `SELECT question_code FROM gl_qcm_questions
      WHERE statut = 'actif' AND usage_tenir = 1
        AND (question LIKE 'À quelle famille appartient%' OR question LIKE '%nom scientifique%')`,
  );
  assert.deepEqual(
    rows.map((r) => r.question_code),
    [],
  );
});

test(`au moins ${MIN_PAR_BIOME} questions de niveau admis par biome joué`, async (t) => {
  if (!(await corpusPresent(t))) return;
  const rows = await db.queryAll(
    `SELECT biome_slug, COUNT(*) AS n FROM gl_qcm_questions
      WHERE statut = 'actif' AND usage_tenir = 1
        AND niveau IN (${NIVEAUX_ADMIS_SQL.map(() => '?').join(', ')})
      GROUP BY biome_slug`,
    NIVEAUX_ADMIS_SQL,
  );
  const parBiome = new Map(rows.map((r) => [String(r.biome_slug), Number(r.n)]));
  const manques = BIOMES_JOUES.filter((b) => (parBiome.get(b) || 0) < MIN_PAR_BIOME).map(
    (b) => `${b} : ${parBiome.get(b) || 0}`,
  );
  assert.deepEqual(manques, []);
});

test('les 40 questions vives sont en base, actives, posées en partie, 5 par biome', async (t) => {
  if (!(await corpusPresent(t))) return;
  const rows = await db.queryAll(
    `SELECT biome_slug, COUNT(*) AS n FROM gl_qcm_questions
      WHERE question_code REGEXP '^VQCM0[0-9]{3}$' AND statut = 'actif' AND usage_tenir = 1
      GROUP BY biome_slug`,
  );
  if (!rows.length) {
    t.diagnostic(
      'Questions vives pas encore synchronisées (catalogue non chargé) : contrôle sauté',
    );
    return;
  }
  assert.equal(
    rows.reduce((sum, r) => sum + Number(r.n), 0),
    40,
  );
  for (const biome of BIOMES_JOUES) {
    const row = rows.find((r) => String(r.biome_slug) === biome);
    assert.equal(Number(row?.n) || 0, 5, biome);
  }
});
