'use strict';

/**
 * Badges et données personnelles (lot H) : conservation alignée sur le compte (cascade),
 * fusion de comptes (date la plus ancienne gardée, badges manuels renumérotés), export RGPD
 * (mot de l'adulte présent, identifiant de l'adulte absent).
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { initSchema, queryAll, queryOne, execute } = require('../database');
const { ACCOUNT_LIFETIME_TABLES } = require('../lib/retention/policy');
const { applyMerge } = require('../lib/accountMerge');
const { buildForetUserExport } = require('../lib/accounts/personalDataExport');

async function createStudent(label) {
  const id = `rw-priv-${crypto.randomUUID().slice(0, 8)}`;
  await execute(
    `INSERT INTO users (id, user_type, first_name, last_name, display_name, password_hash,
                        auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', 'Badge', ?, ?, 'x', 'local', 1, NOW(), NOW())`,
    [id, label, `Badge ${label}`],
  );
  return id;
}

async function reward(userId, key, awardedAt, extra = {}) {
  await execute(
    `INSERT INTO user_rewards (user_id, reward_key, source_type, awarded_at, note, awarded_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, key, extra.note ? 'manual' : 'task', awardedAt, extra.note || null, extra.by || null],
  );
}

before(async () => {
  await initSchema();
});

test('conservation : les badges suivent le compte (ON DELETE CASCADE vers users)', async () => {
  assert.deepEqual([...ACCOUNT_LIFETIME_TABLES], ['user_rewards']);
  const rows = await queryAll(
    `SELECT k.COLUMN_NAME AS col, r.DELETE_RULE AS rule
       FROM information_schema.KEY_COLUMN_USAGE k
       JOIN information_schema.REFERENTIAL_CONSTRAINTS r
         ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
      WHERE k.TABLE_SCHEMA = DATABASE() AND k.TABLE_NAME = 'user_rewards'
        AND k.REFERENCED_TABLE_NAME = 'users'`,
  );
  const byCol = Object.fromEntries(rows.map((r) => [r.col, r.rule]));
  assert.equal(byCol.user_id, 'CASCADE');
  assert.equal(byCol.awarded_by_user_id, 'SET NULL');
  const s = await createStudent('Cascade');
  await reward(s, 'ecotone.1', new Date());
  await execute('DELETE FROM users WHERE id = ?', [s]);
  const left = await queryOne('SELECT COUNT(*) AS n FROM user_rewards WHERE user_id = ?', [s]);
  assert.equal(Number(left.n), 0);
});

test('fusion : date la plus ancienne gardée, badges manuels renumérotés, rien de perdu', async () => {
  const into = await createStudent('Cible');
  const from = await createStudent('Absorbe');
  await reward(into, 'metier.jardinage.1', '2026-10-10 10:00:00');
  await reward(from, 'metier.jardinage.1', '2026-09-15 10:00:00');
  await reward(from, 'ecotone.1', '2026-09-20 10:00:00');
  await reward(into, 'manuel.guide.1', '2026-10-01 10:00:00', { note: 'Cible 1' });
  await reward(from, 'manuel.guide.1', '2026-09-01 10:00:00', { note: 'Absorbé 1' });
  await reward(from, 'manuel.guide.2', '2026-09-02 10:00:00', { note: 'Absorbé 2' });
  const result = await applyMerge({ fromUserId: from, intoUserId: into });
  assert.ok(result.ok !== false, JSON.stringify(result));
  const rows = await queryAll(
    'SELECT reward_key, awarded_at, note FROM user_rewards WHERE user_id = ? ORDER BY reward_key',
    [into],
  );
  const byKey = Object.fromEntries(rows.map((r) => [r.reward_key, r]));
  assert.deepEqual(Object.keys(byKey).sort(), [
    'ecotone.1',
    'manuel.guide.1',
    'manuel.guide.2',
    'manuel.guide.3',
    'metier.jardinage.1',
  ]);
  assert.equal(
    new Date(byKey['metier.jardinage.1'].awarded_at).toISOString().slice(0, 10),
    '2026-09-15',
    'date la plus ancienne',
  );
  assert.deepEqual(
    ['manuel.guide.1', 'manuel.guide.2', 'manuel.guide.3'].map((k) => byKey[k].note),
    ['Cible 1', 'Absorbé 1', 'Absorbé 2'],
  );
});

test('export RGPD : badges présents avec le mot, sans l’identifiant de l’adulte', async () => {
  const s = await createStudent('Export');
  const teacher = await queryOne("SELECT id FROM users WHERE user_type = 'teacher' LIMIT 1");
  await reward(s, 'manuel.coup_de_main.1', new Date(), {
    note: 'Merci pour ton aide',
    by: teacher?.id,
  });
  const out = await buildForetUserExport(s);
  const text = JSON.stringify(out.payload);
  assert.match(text, /Merci pour ton aide/);
  assert.match(text, /manuel\.coup_de_main\.1/);
  assert.doesNotMatch(text, /awarded_by_user_id/);
});
