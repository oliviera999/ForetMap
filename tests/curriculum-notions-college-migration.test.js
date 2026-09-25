'use strict';

// Migration 294 (audit du 25/09/2026, § 1.3.1 ; décision Q6 : « créer davantage de notions »).
// Le rattachement des questions `glossaire_definitions` dépend de données de production
// (liens glossaire approuvés) absentes d'une base neuve : on le rejoue ici sur un jeu minimal.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initSchema, execute, queryAll, splitSqlStatements } = require('../database');

const stamp = Date.now();
const questionCode = `QGD${stamp}`.slice(0, 16);
const lyceeCode = `QGL${stamp}`.slice(0, 16);
const glossaryCode = `GD${String(stamp).slice(-6)}`;
const MIGRATION = path.join(__dirname, '..', 'migrations', '294_curriculum_notions_college.sql');

before(async () => {
  await initSchema();
  await execute(
    `INSERT IGNORE INTO quiz_categories (slug, nom, theme, order_index)
     VALUES ('glossaire_definitions', 'Définitions du glossaire', 'sciences', 990)`,
  );
  await execute(
    `INSERT INTO glossary_terms (glossary_code, terme, variantes, categorie, niveau,
       definition_courte, statut, created_at, updated_at)
     VALUES (?, 'Humus test', '', 'sol', 'base', 'Matière organique du sol', 'actif', NOW(), NOW())`,
    [glossaryCode],
  );
  const n = Number(String(stamp).slice(-5));
  await execute(
    `INSERT INTO quiz_questions (question_code, categorie_slug, numero_dans_categorie, question,
       choix_a, choix_b, choix_c, reponse_correcte, niveau, statut)
     VALUES (?, 'glossaire_definitions', ?, 'Qu’est-ce que l’humus ?', 'A', 'B', 'C', 'A', 'college', 'actif')`,
    [questionCode, n],
  );
  await execute(
    `INSERT INTO quiz_questions (question_code, categorie_slug, numero_dans_categorie, question,
       choix_a, choix_b, choix_c, reponse_correcte, niveau, statut)
     VALUES (?, 'glossaire_definitions', ?, 'Humus (lycée) ?', 'A', 'B', 'C', 'A', 'lycee', 'actif')`,
    [lyceeCode, n + 1],
  );
  for (const code of [questionCode, lyceeCode]) {
    await execute(
      `INSERT INTO resource_question_links
         (resource_type, resource_ref, question_code, is_gating, weight, origin, status)
       VALUES ('glossary', ?, ?, 0, 1, 'import', 'approved')`,
      [glossaryCode, code],
    );
  }
});

after(async () => {
  await execute('DELETE FROM quiz_question_notions WHERE question_code IN (?, ?)', [
    questionCode,
    lyceeCode,
  ]).catch(() => {});
  await execute('DELETE FROM resource_question_links WHERE question_code IN (?, ?)', [
    questionCode,
    lyceeCode,
  ]).catch(() => {});
  await execute('DELETE FROM quiz_questions WHERE question_code IN (?, ?)', [
    questionCode,
    lyceeCode,
  ]).catch(() => {});
  await execute('DELETE FROM glossary_terms WHERE glossary_code = ?', [glossaryCode]).catch(
    () => {},
  );
});

test('migration 294 — les notions de collège existent', async () => {
  const rows = await queryAll(
    "SELECT id, niveau FROM curriculum_notions WHERE id IN ('C3-MATORG', 'C3-DEVREPRO', 'C3-ALIM', 'C4-RESS')",
  );
  assert.equal(rows.length, 4);
});

test('migration 294 — une question de définition reçoit les notions de la catégorie de son terme', async () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  // Rejouée deux fois : idempotente.
  for (let i = 0; i < 2; i += 1) {
    for (const stmt of splitSqlStatements(sql)) await execute(stmt);
  }
  const rows = await queryAll(
    'SELECT notion_id, mode FROM quiz_question_notions WHERE question_code = ? ORDER BY notion_id',
    [questionCode],
  );
  const ids = rows.map((r) => r.notion_id);
  // Catégorie « sol » : notions historiques (2-AGRO, C3-ENV, C4-TERRE) + nouvelles.
  for (const id of ['C3-MATORG', 'C4-RESS', 'C3-ENV', 'C4-TERRE']) {
    assert.ok(ids.includes(id), `notion ${id} attendue (reçu : ${ids.join(', ')})`);
  }
  assert.ok(rows.every((r) => r.mode === 'ajout'));
});

test('migration 294 — une définition de lycée ne reçoit pas de notion de collège', async () => {
  const rows = await queryAll(
    `SELECT qn.notion_id, n.niveau FROM quiz_question_notions qn
       JOIN curriculum_notions n ON n.id = qn.notion_id
      WHERE qn.question_code = ?`,
    [lyceeCode],
  );
  assert.ok(rows.length > 0, 'la définition de lycée reçoit ses notions de lycée');
  assert.deepEqual(
    rows.filter((r) => ['cycle3', 'cycle4'].includes(r.niveau)).map((r) => r.notion_id),
    [],
  );
});
