'use strict';

// Migration 300 : reprise dans `resource_question_links` des liens des tables historiques
// `quiz_question_species` et `quiz_question_tutorials` (piste C, tranche « liens »).
// Audit du 25/09/2026, § 1.3.3, § 3.2.3 et § 3.5. Tests BDD partagée : exécution séquentielle.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initSchema, execute, queryOne, splitSqlStatements } = require('../database');

const stamp = Date.now().toString(36).toUpperCase();
const catSlug = `migcat${stamp.toLowerCase()}`.slice(0, 64);
const code = (suffix) => `QM${stamp}${suffix}`.slice(0, 16);
const CODES = {
  A: code('A'),
  B: code('B'),
  C: code('C'),
};
const ALL = Object.values(CODES);
let plantId = 0;
let tutorialId = 0;

const MIGRATION_300 = path.join(
  __dirname,
  '..',
  'migrations',
  '300_learning_links_single_source.sql',
);

async function runMigration300() {
  const sql = fs.readFileSync(MIGRATION_300, 'utf8');
  for (const stmt of splitSqlStatements(sql)) await execute(stmt);
}

async function rql(resourceType, resourceRef, questionCode) {
  return queryOne(
    `SELECT resource_type, resource_ref, question_code, is_gating, origin, status, note, weight
       FROM resource_question_links
      WHERE resource_type = ? AND resource_ref = ? AND question_code = ?`,
    [resourceType, String(resourceRef), questionCode],
  );
}

before(async () => {
  await initSchema();
  await execute(
    `INSERT IGNORE INTO quiz_categories (slug, nom, theme, order_index)
     VALUES (?, 'Migration liens', 'sciences', 995)`,
    [catSlug],
  );
  let numero = 1;
  for (const c of ALL) {
    await execute(
      `INSERT INTO quiz_questions
         (question_code, categorie_slug, numero_dans_categorie, question,
          choix_a, choix_b, choix_c, reponse_correcte, niveau, statut)
       VALUES (?, ?, ?, ?, 'A', 'B', 'C', 'A', 'college', 'actif')`,
      [c, catSlug, numero, `Question ${c} ?`],
    );
    numero += 1;
  }
  plantId = (
    await execute('INSERT INTO plants (name, emoji, description) VALUES (?, ?, ?)', [
      `Espèce migration ${stamp}`,
      '🌱',
      'migration des liens',
    ])
  ).insertId;
  tutorialId = (
    await execute(
      `INSERT INTO tutorials (title, slug, type, summary, html_content, is_active, sort_order)
       VALUES (?, ?, 'html', NULL, '<p>migration</p>', 1, 953)`,
      [`Tutoriel migration ${stamp}`, `tuto-migration-${stamp.toLowerCase()}`],
    )
  ).insertId;
});

after(async () => {
  const marks = ALL.map(() => '?').join(', ');
  for (const table of [
    'resource_question_links',
    'quiz_question_species',
    'quiz_question_tutorials',
    'quiz_questions',
  ]) {
    await execute(`DELETE FROM ${table} WHERE question_code IN (${marks})`, ALL).catch(() => {});
  }
  await execute('DELETE FROM quiz_categories WHERE slug = ?', [catSlug]).catch(() => {});
  await execute('DELETE FROM plants WHERE id = ?', [plantId]).catch(() => {});
  await execute('DELETE FROM tutorials WHERE id = ?', [tutorialId]).catch(() => {});
});

// ---------------------------------------------------------------------------------------
// Migration 300 : reprise idempotente, non bloquante, sans suppression
// ---------------------------------------------------------------------------------------

test('migration 300 : reprend un lien qqs absent de RQL, en éditorial non bloquant', async () => {
  await execute('INSERT INTO quiz_question_species (question_code, plant_id) VALUES (?, ?)', [
    CODES.A,
    plantId,
  ]);
  assert.equal(await rql('plant', plantId, CODES.A), undefined);
  await runMigration300();
  const row = await rql('plant', plantId, CODES.A);
  assert.deepEqual(
    {
      origin: row.origin,
      status: row.status,
      is_gating: Number(row.is_gating),
      weight: Number(row.weight),
    },
    { origin: 'editorial', status: 'approved', is_gating: 0, weight: 1 },
  );
  assert.match(row.note, /^migration 300 : reprise de quiz_question_species/);
});

test('migration 300 : reprend un lien qqt absent de RQL, en éditorial non bloquant', async () => {
  await execute('INSERT INTO quiz_question_tutorials (question_code, tutorial_id) VALUES (?, ?)', [
    CODES.A,
    tutorialId,
  ]);
  await runMigration300();
  const row = await rql('tutorial', tutorialId, CODES.A);
  assert.deepEqual(
    { origin: row.origin, status: row.status, is_gating: Number(row.is_gating) },
    { origin: 'editorial', status: 'approved', is_gating: 0 },
  );
  assert.match(row.note, /^migration 300 : reprise de quiz_question_tutorials/);
});

test('migration 300 : un jumeau RQL existant n’est jamais modifié (décision du professeur)', async () => {
  await execute('INSERT INTO quiz_question_species (question_code, plant_id) VALUES (?, ?)', [
    CODES.B,
    plantId,
  ]);
  await execute(
    `INSERT INTO resource_question_links
       (resource_type, resource_ref, question_code, is_gating, origin, status)
     VALUES ('plant', ?, ?, 0, 'auto', 'rejected')`,
    [String(plantId), CODES.B],
  );
  await execute('INSERT INTO quiz_question_species (question_code, plant_id) VALUES (?, ?)', [
    CODES.C,
    plantId,
  ]);
  await execute(
    `INSERT INTO resource_question_links
       (resource_type, resource_ref, question_code, is_gating, origin, status)
     VALUES ('plant', ?, ?, 1, 'manual', 'approved')`,
    [String(plantId), CODES.C],
  );
  await runMigration300();
  const rejected = await rql('plant', plantId, CODES.B);
  assert.deepEqual(
    { origin: rejected.origin, status: rejected.status, is_gating: Number(rejected.is_gating) },
    { origin: 'auto', status: 'rejected', is_gating: 0 },
  );
  const manual = await rql('plant', plantId, CODES.C);
  assert.deepEqual(
    { origin: manual.origin, status: manual.status, is_gating: Number(manual.is_gating) },
    { origin: 'manual', status: 'approved', is_gating: 1 },
  );
});

test('migration 300 : idempotente et sans suppression', async () => {
  const count = async () =>
    Number((await queryOne('SELECT COUNT(*) AS n FROM resource_question_links')).n);
  const qqs = async () =>
    Number((await queryOne('SELECT COUNT(*) AS n FROM quiz_question_species')).n);
  const qqt = async () =>
    Number((await queryOne('SELECT COUNT(*) AS n FROM quiz_question_tutorials')).n);
  const before = { rql: await count(), qqs: await qqs(), qqt: await qqt() };
  await runMigration300();
  await runMigration300();
  assert.deepEqual({ rql: await count(), qqs: await qqs(), qqt: await qqt() }, before);
});

test('migration 300 : plus aucun lien des tables historiques absent de RQL (contrôle T3)', async () => {
  const species = await queryOne(
    `SELECT COUNT(*) AS n FROM quiz_question_species q WHERE NOT EXISTS (
       SELECT 1 FROM resource_question_links r WHERE r.resource_type = 'plant'
          AND r.question_code = q.question_code
          AND CAST(r.resource_ref AS UNSIGNED) = q.plant_id)`,
  );
  const tutorials = await queryOne(
    `SELECT COUNT(*) AS n FROM quiz_question_tutorials q WHERE NOT EXISTS (
       SELECT 1 FROM resource_question_links r WHERE r.resource_type = 'tutorial'
          AND r.question_code = q.question_code
          AND CAST(r.resource_ref AS UNSIGNED) = q.tutorial_id)`,
  );
  assert.deepEqual([Number(species.n), Number(tutorials.n)], [0, 0]);
});

test('migration 300 : aucune table gl_* ni DDL', () => {
  const sql = fs.readFileSync(MIGRATION_300, 'utf8');
  const statements = splitSqlStatements(sql);
  assert.equal(statements.length, 2);
  for (const stmt of statements) {
    assert.match(stmt, /^INSERT IGNORE INTO resource_question_links/);
    assert.ok(!/\bgl_[a-z]/i.test(stmt), 'aucune table gl_*');
    assert.ok(!/\b(DROP|DELETE|ALTER|TRUNCATE|UPDATE)\b/i.test(stmt), 'ni suppression ni DDL');
  }
});
