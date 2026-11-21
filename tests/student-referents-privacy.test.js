'use strict';

// Élèves référents automatiques — lot 8 : les refus par série (`task_series_referent_vetoes`)
// sont des données personnelles. Ils suivent le compte (cascade, catégorie « vie du compte »),
// la fusion de comptes (clé étrangère découverte, doublon de clé primaire géré) et l'export.

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { initSchema, queryAll, execute } = require('../database');
const { applyMerge } = require('../lib/accountMerge');
const { buildForetUserExport } = require('../lib/accounts/personalDataExport');
const { ACCOUNT_LIFETIME_TABLES } = require('../lib/retention/policy');

const STAMP = crypto.randomUUID().slice(0, 8);

async function createStudent(label) {
  const id = `srp-${label}-${STAMP}`;
  await execute(
    `INSERT INTO users (id, user_type, first_name, last_name, display_name, password_hash,
                        auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', 'Veto', ?, ?, 'x', 'local', 1, NOW(), NOW())`,
    [id, label, `Veto ${label}`],
  );
  return id;
}

async function veto(seriesId, userId) {
  await execute(
    'INSERT INTO task_series_referent_vetoes (series_id, user_id, created_at) VALUES (?, ?, NOW())',
    [seriesId, userId],
  );
}

before(async () => {
  await initSchema();
});

test('catégorie de conservation : vie du compte', () => {
  assert.ok(ACCOUNT_LIFETIME_TABLES.includes('task_series_referent_vetoes'));
});

test('fusion : deux comptes avec un refus sur la même série ⇒ une seule ligne, l’autre série suit', async () => {
  const into = await createStudent('A');
  const from = await createStudent('B');
  await veto(`srp-s1-${STAMP}`, into);
  await veto(`srp-s1-${STAMP}`, from);
  await veto(`srp-s2-${STAMP}`, from);
  const result = await applyMerge({ fromUserId: from, intoUserId: into });
  assert.ok(result.ok !== false, JSON.stringify(result));
  const rows = await queryAll(
    'SELECT series_id, user_id FROM task_series_referent_vetoes WHERE series_id LIKE ? ORDER BY series_id',
    [`srp-%-${STAMP}`],
  );
  assert.deepEqual(
    rows.map((r) => [r.series_id, r.user_id]),
    [
      [`srp-s1-${STAMP}`, into],
      [`srp-s2-${STAMP}`, into],
    ],
  );
  await execute('DELETE FROM users WHERE id IN (?, ?)', [into, from]);
  const left = await queryAll('SELECT 1 FROM task_series_referent_vetoes WHERE series_id LIKE ?', [
    `srp-%-${STAMP}`,
  ]);
  assert.equal(left.length, 0, 'suppression du compte : refus effacés (cascade)');
});

test('export des données personnelles : section taches_referent_refus', async () => {
  const s = await createStudent('C');
  await veto(`srp-s3-${STAMP}`, s);
  try {
    const out = await buildForetUserExport(s);
    const section =
      out.payload?.taches_referent_refus ?? out.payload?.sections?.taches_referent_refus;
    const text = JSON.stringify(out.payload);
    assert.match(text, new RegExp(`srp-s3-${STAMP}`));
    assert.ok(section || text.includes('taches_referent_refus'));
  } finally {
    await execute('DELETE FROM users WHERE id = ?', [s]);
  }
});
