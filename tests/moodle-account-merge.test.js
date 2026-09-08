'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const { planMerge, applyMerge, discoverForeignKeyRefs } = require('../lib/accountMerge');
const { undoRun } = require('../lib/moodle/undo');
const fx = require('./helpers/moodleFixtures');

const stamp = Date.now();

test.before(async () => {
  await initSchema();
});

test('discoverForeignKeyRefs : trouve les tables qui référencent users.id (group_members, external_identities, gl_players…)', async () => {
  const refs = await discoverForeignKeyRefs({ queryAll, queryOne });
  const keys = new Set(refs.map((r) => `${r.table}.${r.column}`));
  assert.ok(keys.has('external_identities.user_id'), [...keys].join(','));
  assert.ok(keys.has('gl_players.linked_foretmap_user_id'));
  assert.ok(
    refs.find((r) => r.table === 'gl_players')?.special,
    'gl_players traité à part (un joueur par compte)',
  );
});

test('planMerge : refuse les cas impossibles sans rien écrire', async () => {
  const a = await fx.createStudent({
    firstName: 'Plan',
    lastName: `A${stamp}`,
    email: `plan.a${stamp}@lyautey.test`,
  });
  const teacher = await fx.createTeacher({
    firstName: 'Prof',
    lastName: `Merge${stamp}`,
    email: `prof.merge${stamp}@lyautey.test`,
  });
  assert.strictEqual((await planMerge({ fromUserId: a.id, intoUserId: a.id })).status, 400);
  assert.strictEqual((await planMerge({ fromUserId: 'nope', intoUserId: a.id })).status, 404);
  const mixed = await planMerge({ fromUserId: a.id, intoUserId: teacher.id });
  assert.strictEqual(mixed.ok, true);
  assert.strictEqual(mixed.canApply, false);
  assert.ok(mixed.blockers.some((b) => b.code === 'user_type_mismatch'));
  const refused = await applyMerge({ fromUserId: a.id, intoUserId: teacher.id });
  assert.strictEqual(refused.ok, false);
  assert.strictEqual(refused.status, 409);
  assert.ok(
    await queryOne('SELECT 1 AS x FROM users WHERE id = ?', [a.id]),
    'aucun compte supprimé',
  );
});

test('applyMerge : réattribue groupes, identité externe et joueur G&L, complète les cases vides, supprime B, journalise', async () => {
  // A : compte cible (créé par la sync, sans mot de passe), B : ancien compte local avec mot de passe et contributions.
  const intoUser = await fx.createStudent({
    firstName: 'Cible',
    lastName: `Merge${stamp}`,
    email: null,
    password: null,
    authProvider: 'moodle',
  });
  const fromUser = await fx.createStudent({
    firstName: 'Ancien',
    lastName: `Merge${stamp}`,
    email: `ancien${stamp}@lyautey.test`,
  });
  const g1 = await fx.createGroup({ name: `Merge G1 ${stamp}` });
  const g2 = await fx.createGroup({ name: `Merge G2 ${stamp}` });
  await fx.addGroupMember(g1.id, fromUser.id);
  await fx.addGroupMember(g2.id, fromUser.id);
  await fx.addGroupMember(g2.id, intoUser.id); // doublon : la ligne de B sera abandonnée, pas dupliquée
  await execute(
    `INSERT INTO external_identities (user_id, provider, issuer, external_id, external_username, origin, linked_at, last_seen_at)
     VALUES (?, 'moodle', 'http://moodle.test', ?, 'ancien', 'linked', NOW(), NOW())`,
    [fromUser.id, `merge-${stamp}`],
  );
  const cls = await execute(
    'INSERT INTO gl_classes (name, is_active, created_at, updated_at) VALUES (?, 1, NOW(), NOW())',
    [`Classe merge ${stamp}`],
  );
  const player = await execute(
    `INSERT INTO gl_players (class_id, first_name, last_name, pseudo, linked_foretmap_user_id, is_active, created_at, updated_at)
     VALUES (?, 'Ancien', 'Merge', ?, ?, 1, NOW(), NOW())`,
    [cls.insertId, `ancien-merge-${stamp}`, fromUser.id],
  );

  const plan = await planMerge({ fromUserId: fromUser.id, intoUserId: intoUser.id });
  assert.strictEqual(plan.ok, true);
  assert.strictEqual(plan.canApply, true);
  assert.strictEqual(plan.fills.email, fromUser.email);
  assert.strictEqual(plan.fills.passwordHash, true);
  assert.deepStrictEqual(plan.glPlayer, { playerId: Number(player.insertId), reassigned: true });
  assert.ok(plan.tables.some((t) => t.table === 'group_members' && t.rows === 2));
  assert.ok(
    await queryOne('SELECT 1 AS x FROM users WHERE id = ?', [fromUser.id]),
    'planMerge n’écrit rien',
  );

  const result = await applyMerge({
    fromUserId: fromUser.id,
    intoUserId: intoUser.id,
    actorUserId: null,
  });
  assert.strictEqual(result.ok, true, JSON.stringify(result));
  assert.ok(result.runId);

  assert.strictEqual(
    await queryOne('SELECT 1 AS x FROM users WHERE id = ?', [fromUser.id]),
    undefined,
    'B supprimé',
  );
  const into = await queryOne(
    'SELECT email, password_hash, auth_provider FROM users WHERE id = ?',
    [intoUser.id],
  );
  assert.strictEqual(into.email, fromUser.email);
  assert.strictEqual(into.password_hash, fromUser.password_hash);
  assert.strictEqual(into.auth_provider, 'moodle', 'auth_provider de A conservé (pas gl_bridge)');
  const memberships = await queryAll(
    'SELECT group_id FROM group_members WHERE user_id = ? ORDER BY group_id',
    [intoUser.id],
  );
  assert.deepStrictEqual(memberships.map((m) => m.group_id).sort(), [g1.id, g2.id].sort());
  const dup = await queryOne(
    'SELECT COUNT(*) AS c FROM group_members WHERE group_id = ? AND user_id = ?',
    [g2.id, intoUser.id],
  );
  assert.strictEqual(Number(dup.c), 1);
  const identity = await queryOne('SELECT user_id FROM external_identities WHERE external_id = ?', [
    `merge-${stamp}`,
  ]);
  assert.strictEqual(identity.user_id, intoUser.id);
  const p = await queryOne('SELECT linked_foretmap_user_id FROM gl_players WHERE id = ?', [
    player.insertId,
  ]);
  assert.strictEqual(p.linked_foretmap_user_id, intoUser.id);

  const run = await queryOne('SELECT mode, status, scope_json FROM sync_runs WHERE id = ?', [
    result.runId,
  ]);
  assert.strictEqual(run.status, 'succeeded');
  assert.match(run.scope_json, /account_merge/);
  const actions = await queryAll('SELECT kind FROM sync_actions WHERE run_id = ? ORDER BY seq', [
    result.runId,
  ]);
  assert.strictEqual(actions[0].kind, 'account.merge');
  assert.strictEqual(actions[actions.length - 1].kind, 'account.merge.delete');
  await assert.rejects(undoRun(result.runId), (e) => e.status === 409 && /fusion/i.test(e.message));
});

test('applyMerge : deux joueurs G&L → bloqué', async () => {
  const a = await fx.createStudent({
    firstName: 'Deux',
    lastName: `A${stamp}`,
    email: `deux.a${stamp}@lyautey.test`,
  });
  const b = await fx.createStudent({
    firstName: 'Deux',
    lastName: `B${stamp}`,
    email: `deux.b${stamp}@lyautey.test`,
  });
  const cls = await execute(
    'INSERT INTO gl_classes (name, is_active, created_at, updated_at) VALUES (?, 1, NOW(), NOW())',
    [`Classe deux ${stamp}`],
  );
  for (const [u, suffix] of [
    [a, 'a'],
    [b, 'b'],
  ]) {
    await execute(
      `INSERT INTO gl_players (class_id, first_name, last_name, pseudo, linked_foretmap_user_id, is_active, created_at, updated_at)
       VALUES (?, 'Deux', ?, ?, ?, 1, NOW(), NOW())`,
      [cls.insertId, suffix, `deux-${suffix}-${stamp}`, u.id],
    );
  }
  const plan = await planMerge({ fromUserId: b.id, intoUserId: a.id });
  assert.strictEqual(plan.canApply, false);
  assert.ok(plan.blockers.some((x) => x.code === 'two_gl_players'));
  const result = await applyMerge({ fromUserId: b.id, intoUserId: a.id });
  assert.strictEqual(result.status, 409);
  assert.ok(await queryOne('SELECT 1 AS x FROM users WHERE id = ?', [b.id]));
});
