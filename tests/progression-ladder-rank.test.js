'use strict';

// Question 11 de l'audit du 25/09/2026 : les paliers sur mesure gardent souvent le rang par
// défaut de la console (150). Atteindre « expert » (40 tâches, rang 150) depuis « chevronné »
// (10 tâches, rang 300) était alors journalisé comme une rétrogradation, sans avis de
// promotion. Entre deux paliers de l'échelle, c'est le seuil qui fait foi.

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { initSchema, queryOne, execute, splitSqlStatements } = require('../database');
const { setAssignedRole } = require('../lib/effectiveRole');
const {
  syncStudentPrimaryRoleFromProgress,
  consumePendingAutoProfilePromotion,
} = require('../lib/rbac');
const { restoreDefaultProgressionThresholds } = require('./helpers/progressionThresholds');

const stamp = Date.now().toString(36);
const expertSlug = `eleve_expert_${stamp}`.slice(0, 64);
let expertId = null;
let studentId = null;

test.before(async () => {
  await initSchema();
  await restoreDefaultProgressionThresholds();
  expertId = (
    await execute(
      "INSERT INTO roles (slug, display_name, emoji, min_done_tasks, display_order, `rank`, is_system) VALUES (?, 'Expert test', '🦉', 40, 3, 150, 0)",
      [expertSlug],
    )
  ).insertId;
  studentId = crypto.randomUUID();
  const unique = `ladder_${stamp}`;
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, first_name, last_name, display_name,
       password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', ?, ?, 'Test', 'Palier', 'Test Palier', NULL, 'local', 1, NOW(), NOW())`,
    [studentId, `${unique}@example.com`, unique],
  );
});

test.after(async () => {
  await execute('DELETE FROM user_roles WHERE user_id = ?', [studentId]).catch(() => {});
  await execute('DELETE FROM users WHERE id = ?', [studentId]).catch(() => {});
  await execute('DELETE FROM roles WHERE id = ?', [expertId]).catch(() => {});
});

test('chevronné (rang 300) → palier sur mesure au seuil plus haut (rang 150) : promotion', async () => {
  const chevronne = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_chevronne'");
  await setAssignedRole(studentId, chevronne.id);
  consumePendingAutoProfilePromotion(studentId);
  const out = await syncStudentPrimaryRoleFromProgress(studentId, 45, null, {
    recordPromotionNotice: true,
  });
  assert.strictEqual(out.changed, true);
  assert.strictEqual(out.currentRoleSlug, expertSlug);
  assert.strictEqual(out.reason, 'promoted');
  assert.ok(consumePendingAutoProfilePromotion(studentId), 'avis de promotion attendu');
});

test('migration 297 : rangs des paliers sur mesure alignés sur leurs seuils, garde comprise', async () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'migrations', '297_progression_ladder_ranks.sql'),
    'utf8',
  );
  const seeded = [];
  try {
    for (const [slug, min, rank] of [
      ['n3beur_bebe', 0, 150],
      ['eleve_expert', 40, 150],
      ['n3beur_ultime', 100, 150],
    ]) {
      const exists = await queryOne('SELECT id FROM roles WHERE slug = ?', [slug]);
      if (exists) continue;
      await execute(
        "INSERT INTO roles (slug, display_name, emoji, min_done_tasks, display_order, `rank`, is_system) VALUES (?, ?, '🌱', ?, 9, ?, 0)",
        [slug, slug, min, rank],
      );
      seeded.push(slug);
    }
    for (const stmt of splitSqlStatements(sql)) await execute(stmt);
    const rank = async (slug) =>
      Number((await queryOne('SELECT `rank` FROM roles WHERE slug = ?', [slug]))?.rank);
    if (seeded.includes('n3beur_bebe')) assert.strictEqual(await rank('n3beur_bebe'), 90);
    if (seeded.includes('eleve_expert')) assert.strictEqual(await rank('eleve_expert'), 310);
    if (seeded.includes('n3beur_ultime')) assert.strictEqual(await rank('n3beur_ultime'), 315);
    // Rejouée : sans effet. Un rang déjà réglé à la main n'est jamais écrasé.
    if (seeded.includes('eleve_expert')) {
      await execute("UPDATE roles SET `rank` = 250 WHERE slug = 'eleve_expert'");
      for (const stmt of splitSqlStatements(sql)) await execute(stmt);
      assert.strictEqual(await rank('eleve_expert'), 250);
    }
  } finally {
    for (const slug of seeded) {
      await execute('DELETE FROM roles WHERE slug = ? AND is_system = 0', [slug]).catch(() => {});
    }
  }
});
