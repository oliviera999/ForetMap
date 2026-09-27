'use strict';

/**
 * Contrôles de passage au temps 3 des retraits de schéma (`lib/schemaRetirements.js`,
 * `npm run db:t3-status`) : lecture seule, un candidat par retrait prévu, replis comptés par
 * les résolveurs du code, table ou colonne absente = retirée.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../database');
const { initSchema, execute } = database;
const { T3_CANDIDATES, evaluateT3Readiness, formatT3Report } = require('../lib/schemaRetirements');

test.before(async () => {
  await initSchema();
});

test('un candidat par retrait prévu, chacun avec au moins un contrôle', () => {
  assert.deepEqual(
    T3_CANDIDATES.map((c) => c.id),
    [
      'quiz_question_links',
      'plant_photo_columns',
      'plant_second_name',
      'plant_remarks',
      'legacy_single_species',
      'zones_stage',
      'zone_history',
      'observation_logs',
      'quiz_difficulte_label',
    ],
  );
  for (const candidate of T3_CANDIDATES) {
    assert.ok(candidate.checks.length > 0, candidate.id);
    assert.ok(candidate.deliveredBy, candidate.id);
    for (const check of candidate.checks) {
      assert.ok(check.sql || typeof check.run === 'function', check.label);
      if (!check.info) assert.equal(check.expected, 0, check.label);
    }
  }
});

test('base de test : chaque contrôle renvoie un entier', async () => {
  const report = await evaluateT3Readiness(database);
  assert.equal(report.candidates.length, T3_CANDIDATES.length);
  for (const candidate of report.candidates) {
    for (const check of candidate.checks) {
      assert.equal(check.absent, false, `${candidate.id} : ${check.label}`);
      assert.ok(Number.isInteger(check.value) && check.value >= 0, check.label);
    }
  }
});

test('remarques : une fiche écrite sans le champ remarks est comptée en repli', async () => {
  const plantId = (
    await execute(
      `INSERT INTO plants (name, emoji, description, remarks, remark_1)
       VALUES (?, '🌱', 'x', NULL, 'Écrite par une version antérieure')`,
      [`Contrôle T3 ${Date.now()}`],
    )
  ).insertId;
  try {
    const report = await evaluateT3Readiness(database);
    const remarks = report.candidates.find((c) => c.id === 'plant_remarks');
    assert.equal(remarks.ready, false);
    assert.ok(remarks.checks[0].value >= 1);
    assert.ok(remarks.checks[0].sample.includes(plantId) || remarks.checks[0].value > 10);
    assert.match(formatT3Report(report), /✗ fiches dont remarks ne reprend pas/);
    assert.equal(report.ready, false);
  } finally {
    await execute('DELETE FROM plants WHERE id = ?', [plantId]);
  }
});

test('table ou colonne absente : contrôle sauté, compté comme retiré', async () => {
  const missing = Object.assign(new Error("Table 'zone_history' doesn't exist"), { errno: 1146 });
  const fakeDb = {
    queryOne: async () => {
      throw missing;
    },
    queryAll: async () => {
      throw Object.assign(new Error('Unknown column'), { errno: 1054 });
    },
  };
  const report = await evaluateT3Readiness(fakeDb);
  assert.equal(report.ready, true);
  for (const candidate of report.candidates) {
    for (const check of candidate.checks) assert.equal(check.absent, true);
  }
  assert.match(formatT3Report(report), /absente \(retirée\)/);

  const broken = { queryOne: async () => Promise.reject(new Error('connexion perdue')) };
  await assert.rejects(evaluateT3Readiness(broken), /connexion perdue/);
});
