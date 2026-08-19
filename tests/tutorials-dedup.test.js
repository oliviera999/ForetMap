'use strict';

// Fusion des tutoriels au contenu identique (audit docs/AUDIT_BDD_2026-08.md §5.4).
// Ce qui compte ici : la fusion ne perd AUCUN lien. Une lecture attestée, une liaison
// tâche et une référence polymorphe posées sur le doublon doivent se retrouver sur le
// tutoriel conservé — y compris quand un lien identique existe déjà des deux côtés.
// Tests BDD partagée = exécution séquentielle.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { initSchema, queryAll, queryOne, execute, withTransaction } = require('../database');
const { findDuplicateGroups, mergeTutorialGroup } = require('../lib/tutorialDedup');

const SUFFIX = crypto.randomBytes(4).toString('hex');
const HTML = `<h1>Contenu de test ${SUFFIX}</h1><p>identique des deux côtés</p>`;
const USER_ID = `dedup-user-${SUFFIX}`;

let keepId = null;
let dropId = null;

before(async () => {
  await initSchema();

  const keep = await execute(
    `INSERT INTO tutorials (title, slug, type, summary, html_content, is_active, sort_order)
     VALUES (?, ?, 'html', NULL, ?, 1, 900)`,
    [`Dédoublonnage ${SUFFIX}`, `dedup-keep-${SUFFIX}`, HTML],
  );
  keepId = keep.insertId;

  const drop = await execute(
    `INSERT INTO tutorials (title, slug, type, summary, html_content, is_active, sort_order)
     VALUES (?, ?, 'html', NULL, ?, 1, 901)`,
    [`Dedoublonnage ${SUFFIX} (copie)`, `dedup-drop-${SUFFIX}`, HTML],
  );
  dropId = drop.insertId;

  await execute(
    `INSERT INTO users (id, user_type, pseudo, first_name, last_name, display_name)
     VALUES (?, 'student', ?, 'Dedup', 'Test', 'Dedup Test')`,
    [USER_ID, `dedup_${SUFFIX}`],
  );

  // Lecture attestée UNIQUEMENT sur le doublon : elle doit migrer.
  await execute(
    'INSERT INTO user_tutorial_reads (user_id, tutorial_id, acknowledged_at) VALUES (?, ?, ?)',
    [USER_ID, dropId, new Date().toISOString()],
  );
  // Référence polymorphe sur le doublon : elle doit migrer aussi.
  await execute(
    `INSERT INTO resource_gating_policy (resource_type, resource_ref, mode, enabled)
     VALUES ('tutorial', ?, 'inherit', 0)`,
    [String(dropId)],
  );
});

after(async () => {
  await execute('DELETE FROM users WHERE id = ?', [USER_ID]);
  await execute('DELETE FROM tutorials WHERE id IN (?, ?)', [keepId, dropId]);
  await execute(
    "DELETE FROM resource_gating_policy WHERE resource_type = 'tutorial' AND resource_ref IN (?, ?)",
    [String(keepId), String(dropId)],
  );
});

test('les tutoriels au contenu identique forment un groupe, le plus ancien est conservé', async () => {
  const groups = await findDuplicateGroups({ queryAll });
  const group = groups.find(
    (g) => Number(g.keep.id) === keepId || g.drop.some((d) => Number(d.id) === dropId),
  );
  assert.ok(group, 'le couple créé doit être détecté comme doublon');
  assert.strictEqual(Number(group.keep.id), keepId, 'le plus petit id doit être conservé');
  assert.ok(
    group.drop.some((d) => Number(d.id) === dropId),
    'le doublon doit figurer parmi les lignes à fusionner',
  );
});

test('la fusion repointe les liens puis supprime le doublon', async () => {
  const result = await withTransaction((tx) => mergeTutorialGroup(tx, keepId, [dropId]));
  assert.strictEqual(result.deleted, 1, 'le doublon doit être supprimé');

  const gone = await queryOne('SELECT id FROM tutorials WHERE id = ?', [dropId]);
  assert.strictEqual(gone, undefined, 'le doublon ne doit plus exister');
  const kept = await queryOne('SELECT id FROM tutorials WHERE id = ?', [keepId]);
  assert.ok(kept, 'le tutoriel conservé doit rester');

  const reads = await queryAll('SELECT tutorial_id FROM user_tutorial_reads WHERE user_id = ?', [
    USER_ID,
  ]);
  assert.deepStrictEqual(
    reads.map((r) => Number(r.tutorial_id)),
    [keepId],
    'la lecture attestée doit avoir migré vers le tutoriel conservé',
  );

  const policy = await queryAll(
    "SELECT resource_ref FROM resource_gating_policy WHERE resource_type = 'tutorial' AND resource_ref IN (?, ?)",
    [String(keepId), String(dropId)],
  );
  assert.deepStrictEqual(
    policy.map((r) => r.resource_ref),
    [String(keepId)],
    'la référence polymorphe doit avoir migré',
  );
});

test('la fusion est sans effet quand il n’y a rien à fusionner', async () => {
  const result = await withTransaction((tx) => mergeTutorialGroup(tx, keepId, []));
  assert.strictEqual(result.deleted, 0);
});
