'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const { runSync, resetProcessLockForTests } = require('../lib/moodle/syncRun');
const { listConflicts, resolveConflict } = require('../lib/moodle/conflicts');
const { listPendingMatches, resolvePendingMatch } = require('../lib/moodle/pendingMatches');
const { setExempt, listExempt } = require('../lib/moodle/exempt');
const fx = require('./helpers/moodleFixtures');

let fake;
let client;
const stamp = Date.now();

async function apply(cohortIds) {
  return runSync({
    mode: 'apply',
    cohortIds,
    force: true,
    forceReason: 'test',
    deps: { client, settings: fx.buildSettings() },
  });
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

test('conflit member_removed_on_mirror : ouvert une seule fois, résolu par keep_master (membre remis)', async () => {
  const a = await fx.createStudent({
    firstName: 'Con',
    lastName: `Flit${stamp}`,
    email: `con.flit${stamp}@lyautey.test`,
  });
  fx.seedCohort(fake, {
    id: 681,
    idnumber: '26#681',
    name: `6e 681 ${stamp}`,
    members: [fx.member(11001, 'Con', `Flit${stamp}`, { email: a.email })],
  });
  const first = await apply([681]);
  assert.strictEqual(first.status, 'succeeded');
  const eg = await queryOne("SELECT * FROM external_groups WHERE external_id = '681'");

  // Retiré à la main côté ForetMap alors que Moodle le garde : conflit (pas de push_membership pour classe6).
  await execute('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', [
    eg.group_id,
    a.id,
  ]);
  const second = await apply([681]);
  assert.strictEqual(second.status, 'succeeded');
  assert.strictEqual(second.report.conflicts.length, 1);
  assert.strictEqual(second.report.conflicts[0].kind, 'member_removed_on_mirror');
  assert.strictEqual(
    second.report.totals.actions,
    0,
    'aucune écriture : la décision revient à un humain',
  );

  const third = await apply([681]);
  assert.strictEqual(third.status, 'succeeded');
  const open = (await listConflicts()).filter((c) => c.externalGroupId === eg.id);
  assert.strictEqual(open.length, 1, 'pas de doublon d’une exécution à l’autre');
  assert.strictEqual(open[0].user.userId, a.id);
  assert.strictEqual(open[0].externalIdnumber, '26#681');

  const resolved = await resolveConflict(open[0].id, {
    resolution: 'keep_master',
    actorUserId: null,
  });
  assert.strictEqual(resolved.resolution, 'keep_master');
  assert.ok(resolved.resolvedAt);
  assert.ok(
    await queryOne('SELECT 1 AS x FROM group_members WHERE group_id = ? AND user_id = ?', [
      eg.group_id,
      a.id,
    ]),
    'membre remis',
  );
  await assert.rejects(
    resolveConflict(open[0].id, { resolution: 'ignore' }),
    (e) => e.status === 409,
  );
  const after = await apply([681]);
  assert.strictEqual(after.report.conflicts.length, 0, 'plus de divergence');
  assert.strictEqual(after.report.totals.actions, 0);
});

test('conflit member_added_on_mirror : ignore → l’ajout manuel devient le dernier état commun ; apply_other → poussé vers Moodle', async () => {
  const eg = await queryOne("SELECT * FROM external_groups WHERE external_id = '681'");
  const manual = await fx.createStudent({
    firstName: 'Manu',
    lastName: `Ajout${stamp}`,
    email: `manu.ajout${stamp}@lyautey.test`,
  });
  await fx.addGroupMember(eg.group_id, manual.id);
  const teacher = await fx.createTeacher({
    firstName: 'Prof',
    lastName: `Groupe${stamp}`,
    email: `prof.groupe${stamp}@lyautey.test`,
  });
  await fx.addGroupMember(eg.group_id, teacher.id, 'teacher');

  const run = await apply([681]);
  const added = run.report.conflicts.filter((c) => c.kind === 'member_added_on_mirror');
  assert.strictEqual(added.length, 1, 'l’enseignant ajouté au groupe n’est pas un conflit');
  assert.strictEqual(added[0].userId, manual.id);
  assert.ok(
    await queryOne('SELECT 1 AS x FROM group_members WHERE group_id = ? AND user_id = ?', [
      eg.group_id,
      manual.id,
    ]),
    'appartenance manuelle intacte (I-4)',
  );

  const open = (await listConflicts()).find(
    (c) => c.kind === 'member_added_on_mirror' && c.userId === manual.id,
  );
  assert.ok(open);
  await assert.rejects(
    resolveConflict(open.id, { resolution: 'apply_other', client: null }),
    (e) => e.status === 503,
  );
  await assert.rejects(
    resolveConflict(open.id, { resolution: 'apply_other', client }),
    (e) => e.status === 409 && /identité Moodle/.test(e.message),
  );

  const ignored = await resolveConflict(open.id, { resolution: 'ignore' });
  assert.strictEqual(ignored.resolution, 'ignore');
  const tracked = await queryOne(
    'SELECT source FROM external_group_members WHERE external_group_id = ? AND user_id = ?',
    [eg.id, manual.id],
  );
  assert.strictEqual(tracked.source, 'manual');
  const again = await apply([681]);
  assert.strictEqual(again.report.conflicts.length, 0, 'ignoré : plus redétecté en boucle');

  // Un membre connu de Moodle (identité) ajouté à la main → apply_other pousse vers la cohorte.
  const known = await fx.createStudent({
    firstName: 'Connu',
    lastName: `Moodle${stamp}`,
    email: `connu.moodle${stamp}@lyautey.test`,
  });
  fx.seedCohort(fake, {
    id: 682,
    idnumber: '26#682',
    name: `6e 682 ${stamp}`,
    members: [fx.member(11002, 'Connu', `Moodle${stamp}`, { email: known.email })],
  });
  await apply([682]);
  await fx.addGroupMember(eg.group_id, known.id);
  const r3 = await apply([681]);
  const c3 = r3.report.conflicts.find(
    (c) => c.kind === 'member_added_on_mirror' && c.userId === known.id,
  );
  assert.ok(c3);
  const openKnown = (await listConflicts()).find(
    (c) => c.kind === 'member_added_on_mirror' && c.userId === known.id,
  );
  const pushed = await resolveConflict(openKnown.id, { resolution: 'apply_other', client });
  assert.strictEqual(pushed.resolution, 'apply_other');
  assert.ok(fake.cohortMembers(681).includes('11002'), 'inscrit dans la cohorte Moodle');
  const r4 = await apply([681]);
  assert.strictEqual(r4.report.conflicts.length, 0, JSON.stringify(r4.report.conflicts));
});

test('conflit name_changed : renommage local → conflit ; keep_master rétablit le nom Moodle ; ignore garde le nom local', async () => {
  const eg = await queryOne("SELECT * FROM external_groups WHERE external_id = '681'");
  await execute('UPDATE `groups` SET name = ? WHERE id = ?', [`Ma 6e ${stamp}`, eg.group_id]);
  const run = await apply([681]);
  const nameConflict = run.report.conflicts.find((c) => c.kind === 'name_changed');
  assert.ok(nameConflict, JSON.stringify(run.report.conflicts));
  assert.ok(
    !run.report.actions.some((a) => a.kind === 'group.rename'),
    'pas de renommage automatique',
  );
  const open = (await listConflicts()).find(
    (c) => c.kind === 'name_changed' && c.externalGroupId === eg.id,
  );
  await assert.rejects(
    resolveConflict(open.id, { resolution: 'apply_other', client }),
    (e) => e.status === 409,
  );
  await resolveConflict(open.id, { resolution: 'keep_master' });
  assert.strictEqual(
    (await queryOne('SELECT name FROM `groups` WHERE id = ?', [eg.group_id])).name,
    `6e 681 ${stamp}`,
  );

  await execute('UPDATE `groups` SET name = ? WHERE id = ?', [`Ma 6e ${stamp}`, eg.group_id]);
  await apply([681]);
  const open2 = (await listConflicts()).find(
    (c) => c.kind === 'name_changed' && c.externalGroupId === eg.id,
  );
  await resolveConflict(open2.id, { resolution: 'ignore' });
  assert.strictEqual(
    (await queryOne('SELECT name FROM `groups` WHERE id = ?', [eg.group_id])).name,
    `Ma 6e ${stamp}`,
  );
  const after = await apply([681]);
  assert.strictEqual(after.report.conflicts.filter((c) => c.kind === 'name_changed').length, 0);

  // Renommage côté Moodle : propagé sans conflit.
  fake.state.cohorts.find((c) => c.id === 681).name = `6e 681 bis ${stamp}`;
  const renamed = await apply([681]);
  assert.ok(renamed.report.actions.some((a) => a.kind === 'group.rename'));
  assert.strictEqual(
    (await queryOne('SELECT name FROM `groups` WHERE id = ?', [eg.group_id])).name,
    `6e 681 bis ${stamp}`,
  );
});

test('rapprochements en attente : homonymes persistés à l’application, décision link / create / ignore', async () => {
  const h1 = await fx.createStudent({
    firstName: 'Homo',
    lastName: `Nyme${stamp}`,
    email: null,
    password: 'x1234567',
  });
  const h2 = await fx.createStudent({
    firstName: 'Homo',
    lastName: `Nyme${stamp}`,
    email: null,
    password: 'x1234567',
  });
  fx.seedCohort(fake, {
    id: 683,
    idnumber: '26#683',
    name: `6e 683 ${stamp}`,
    members: [
      fx.member(11003, 'Homo', `Nyme${stamp}`),
      fx.member(11004, 'Autre', `Homonyme${stamp}`),
      fx.member(11005, 'Troisieme', `Homonyme${stamp}`),
    ],
  });
  // 11004 : homonyme d'un compte unique mais on force l'ambiguïté en créant deux comptes à ce nom.
  await fx.createStudent({
    firstName: 'Autre',
    lastName: `Homonyme${stamp}`,
    email: null,
    password: 'x1234567',
  });
  await fx.createStudent({
    firstName: 'Autre',
    lastName: `Homonyme${stamp}`,
    email: null,
    password: 'x1234567',
  });
  await fx.createStudent({
    firstName: 'Troisieme',
    lastName: `Homonyme${stamp}`,
    email: null,
    password: 'x1234567',
  });
  await fx.createStudent({
    firstName: 'Troisieme',
    lastName: `Homonyme${stamp}`,
    email: null,
    password: 'x1234567',
  });

  const run = await apply([683]);
  assert.strictEqual(run.status, 'succeeded');
  assert.strictEqual(run.report.totals.pendingMatches, 3);
  assert.strictEqual(
    run.report.totals.creations,
    0,
    'un homonyme ambigu n’est jamais créé automatiquement',
  );
  const pending = (await listPendingMatches()).filter((p) => p.cohort === '26#683');
  assert.strictEqual(pending.length, 3);
  const p1 = pending.find((p) => p.externalId === '11003');
  assert.strictEqual(p1.candidates.length, 2);
  assert.ok(p1.candidates.some((c) => c.userId === h1.id));

  // Même membre à la prochaine exécution : la ligne est rafraîchie, pas dupliquée.
  await apply([683]);
  assert.strictEqual((await listPendingMatches()).filter((p) => p.cohort === '26#683').length, 3);

  // link
  await assert.rejects(resolvePendingMatch(p1.id, { resolution: 'link' }), (e) => e.status === 400);
  await assert.rejects(
    resolvePendingMatch(p1.id, { resolution: 'link', userId: 'inconnu' }),
    (e) => e.status === 404,
  );
  const linked = await resolvePendingMatch(p1.id, { resolution: 'link', userId: h1.id });
  assert.strictEqual(linked.resolution, 'link');
  assert.strictEqual(linked.resolvedUserId, h1.id);
  const identity = await queryOne(
    "SELECT user_id, origin FROM external_identities WHERE external_id = '11003'",
  );
  assert.strictEqual(identity.user_id, h1.id);
  assert.strictEqual(identity.origin, 'linked');
  assert.strictEqual(
    (await queryOne('SELECT email FROM users WHERE id = ?', [h1.id])).email,
    `homo.nyme${stamp}@lyautey.test`,
    'e-mail complété',
  );
  await assert.rejects(
    resolvePendingMatch(p1.id, { resolution: 'ignore' }),
    (e) => e.status === 409,
    'déjà tranché',
  );
  assert.strictEqual(
    (await queryOne('SELECT COUNT(*) AS c FROM external_identities WHERE user_id = ?', [h2.id])).c,
    0,
  );

  // create
  const p2 = pending.find((p) => p.externalId === '11004');
  const created = await resolvePendingMatch(p2.id, { resolution: 'create' });
  assert.ok(created.resolvedUserId);
  const newUser = await queryOne('SELECT auth_provider, first_name FROM users WHERE id = ?', [
    created.resolvedUserId,
  ]);
  assert.strictEqual(newUser.auth_provider, 'moodle');

  // ignore
  const p3 = pending.find((p) => p.externalId === '11005');
  const ignored = await resolvePendingMatch(p3.id, { resolution: 'ignore' });
  assert.strictEqual(ignored.resolution, 'ignore');

  // L'exécution suivante pose les appartenances des deux rattachés, et ne rouvre pas l'ignoré.
  const next = await apply([683]);
  assert.strictEqual(next.report.totals.pendingMatches, 1, 'l’ignoré reste listé dans le rapport');
  assert.strictEqual(
    (await listPendingMatches()).filter((p) => p.cohort === '26#683').length,
    0,
    'mais aucune ligne rouverte',
  );
  const eg = await queryOne("SELECT * FROM external_groups WHERE external_id = '683'");
  const members = await queryAll('SELECT user_id FROM group_members WHERE group_id = ?', [
    eg.group_id,
  ]);
  assert.deepStrictEqual(
    members.map((m) => m.user_id).sort(),
    [h1.id, created.resolvedUserId].sort(),
  );
});

test('exempt : marquer / démarquer un compte et un groupe, liste', async () => {
  const student = await fx.createStudent({
    firstName: 'Exempt',
    lastName: `Lib${stamp}`,
    email: `exempt.lib${stamp}@lyautey.test`,
  });
  const group = await fx.createGroup({ name: `Groupe exempt ${stamp}` });
  assert.strictEqual(
    (await setExempt({ targetType: 'user', targetId: 'nope', exempt: true })).ok,
    false,
  );
  assert.strictEqual(
    (await setExempt({ targetType: 'planet', targetId: student.id, exempt: true })).ok,
    false,
  );
  const u = await setExempt({ targetType: 'user', targetId: student.id, exempt: true });
  assert.deepStrictEqual(
    { ok: u.ok, exempt: u.exempt, previous: u.previous },
    { ok: true, exempt: true, previous: false },
  );
  const g = await setExempt({ targetType: 'group', targetId: group.id, exempt: true });
  assert.strictEqual(g.ok, true);
  const list = await listExempt();
  assert.ok(list.users.some((x) => x.userId === student.id));
  assert.ok(list.groups.some((x) => x.groupId === group.id));
  await setExempt({ targetType: 'user', targetId: student.id, exempt: false });
  await setExempt({ targetType: 'group', targetId: group.id, exempt: false });
  const after = await listExempt();
  assert.ok(!after.users.some((x) => x.userId === student.id));
  assert.ok(!after.groups.some((x) => x.groupId === group.id));
});
