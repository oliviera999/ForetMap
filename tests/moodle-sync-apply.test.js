'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const { runSync, resetProcessLockForTests } = require('../lib/moodle/syncRun');
const { undoRun } = require('../lib/moodle/undo');
const {
  dbFingerprint,
  diffFingerprints,
  userScopedTables,
  groupScopedTables,
} = require('./helpers/dbFingerprint');
const fx = require('./helpers/moodleFixtures');

let fake;
let client;
const stamp = Date.now();

async function apply(cohortIds, extra = {}) {
  return runSync({
    mode: 'apply',
    cohortIds,
    force: true,
    forceReason: 'test',
    deps: { client, settings: fx.buildSettings(extra.settings) },
    ...extra,
  });
}

async function dryRun(cohortIds) {
  return runSync({ mode: 'dry_run', cohortIds, deps: { client, settings: fx.buildSettings() } });
}

test.before(async () => {
  await initSchema();
  await fx.purgeSyncArtifacts();
  ({ fake, client } = await fx.startFakeMoodle());
});

test.after(async () => {
  await fake.stop();
  await fx.purgeSyncArtifacts();
});

test.beforeEach(() => resetProcessLockForTests());

test('garde des 24 h : apply sans simulation récente → 409 ; avec simulation → passe', async () => {
  fx.seedCohort(fake, {
    id: 610,
    idnumber: '26#610',
    name: `6e 10 ${stamp}`,
    members: [fx.member(5001, 'Garde', `Un${stamp}`)],
  });
  await assert.rejects(
    runSync({ mode: 'apply', cohortIds: [610], deps: { client, settings: fx.buildSettings() } }),
    (e) => e.status === 409 && /simulation/i.test(e.message),
  );
  await assert.rejects(
    runSync({
      mode: 'apply',
      cohortIds: [610],
      force: true,
      deps: { client, settings: fx.buildSettings() },
    }),
    (e) => e.status === 400,
    'force sans motif refusé',
  );
  const sim = await dryRun([610]);
  assert.strictEqual(sim.status, 'succeeded');
  const result = await runSync({
    mode: 'apply',
    cohortIds: [610],
    deps: { client, settings: fx.buildSettings() },
  });
  assert.strictEqual(result.status, 'succeeded');
  assert.strictEqual(result.report.basedOnDryRunId, sim.runId);
});

test('application : création, rapprochement, groupe, classe et joueur G&L ; puis idempotence', async () => {
  const existing = await fx.createStudent({
    firstName: 'Zoé',
    lastName: `Martin${stamp}`,
    email: `zoe.martin${stamp}@lyautey.test`,
  });
  const bridge = await fx.createStudent({
    firstName: 'Pont',
    lastName: `Gl${stamp}`,
    email: null,
    authProvider: 'gl_bridge',
    password: null,
  });
  const untouched = await fx.createStudent({
    firstName: 'Hors',
    lastName: `Moodle${stamp}`,
    email: `hors${stamp}@lyautey.test`,
  });
  const localGroup = await fx.createGroup({ name: `Club local ${stamp}` });
  await fx.addGroupMember(localGroup.id, untouched.id);

  fx.seedCohort(fake, {
    id: 603,
    idnumber: '26#603',
    name: `6e 3 ${stamp}`,
    members: [
      fx.member(1001, 'Zoé', `Martin${stamp}`, { email: existing.email }),
      fx.member(1002, 'Pont', `Gl${stamp}`),
      fx.member(1003, 'Neo', `Vu${stamp}`),
    ],
  });

  const untouchedBefore = await dbFingerprint(userScopedTables(untouched.id));
  const localGroupBefore = await dbFingerprint(groupScopedTables(localGroup.id));

  const result = await apply([603]);
  assert.strictEqual(
    result.status,
    'succeeded',
    JSON.stringify(result.report.applied?.failedCohorts),
  );
  const applied = result.report.applied;
  assert.strictEqual(applied.failedCohorts.length, 0);
  assert.ok(applied.actionsApplied >= 8);
  assert.strictEqual(applied.createdUsers, 1);

  // Groupe créé avec le rôle et le genre de la politique `classe6`.
  const eg = await queryOne(
    "SELECT * FROM external_groups WHERE provider = 'moodle' AND external_id = '603'",
  );
  assert.ok(eg, 'ligne external_groups');
  assert.strictEqual(eg.policy_key, 'classe6');
  assert.strictEqual(eg.master, 'moodle');
  const group = await queryOne('SELECT * FROM `groups` WHERE id = ?', [eg.group_id]);
  assert.strictEqual(group.kind, 'class');
  assert.strictEqual(group.name, `6e 3 ${stamp}`);
  const visitor = await queryOne("SELECT id FROM roles WHERE slug = 'visiteur'");
  assert.strictEqual(Number(group.default_role_id), Number(visitor.id));
  assert.strictEqual(Number(group.grants_n3beur_access), 0);

  // Classe G&L liée au groupe ; trois joueurs.
  const glClass = await queryOne('SELECT * FROM gl_classes WHERE id = ?', [eg.gl_class_id]);
  assert.ok(glClass);
  assert.strictEqual(glClass.foretmap_group_id, eg.group_id);
  const members = await queryAll('SELECT user_id FROM group_members WHERE group_id = ?', [
    eg.group_id,
  ]);
  assert.strictEqual(members.length, 3);
  const tracked = await queryAll(
    'SELECT user_id, source FROM external_group_members WHERE external_group_id = ?',
    [eg.id],
  );
  assert.strictEqual(tracked.length, 3);
  assert.ok(tracked.every((t) => t.source === 'sync'));
  const players = await queryAll(
    'SELECT linked_foretmap_user_id, class_id FROM gl_players WHERE class_id = ?',
    [glClass.id],
  );
  assert.strictEqual(players.length, 3);

  // Identités : rapproché par e-mail, `gl_bridge` → `moodle`, compte créé sans mot de passe.
  const idExisting = await queryOne("SELECT * FROM external_identities WHERE external_id = '1001'");
  assert.strictEqual(idExisting.user_id, existing.id);
  assert.strictEqual(idExisting.origin, 'linked');
  const bridgeAfter = await queryOne('SELECT auth_provider, email FROM users WHERE id = ?', [
    bridge.id,
  ]);
  assert.strictEqual(bridgeAfter.auth_provider, 'moodle');
  assert.strictEqual(bridgeAfter.email, `pont.gl${stamp}@lyautey.test`);
  const created = await queryOne(
    `SELECT u.* FROM users u INNER JOIN external_identities i ON i.user_id = u.id WHERE i.external_id = '1003'`,
  );
  assert.strictEqual(created.auth_provider, 'moodle');
  assert.strictEqual(created.password_hash, null);
  assert.strictEqual(created.first_name, 'Neo');
  assert.strictEqual(Number(created.is_active), 1);

  // Empreinte et journal.
  assert.ok(eg.members_hash);
  assert.deepStrictEqual(JSON.parse(eg.members_json).length, 3);
  const actions = await queryAll('SELECT kind FROM sync_actions WHERE run_id = ? ORDER BY seq', [
    result.runId,
  ]);
  assert.ok(actions.some((a) => a.kind === 'user.create'));
  assert.ok(actions.some((a) => a.kind === 'group.ensure'));
  assert.ok(actions.some((a) => a.kind === 'gl_class.ensure'));

  // Rien d'autre n'a bougé (I-4).
  assert.deepStrictEqual(
    diffFingerprints(untouchedBefore, await dbFingerprint(userScopedTables(untouched.id))),
    [],
  );
  assert.deepStrictEqual(
    diffFingerprints(localGroupBefore, await dbFingerprint(groupScopedTables(localGroup.id))),
    [],
  );

  // Effectifs croisés.
  const head = applied.postChecks.headcounts.find((h) => h.cohort === '26#603');
  assert.deepStrictEqual(
    { moodle: head.moodle, tracked: head.tracked, inGroup: head.inGroup },
    { moodle: 3, tracked: 3, inGroup: 3 },
  );

  // Idempotence : une seconde exécution ne produit aucune action.
  const before = await dbFingerprint();
  const second = await apply([603]);
  assert.strictEqual(second.status, 'succeeded');
  assert.strictEqual(second.report.totals.actions, 0);
  assert.strictEqual(second.report.applied.actionsApplied, 0);
  assert.deepStrictEqual(diffFingerprints(before, await dbFingerprint()), []);
});

test('comparaison à trois : retrait côté Moodle retire l’appartenance posée par la sync, jamais celle posée à la main', async () => {
  const eg = await queryOne("SELECT * FROM external_groups WHERE external_id = '603'");
  const manual = await fx.createStudent({
    firstName: 'Manu',
    lastName: `El${stamp}`,
    email: `manu${stamp}@lyautey.test`,
  });
  await fx.addGroupMember(eg.group_id, manual.id);

  // Neo (1003) quitte la cohorte Moodle ; Manu n'y est pas mais est dans le groupe à la main.
  fake.removeFromCohort(603, 1003);
  const result = await apply([603]);
  assert.strictEqual(result.status, 'succeeded');
  const kinds = result.report.actions.map((a) => a.kind);
  assert.ok(kinds.includes('group.member.remove'));
  const neo = await queryOne("SELECT user_id FROM external_identities WHERE external_id = '1003'");
  const neoMember = await queryOne(
    'SELECT 1 AS x FROM group_members WHERE group_id = ? AND user_id = ?',
    [eg.group_id, neo.user_id],
  );
  assert.strictEqual(neoMember, undefined, 'Neo retiré du groupe');
  const neoUser = await queryOne('SELECT is_active FROM users WHERE id = ?', [neo.user_id]);
  assert.strictEqual(
    Number(neoUser.is_active),
    0,
    'compte créé par la sync et parti : désactivé (jamais supprimé)',
  );
  const manuMember = await queryOne(
    'SELECT 1 AS x FROM group_members WHERE group_id = ? AND user_id = ?',
    [eg.group_id, manual.id],
  );
  assert.ok(manuMember, 'appartenance manuelle intacte (I-4)');

  // Neo revient : réactivation non automatique (le compte reste désactivé, listé), appartenance remise.
  fake.enrolInCohort(603, 1003);
  const back = await apply([603]);
  assert.strictEqual(back.status, 'succeeded');
  assert.ok(back.report.lists.inactiveInCohort.some((i) => i.user.userId === neo.user_id));
});

test('sync_exempt : un compte marqué hors synchronisation n’est ni écrit ni désactivé', async () => {
  const eg = await queryOne("SELECT * FROM external_groups WHERE external_id = '603'");
  const exemptUser = await fx.createStudent({
    firstName: 'Ex',
    lastName: `Empt${stamp}`,
    email: `ex${stamp}@lyautey.test`,
    syncExempt: 1,
  });
  fake.addUser(fx.member(1010, 'Ex', `Empt${stamp}`, { email: exemptUser.email }));
  fake.enrolInCohort(603, 1010);
  const before = await dbFingerprint(userScopedTables(exemptUser.id));
  const result = await apply([603]);
  assert.strictEqual(result.status, 'succeeded');
  assert.ok(result.report.lists.exempt.some((e) => e.member.externalId === '1010'));
  assert.deepStrictEqual(
    diffFingerprints(before, await dbFingerprint(userScopedTables(exemptUser.id))),
    [],
  );
  const member = await queryOne(
    'SELECT 1 AS x FROM group_members WHERE group_id = ? AND user_id = ?',
    [eg.group_id, exemptUser.id],
  );
  assert.strictEqual(member, undefined);
  fake.removeFromCohort(603, 1010);
});

test('groupe marqué hors synchronisation : cohorte ignorée avec alerte', async () => {
  const eg = await queryOne("SELECT * FROM external_groups WHERE external_id = '603'");
  await execute('UPDATE `groups` SET sync_exempt = 1 WHERE id = ?', [eg.group_id]);
  fake.addUser(fx.member(1011, 'Nouveau', `Pendant${stamp}`));
  fake.enrolInCohort(603, 1011);
  const result = await apply([603]);
  assert.strictEqual(result.status, 'succeeded');
  assert.ok(result.report.lists.alerts.some((a) => a.code === 'group_exempt'));
  assert.strictEqual(result.report.totals.actions, 0);
  await execute('UPDATE `groups` SET sync_exempt = 0 WHERE id = ?', [eg.group_id]);
  fake.removeFromCohort(603, 1011);
});

test('seuil dépassé sans force → aborted, rien d’écrit ; avec force → appliqué et journalisé', async () => {
  fx.seedCohort(fake, {
    id: 611,
    idnumber: '26#611',
    name: `6e 11 ${stamp}`,
    members: [fx.member(6001, 'Seuil', `A${stamp}`), fx.member(6002, 'Seuil', `B${stamp}`)],
  });
  const strict = { thresholds: { createPct: 0.0001 } };
  await dryRun([611]);
  const before = await dbFingerprint();
  const aborted = await runSync({
    mode: 'apply',
    cohortIds: [611],
    deps: { client, settings: fx.buildSettings(strict) },
  });
  assert.strictEqual(aborted.status, 'aborted');
  assert.deepStrictEqual(diffFingerprints(before, await dbFingerprint()), []);
  const forced = await runSync({
    mode: 'apply',
    cohortIds: [611],
    force: true,
    forceReason: 'rentrée : créations attendues',
    deps: { client, settings: fx.buildSettings(strict) },
  });
  assert.strictEqual(forced.status, 'succeeded');
  const run = await queryOne('SELECT scope_json FROM sync_runs WHERE id = ?', [forced.runId]);
  assert.match(run.scope_json, /rentrée : créations attendues/);
});

test('push_membership (n3) : ajout manuel dans le groupe poussé vers la cohorte, retrait manuel poussé aussi', async () => {
  const n3Student = await fx.createStudent({
    firstName: 'Enn',
    lastName: `Trois${stamp}`,
    email: `n3.${stamp}@lyautey.test`,
  });
  fx.seedCohort(fake, {
    id: 630,
    idnumber: '26#n3',
    name: `n3 ${stamp}`,
    members: [fx.member(7001, 'Enn', `Trois${stamp}`, { email: n3Student.email })],
  });
  const first = await apply([630]);
  assert.strictEqual(first.status, 'succeeded');
  const eg = await queryOne("SELECT * FROM external_groups WHERE external_id = '630'");
  const group = await queryOne('SELECT * FROM `groups` WHERE id = ?', [eg.group_id]);
  assert.strictEqual(Number(group.grants_n3beur_access), 1);
  const novice = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_novice'");
  assert.strictEqual(Number(group.default_role_id), Number(novice.id));
  const role = await queryOne(
    "SELECT r.slug FROM user_roles ur INNER JOIN roles r ON r.id = ur.role_id WHERE ur.user_type = 'student' AND ur.user_id = ? AND ur.is_primary = 1",
    [n3Student.id],
  );
  assert.strictEqual(role.slug, 'eleve_novice', 'rôle recalculé depuis le groupe n3');

  // Un élève déjà connu de Moodle (identité) ajouté à la main dans le groupe n3 → poussé vers la cohorte.
  const known = await queryOne(
    "SELECT user_id FROM external_identities WHERE external_id = '1001'",
  );
  await fx.addGroupMember(eg.group_id, known.user_id);
  fake.resetCalls();
  const second = await apply([630]);
  assert.strictEqual(second.status, 'succeeded');
  assert.strictEqual(second.report.outbound.length, 1);
  assert.strictEqual(second.report.outbound[0].kind, 'cohort.member.add');
  assert.strictEqual(second.report.applied.outbound.applied, 1);
  assert.deepStrictEqual(fake.cohortMembers(630), ['1001', '7001']);
  const outboundAction = await queryOne(
    "SELECT kind FROM sync_actions WHERE run_id = ? AND kind = 'cohort.member.add'",
    [second.runId],
  );
  assert.ok(outboundAction);

  // Retrait à la main côté ForetMap d'un membre suivi → retiré côté Moodle (le reflet a bougé).
  const third = await apply([630]); // stabilise : 1001 est maintenant suivi (sync) dans 630
  assert.strictEqual(third.status, 'succeeded');
  await execute('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', [
    eg.group_id,
    known.user_id,
  ]);
  const fourth = await apply([630]);
  assert.strictEqual(fourth.status, 'succeeded');
  assert.ok(fourth.report.outbound.some((o) => o.kind === 'cohort.member.remove'));
  assert.deepStrictEqual(fake.cohortMembers(630), ['7001']);
});

test('undo : l’exécution est rejouée à l’envers (comptes créés désactivés, groupe et classe retirés)', async () => {
  fx.seedCohort(fake, {
    id: 640,
    idnumber: '26#640',
    name: `6e 40 ${stamp}`,
    members: [fx.member(8001, 'Undo', `Un${stamp}`)],
  });
  const before = await dbFingerprint();
  const result = await apply([640]);
  assert.strictEqual(result.status, 'succeeded');
  const eg = await queryOne("SELECT * FROM external_groups WHERE external_id = '640'");
  const createdId = (
    await queryOne("SELECT user_id FROM external_identities WHERE external_id = '8001'")
  ).user_id;

  await assert.rejects(undoRun(result.runId - 1000), (e) => e.status === 404);
  const undone = await undoRun(result.runId, { client });
  assert.ok(undone.undone >= 5);
  assert.strictEqual(undone.deactivatedCreated, 1);
  const run = await queryOne('SELECT status FROM sync_runs WHERE id = ?', [result.runId]);
  assert.strictEqual(run.status, 'undone');
  assert.strictEqual(
    await queryOne('SELECT 1 AS x FROM `groups` WHERE id = ?', [eg.group_id]),
    undefined,
    'groupe vide supprimé',
  );
  assert.strictEqual(
    await queryOne('SELECT 1 AS x FROM gl_classes WHERE id = ?', [eg.gl_class_id]),
    undefined,
    'classe vide supprimée',
  );
  assert.strictEqual(
    await queryOne('SELECT 1 AS x FROM external_groups WHERE id = ?', [eg.id]),
    undefined,
  );
  const user = await queryOne('SELECT is_active FROM users WHERE id = ?', [createdId]);
  assert.strictEqual(Number(user.is_active), 0, 'compte créé désactivé, jamais supprimé (I-1)');
  assert.ok(
    await queryOne("SELECT 1 AS x FROM external_identities WHERE external_id = '8001'"),
    'identité conservée',
  );
  await assert.rejects(undoRun(result.runId), (e) => e.status === 409);
  const undoneActions = await queryOne(
    'SELECT COUNT(*) AS c FROM sync_actions WHERE run_id = ? AND undone_at IS NULL',
    [result.runId],
  );
  assert.strictEqual(Number(undoneActions.c), 0);

  // Seule différence attendue avec l'état initial : le compte créé (désactivé) et son identité.
  const after = await dbFingerprint();
  assert.deepStrictEqual(diffFingerprints(before, after), ['users']);
});

test('undo : refuse une simulation et une exécution plus ancienne qu’une exécution réelle postérieure', async () => {
  const sim = await dryRun([603]);
  await assert.rejects(undoRun(sim.runId), (e) => e.status === 409);
  const older = await queryOne(
    "SELECT id FROM sync_runs WHERE mode = 'apply' AND status = 'succeeded' ORDER BY id ASC LIMIT 1",
  );
  await assert.rejects(
    undoRun(older.id),
    (e) => e.status === 409 && /plus récente/.test(e.message),
  );
});
