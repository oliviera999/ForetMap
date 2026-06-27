'use strict';

// Migration 153 : suppression des colonnes legacy/seed-only de tasks et
// quiz_questions (jamais lues ni écrites au runtime). On vérifie qu'après
// application des migrations, les colonnes sont bien absentes du schéma, et que
// les colonnes photo encore exploitées (photo_url/credit/licence/legende) restent
// présentes. Les colonnes GL homonymes ne sont pas concernées (table différente).

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const { initSchema, queryAll } = require('../database');

before(async () => {
  await initSchema();
});

async function columnExists(table, column) {
  const rows = await queryAll(
    `SELECT COLUMN_NAME FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column],
  );
  return rows.length > 0;
}

test('tasks.recurrence_end est supprimée', async () => {
  assert.strictEqual(await columnExists('tasks', 'recurrence_end'), false);
});

test('les colonnes photo_* legacy de quiz_questions sont supprimées', async () => {
  for (const col of ['photo_species_id', 'photo_source', 'photo_licence_url', 'photo_sujet']) {
    assert.strictEqual(
      await columnExists('quiz_questions', col),
      false,
      `quiz_questions.${col} doit être supprimée`,
    );
  }
});

test('les colonnes photo encore exploitées sont conservées', async () => {
  for (const col of ['photo_url', 'photo_credit', 'photo_licence', 'photo_legende']) {
    assert.strictEqual(
      await columnExists('quiz_questions', col),
      true,
      `quiz_questions.${col} doit rester présente`,
    );
  }
});
