'use strict';

/**
 * Classement des erreurs d'étape de migration (`database.js`). Audit du 13/09/2026, §2.1 :
 * `ER_NO_SUCH_TABLE` était avalé comme « déjà appliquée » quel que soit l'énoncé — la
 * migration 237 a écrit dans une table inexistante sans que rien ne le signale.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classifyMigrationStmtError, isRemovalStatement } = require('../database');

const noSuchTable = (table) => ({
  errno: 1146,
  code: 'ER_NO_SUCH_TABLE',
  sqlMessage: `Table 'foretmap_test.${table}' doesn't exist`,
});

test('les errnos « déjà présent » restent tolérés', () => {
  for (const errno of [1050, 1060, 1061, 1022, 1091, 1826]) {
    const v = classifyMigrationStmtError({ errno }, 'ALTER TABLE x ADD COLUMN y INT', '250_x.sql');
    assert.equal(v.ignore, true, String(errno));
  }
});

test('table absente sur une suppression : tolérée (table héritée)', () => {
  assert.equal(isRemovalStatement('DROP TABLE IF EXISTS quiz_question_glossary'), true);
  assert.equal(
    isRemovalStatement('ALTER TABLE visit_mascot_sprite_library DROP COLUMN map_id'),
    true,
  );
  assert.equal(isRemovalStatement('DROP INDEX idx_x ON t'), true);
  assert.equal(isRemovalStatement('INSERT INTO settings (`key`) VALUES (1)'), false);
  const v = classifyMigrationStmtError(
    noSuchTable('legacy_table'),
    'ALTER TABLE legacy_table DROP COLUMN x',
    '250_x.sql',
  );
  assert.equal(v.ignore, true);
});

test('table absente sur une écriture : refusée à partir de la migration 242', () => {
  const v = classifyMigrationStmtError(
    noSuchTable('settings'),
    "INSERT INTO settings (`key`, value) VALUES ('a', '0')",
    '242_x.sql',
  );
  assert.equal(v.ignore, false);
  assert.match(v.reason, /écriture/);
});

test('table absente sur une écriture dans une migration historique : tolérée mais signalée', () => {
  const v = classifyMigrationStmtError(
    noSuchTable('settings'),
    "INSERT INTO settings (`key`, value) VALUES ('a', '0')",
    '237_user_journal.sql',
  );
  assert.equal(v.ignore, true);
  assert.equal(v.warn, true);
});

test("tables de l'ancien modèle de comptes : silencieuses (base neuve)", () => {
  for (const table of ['students', 'teachers']) {
    const v = classifyMigrationStmtError(
      noSuchTable(table),
      `ALTER TABLE ${table} ADD COLUMN description TEXT`,
      '007_student_profile_fields.sql',
    );
    assert.equal(v.ignore, true);
    assert.equal(v.warn, undefined);
  }
});

test('erreur inconnue : non tolérée', () => {
  const v = classifyMigrationStmtError({ errno: 1064 }, 'SELEC 1', '242_x.sql');
  assert.equal(v.ignore, false);
});
